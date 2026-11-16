interface AttachmentEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
type Row = Record<string, unknown>;

function supabaseBase(env: AttachmentEnv): URL {
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
    throw new Error("INVALID_SUPABASE_URL");
  }
  return base;
}

async function authenticate(request: Request, env: AttachmentEnv): Promise<string | null> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const base = supabaseBase(env);
  const response = await fetch(new URL("/auth/v1/user", base), {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  return typeof user.id === "string" && /^[0-9a-f-]{36}$/i.test(user.id) ? user.id : null;
}

async function db<T>(env: AttachmentEnv, query: URLSearchParams): Promise<T> {
  const base = supabaseBase(env);
  const endpoint = new URL("/rest/v1/inbox_attachments", base);
  endpoint.search = query.toString();
  const response = await fetch(endpoint, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("INBOX_ATTACHMENT_LOOKUP_FAILED");
  return await response.json() as T;
}

function safeStoragePath(value: unknown): string[] | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048) return null;
  const segments = value.split("/");
  if (segments.length < 1 || segments.some(segment =>
    !segment || segment === "." || segment === ".." ||
    segment.length > 255 || /[\\\u0000-\u001f\u007f]/.test(segment)
  )) return null;
  return segments;
}

function resolveSignedUrl(value: unknown, base: URL, expectedObjectPath: string): string | null {
  if (typeof value !== "string" || !value || value.length > 8192) return null;
  let signed: URL;
  try {
    if (/^https?:\/\//i.test(value)) {
      signed = new URL(value);
    } else if (value.startsWith("/object/sign/")) {
      signed = new URL("/storage/v1" + value, base);
    } else if (value.startsWith("/storage/v1/object/sign/")) {
      signed = new URL(value, base);
    } else {
      return null;
    }
  } catch {
    return null;
  }
  const expectedPath = "/storage/v1/object/sign/inbox-attachments/" + expectedObjectPath;
  if (signed.origin !== base.origin || signed.protocol !== base.protocol ||
      signed.username || signed.password || signed.hash ||
      signed.pathname !== expectedPath || !signed.searchParams.has("token")) return null;
  return signed.toString();
}

export async function handleInboxAttachment(request: Request, env: AttachmentEnv): Promise<Response> {
  const match = new URL(request.url).pathname.match(/^\/api\/v1\/inbox\/attachments\/([0-9a-f-]{36})\/signed-url$/i);
  if (!match || request.method !== "GET") return new Response("Not Found", { status: 404 });

  try {
    const ownerId = await authenticate(request, env);
    if (!ownerId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const base = supabaseBase(env);
    const query = new URLSearchParams({
      select: "id,owner_id,storage_bucket,storage_path,scan_status,content_type,file_size_bytes",
      id: "eq." + match[1],
      owner_id: "eq." + ownerId,
      limit: "1",
    });
    const rows = await db<Row[]>(env, query);
    const attachment = rows[0];
    if (!attachment || attachment.owner_id !== ownerId) {
      return Response.json({ error: "ATTACHMENT_NOT_FOUND" }, { status: 404 });
    }
    if (attachment.storage_bucket !== "inbox-attachments") {
      return Response.json({ error: "ATTACHMENT_INVALID_STORAGE" }, { status: 409 });
    }
    if (attachment.scan_status !== "clean") {
      return Response.json({ error: "ATTACHMENT_NOT_READY" }, { status: 409 });
    }

    const pathSegments = safeStoragePath(attachment.storage_path);
    if (!pathSegments) return Response.json({ error: "ATTACHMENT_INVALID_STORAGE" }, { status: 409 });

    const objectPath = pathSegments.map(encodeURIComponent).join("/");
    const signEndpoint = new URL(
      "/storage/v1/object/sign/inbox-attachments/" + objectPath,
      base,
    );
    const signResponse = await fetch(signEndpoint, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 60 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!signResponse.ok) return Response.json({ error: "ATTACHMENT_SIGNING_FAILED" }, { status: 502 });
    const signed = await signResponse.json() as { signedURL?: string };
    const signedUrl = resolveSignedUrl(signed.signedURL, base, objectPath);
    if (!signedUrl) return Response.json({ error: "ATTACHMENT_SIGNING_FAILED" }, { status: 502 });

    return Response.json({
      id: attachment.id,
      url: signedUrl,
      content_type: attachment.content_type,
      file_size_bytes: attachment.file_size_bytes,
      expires_in: 60,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "ATTACHMENT_UNAVAILABLE" }, { status: 503 });
  }
}

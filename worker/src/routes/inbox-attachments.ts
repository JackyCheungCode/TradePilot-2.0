interface AttachmentEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
type Row = Record<string, unknown>;

async function authenticate(request: Request, env: AttachmentEnv): Promise<string | null> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\\s+(\\S+)$/i)?.[1];
  if (!token) return null;
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  return user.id ?? null;
}

async function db<T>(env: AttachmentEnv, path: string): Promise<T> {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("INBOX_ATTACHMENT_LOOKUP_FAILED");
  return await response.json() as T;
}

export async function handleInboxAttachment(request: Request, env: AttachmentEnv): Promise<Response> {
  const match = new URL(request.url).pathname.match(/^\\/api\\/v1\\/inbox\\/attachments\\/([0-9a-f-]{36})\\/signed-url$/i);
  if (!match || request.method !== "GET") return new Response("Not Found", { status: 404 });

  const ownerId = await authenticate(request, env);
  if (!ownerId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const rows = await db<Row[]>(env,
      "inbox_attachments?select=id,owner_id,storage_bucket,storage_path,scan_status,content_type,file_size_bytes& id=eq." +
      match[1] + "&owner_id=eq." + ownerId + "&limit=1");
    const attachment = rows[0];
    if (!attachment) return Response.json({ error: "ATTACHMENT_NOT_FOUND" }, { status: 404 });
    if (attachment.scan_status !== "clean") {
      return Response.json({ error: "ATTACHMENT_NOT_READY" }, { status: 409 });
    }

    const signResponse = await fetch(
      env.SUPABASE_URL + "/storage/v1/object/sign/" +
      encodeURIComponent(String(attachment.storage_bucket)) + "/" +
      String(attachment.storage_path).split("/").map(encodeURIComponent).join("/"),
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 60 }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!signResponse.ok) return Response.json({ error: "ATTACHMENT_SIGNING_FAILED" }, { status: 502 });
    const signed = await signResponse.json() as { signedURL?: string };
    if (!signed.signedURL) return Response.json({ error: "ATTACHMENT_SIGNING_FAILED" }, { status: 502 });
    const signedUrl = signed.signedURL.startsWith("http")
      ? signed.signedURL
      : env.SUPABASE_URL + "/storage/v1" + signed.signedURL;
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

import { errorResponse, successResponse } from "../lib/http";

interface InboxEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
type Row = Record<string, unknown>;

async function ownerFromRequest(request: Request, env: InboxEnv): Promise<string | null> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  return user.id ?? null;
}

async function db<T>(env: InboxEnv, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(12000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("INBOX_DATABASE_" + response.status + ": " + raw.slice(0, 240));
  return (raw ? JSON.parse(raw) : []) as T;
}

const unique = (values: unknown[]): string[] =>
  [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];

export async function handleInbox(request: Request, env: InboxEnv): Promise<Response> {
  const url = new URL(request.url);
  const ownerId = await ownerFromRequest(request, env);
  if (!ownerId) return errorResponse(request, "UNAUTHORIZED", "请先登录后访问消息工作台。", 401);
  if (request.method !== "GET" && request.method !== "POST") return errorResponse(request, "METHOD_NOT_ALLOWED", "当前消息接口暂不支持此操作。", 405);

  try {
    if (url.pathname === "/api/v1/inbox/conversations") {
      const status = url.searchParams.get("status");
      const allowedStatuses = new Set(["open", "pending", "resolved", "closed"]);
      const filters = [
        "select=id,owner_id,contact_id,account_id,assignee_id,status,unread_count,last_message_at,last_channel_type,last_message_preview,ai_summary,created_at,updated_at",
        "owner_id=eq." + ownerId,
        "order=last_message_at.desc.nullslast,updated_at.desc",
        "limit=100",
      ];
      if (status && allowedStatuses.has(status)) filters.push("status=eq." + status);
      const conversations = await db<Row[]>(env, "inbox_conversations?" + filters.join("&"));
      const contactIds = unique(conversations.map(row => row.contact_id));
      const accountIds = unique(conversations.map(row => row.account_id));
      const [contacts, accounts] = await Promise.all([
        contactIds.length
          ? db<Row[]>(env, "crm_contacts?select=id,account_id,first_name,last_name,full_name,job_title,department,email,phone,mobile,preferred_language,preferred_channel&id=in.(" + contactIds.join(",") + ")&owner_id=eq." + ownerId)
          : Promise.resolve([]),
        accountIds.length
          ? db<Row[]>(env, "crm_accounts?select=id,account_name,legal_name,logo_url&id=in.(" + accountIds.join(",") + ")&owner_id=eq." + ownerId)
          : Promise.resolve([]),
      ]);
      const contactById = new Map(contacts.map(row => [String(row.id), row]));
      const accountById = new Map(accounts.map(row => [String(row.id), row]));
      const data = conversations.map(row => {
        const contact = contactById.get(String(row.contact_id)) ?? null;
        const account = row.account_id ? accountById.get(String(row.account_id)) ?? null : null;
        const contactName = contact
          ? String(contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "")
          : "";
        return {
          ...row,
          contact,
          account,
          display_name: account?.account_name || contactName || "未命名联系人",
          contact_display_name: contactName,
        };
      });
      return successResponse(request, { conversations: data, total: data.length });
    }

    if (url.pathname === "/api/v1/inbox/channel-connections") {
      const connections = await db<Row[]>(env,
        "inbox_channel_connections?select=id,channel_type,display_name,external_account_id,connection_status,last_verified_at,last_error,created_at,updated_at&owner_id=eq." +
        ownerId + "&order=channel_type.asc");
      return successResponse(request, { connections });
    }

    const noteMatch = url.pathname.match(/^\/api\/v1\/inbox\/conversations\/([0-9a-f-]{36})\/notes$/i);
    if (noteMatch && request.method === "POST") {
      const conversationId = noteMatch[1];
      const owned = await db<Row[]>(env,
        "inbox_conversations?select=id&id=eq." + conversationId + "&owner_id=eq." + ownerId + "&limit=1");
      if (!owned.length) return errorResponse(request, "CONVERSATION_NOT_FOUND", "会话不存在或无权访问。", 404);
      let body: { content?: unknown; mentionedUserIds?: unknown };
      try { body = await request.json() as { content?: unknown; mentionedUserIds?: unknown }; }
      catch { return errorResponse(request, "INVALID_JSON", "备注内容格式不正确。", 400); }
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content || content.length > 10000) {
        return errorResponse(request, "VALIDATION_ERROR", "内部备注不能为空，且不能超过 10000 个字符。", 400);
      }
      const mentionedUserIds = Array.isArray(body.mentionedUserIds)
        ? body.mentionedUserIds.filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)).slice(0, 20)
        : [];
      const created = await db<Row[]>(env, "inbox_internal_notes?select=id,conversation_id,author_id,content,mentioned_user_ids,created_at", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          owner_id: ownerId,
          conversation_id: conversationId,
          author_id: ownerId,
          content,
          mentioned_user_ids: mentionedUserIds,
        }),
      });
      return successResponse(request, { note: created[0] ?? null }, 201);
    }

    const messageMatch = url.pathname.match(/^\/api\/v1\/inbox\/conversations\/([0-9a-f-]{36})\/messages$/i);
    if (messageMatch) {
      const conversationId = messageMatch[1];
      const owned = await db<Row[]>(env,
        "inbox_conversations?select=id&id=eq." + conversationId + "&owner_id=eq." + ownerId + "&limit=1");
      if (!owned.length) return errorResponse(request, "CONVERSATION_NOT_FOUND", "会话不存在或无权访问。", 404);
      const limitValue = Number(url.searchParams.get("limit") ?? "50");
      const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(100, Math.floor(limitValue))) : 50;
      const before = url.searchParams.get("before");
      const params = [
        "select=id,conversation_id,channel_type,direction,content_type,content,translated_content,source_language,target_language,email_subject,media_url,attachments,status,sent_at,delivered_at,read_at,created_at,metadata",
        "owner_id=eq." + ownerId,
        "conversation_id=eq." + conversationId,
        "order=created_at.desc,id.desc",
        "limit=" + limit,
      ];
      if (before && !Number.isNaN(Date.parse(before))) params.push("created_at=lt." + encodeURIComponent(before));
      const messages = await db<Row[]>(env, "inbox_messages?" + params.join("&"));
      const notes = await db<Row[]>(env,
        "inbox_internal_notes?select=id,conversation_id,author_id,content,mentioned_user_ids,created_at&owner_id=eq." +
        ownerId + "&conversation_id=eq." + conversationId + "&order=created_at.desc&limit=" + limit);
      const timeline = [
        ...messages.map(row => ({ ...row, timeline_type: "message" })),
        ...notes.map(row => ({ ...row, timeline_type: "internal_note", direction: "internal" })),
      ].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return successResponse(request, { items: timeline, has_more: messages.length === limit });
    }

    return errorResponse(request, "NOT_FOUND", "消息工作台接口不存在。", 404);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    return errorResponse(request, "INBOX_REQUEST_FAILED", "读取消息工作台数据失败，请稍后重试。", 500);
  }
}

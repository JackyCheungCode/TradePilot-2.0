import { getSupabaseClient } from '@/lib/supabase';

export type InboxChannel = 'whatsapp' | 'line' | 'messenger' | 'telegram' | 'email' | 'wecom';
export interface InboxIdentity {
  id: string;
  channel_type: InboxChannel;
  external_user_id: string;
  external_display_name?: string | null;
  external_username?: string | null;
  is_primary: boolean;
  last_seen_at?: string | null;
  channel_connection_id?: string | null;
}
export interface InboxContact {
  id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  preferred_language?: string | null;
  preferred_channel?: string | null;
}
export interface InboxConversation {
  id: string;
  contact_id: string;
  account_id?: string | null;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  unread_count: number;
  last_message_at?: string | null;
  last_channel_type?: InboxChannel | null;
  last_message_preview?: string | null;
  contact?: InboxContact | null;
  account?: { account_name?: string | null; industry?: string | null; website?: string | null } | null;
  identities: InboxIdentity[];
  display_name: string;
  contact_display_name: string;
}
export interface InboxMessage {
  id: string;
  conversation_id: string;
  channel_type: InboxChannel;
  direction: 'inbound' | 'outbound' | 'internal';
  content_type: 'text' | 'image' | 'file' | 'audio' | 'video' | 'template' | 'email_card';
  content: string;
  email_subject?: string | null;
  media_url?: string | null;
  attachments?: Array<{ id: string; original_file_name: string; content_type: string; file_size_bytes: number; scan_status: string }>;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'received' | 'failed';
  created_at: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  timeline_type?: 'message' | 'internal_note';
}
export interface InboxConnection {
  id: string;
  channel_type: InboxChannel;
  display_name: string;
  external_account_id?: string | null;
  connection_status: 'not_connected' | 'pending' | 'connected' | 'error' | 'disabled';
  last_verified_at?: string | null;
  webhook_url?: string | null;
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error as { message?: string } | undefined;
    throw new Error(error?.message ?? String(payload.message ?? `消息服务请求失败（${response.status}）`));
  }
  return (payload.data ?? payload.result ?? payload) as T;
}

export async function getInboxSessionToken(): Promise<string> {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('登录状态已失效，请重新登录。');
  return token;
}

export async function getInboxConversations(token: string): Promise<InboxConversation[]> {
  const result = await request<{ conversations: InboxConversation[] }>('/api/v1/inbox/conversations', token);
  return result.conversations ?? [];
}

export async function getInboxConnections(token: string): Promise<InboxConnection[]> {
  const result = await request<{ connections: InboxConnection[] }>('/api/v1/inbox/channel-connections', token);
  return result.connections ?? [];
}

export async function getInboxMessages(token: string, conversationId: string): Promise<InboxMessage[]> {
  const result = await request<{ items: InboxMessage[] }>(
    `/api/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`, token,
  );
  return (result.items ?? []).filter((item) => item.timeline_type !== 'internal_note');
}

export function sendInboxMessage(token: string, conversationId: string, channelType: InboxChannel, content: string): Promise<{ message: InboxMessage }> {
  return request<{ message: InboxMessage }>(
    `/api/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    token,
    { method: 'POST', body: JSON.stringify({ content, channelType }) },
  );
}

export function updateInboxConversation(token: string, conversationId: string, patch: { status?: 'open' | 'pending' | 'resolved' | 'closed'; markRead?: boolean }): Promise<{ conversation: InboxConversation }> {
  return request<{ conversation: InboxConversation }>(
    `/api/v1/inbox/conversations/${encodeURIComponent(conversationId)}`,
    token,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
}

export interface InboxCrmContact {
  id: string;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  account_id?: string | null;
}
export async function searchInboxCrmContacts(token: string, query: string): Promise<InboxCrmContact[]> {
  const result = await request<{ contacts: InboxCrmContact[] }>(
    `/api/v1/inbox/crm-contacts?query=${encodeURIComponent(query)}`, token,
  );
  return result.contacts ?? [];
}
export async function createInboxConversation(token: string, contactId: string): Promise<void> {
  await request<{ conversation: InboxConversation }>(
    '/api/v1/inbox/conversations', token,
    { method: 'POST', body: JSON.stringify({ contactId }) },
  );
}

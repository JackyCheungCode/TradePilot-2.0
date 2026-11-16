export interface InboxContact {
  id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  preferred_language?: string | null;
  account_id?: string | null;
}
export interface InboxAccount {
  id: string;
  account_name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
}
export interface InboxConversation {
  id: string;
  contact_id: string;
  account_id?: string | null;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  unread_count: number;
  last_message_at?: string | null;
  last_channel_type?: string | null;
  last_message_preview?: string | null;
  ai_summary?: string | null;
  display_name: string;
  contact_display_name: string;
  contact: InboxContact | null;
  account: InboxAccount | null;
}
export interface InboxTimelineItem {
  id: string;
  timeline_type: 'message' | 'internal_note';
  channel_type?: string;
  direction?: 'inbound' | 'outbound' | 'internal';
  content_type?: string;
  content: string;
  translated_content?: string | null;
  source_language?: string | null;
  email_subject?: string | null;
  status?: string;
  created_at: string;
}
export interface InboxConnection {
  id: string;
  channel_type: string;
  display_name: string;
  connection_status: string;
}

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
  });
  const payload = await response.json().catch(() => ({})) as {
    data?: T;
    error?: { message?: string };
    message?: string;
  };
  if (!response.ok) throw new Error(payload.error?.message ?? payload.message ?? '消息工作台请求失败。');
  return (payload.data ?? payload) as T;
}

export async function getInboxConversations(token: string): Promise<InboxConversation[]> {
  const result = await request<{ conversations: InboxConversation[] }>('/api/v1/inbox/conversations', token);
  return result.conversations ?? [];
}
export async function getInboxMessages(token: string, conversationId: string): Promise<InboxTimelineItem[]> {
  const result = await request<{ items: InboxTimelineItem[] }>(
    '/api/v1/inbox/conversations/' + encodeURIComponent(conversationId) + '/messages',
    token,
  );
  return result.items ?? [];
}
export async function getInboxConnections(token: string): Promise<InboxConnection[]> {
  const result = await request<{ connections: InboxConnection[] }>('/api/v1/inbox/channel-connections', token);
  return result.connections ?? [];
}

export async function createInboxNote(token: string, conversationId: string, content: string): Promise<unknown> {
  const response = await fetch('/api/v1/inbox/conversations/' + encodeURIComponent(conversationId) + '/notes', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  const payload = await response.json().catch(() => ({})) as {
    data?: { note?: unknown };
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message ?? '添加内部备注失败。');
  return payload.data?.note ?? null;
}

export interface InboxBusinessMetrics {
  total_order_count: number;
  active_order_count: number;
  total_amount_by_currency: Array<{ currency: string; amount: number }>;
  shipment_count: number;
  payment_count: number;
  monthly_trend: Array<{
    period: string;
    order_count: number;
    amount_by_currency: Array<{ currency: string; amount: number }>;
  }>;
}
export async function getInboxBusinessMetrics(token: string, contactId: string): Promise<InboxBusinessMetrics> {
  return request<InboxBusinessMetrics>(
    '/api/v1/inbox/customers/' + encodeURIComponent(contactId) + '/business-metrics',
    token,
  );
}

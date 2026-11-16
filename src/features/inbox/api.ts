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
  target_language?: string | null;
  email_subject?: string | null;
  status?: string;
  created_at: string;
}
export interface InboxConnection {
  id: string;
  channel_type: string;
  display_name: string;
  external_account_id?: string | null;
  connection_status: string;
  webhook_url?: string | null;
}
export interface InboxUnmatchedEvent {
  id: string;
  channel_type: string;
  external_event_id: string;
  status: string;
  payload: {
    externalUserId?: string;
    displayName?: string | null;
    username?: string | null;
    content?: string;
    occurredAt?: string;
  };
  received_at: string;
}
export interface InboxCRMContact {
  id: string;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
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

export async function createInboxConnection(
  token: string,
  input: { channelType: string; displayName: string; externalAccountId: string },
): Promise<{ connection: InboxConnection; webhook_url: string }> {
  const response = await fetch('/api/v1/inbox/channel-connections', {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({})) as {
    data?: { connection: InboxConnection; webhook_url: string };
    error?: { message?: string };
  };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? '创建渠道连接失败。');
  return payload.data;
}

export async function getInboxUnmatchedEvents(token: string): Promise<InboxUnmatchedEvent[]> {
  const result = await request<{ events: InboxUnmatchedEvent[] }>('/api/v1/inbox/unmatched-events', token);
  return result.events ?? [];
}

export async function searchInboxCRMContacts(token: string, query: string): Promise<InboxCRMContact[]> {
  const result = await request<{ contacts: InboxCRMContact[] }>(
    '/api/v1/inbox/crm-contacts?query=' + encodeURIComponent(query), token,
  );
  return result.contacts ?? [];
}

export async function assignInboxUnmatchedEvent(token: string, eventId: string, contactId: string): Promise<void> {
  const response = await fetch('/api/v1/inbox/unmatched-events/' + encodeURIComponent(eventId) + '/assign', {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? '关联 CRM 联系人失败。');
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

export type InboxChannelReadiness = Record<string, boolean>;
export async function getInboxChannelReadiness(token: string): Promise<InboxChannelReadiness> {
  return request<InboxChannelReadiness>('/api/v1/settings/integrations', token);
}

export async function translateInboxMessage(token: string, messageId: string): Promise<void> {
  await request<unknown>(
    '/api/v1/inbox/messages/' + encodeURIComponent(messageId) + '/translate',
    token,
  );
}

export async function generateInboxSummary(token: string, conversationId: string): Promise<string> {
  const result = await request<{ ai_summary: string }>(
    '/api/v1/inbox/conversations/' + encodeURIComponent(conversationId) + '/summary',
    token,
  );
  return result.ai_summary;
}

export async function sendInboxMessage(token: string, conversationId: string, content: string): Promise<InboxTimelineItem> {
  const response = await fetch('/api/v1/inbox/conversations/' + encodeURIComponent(conversationId) + '/messages', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  const payload = await response.json().catch(() => ({})) as {
    data?: { message?: InboxTimelineItem };
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message ?? '发送消息失败。');
  if (!payload.data?.message) throw new Error('渠道未返回发送结果。');
  return { ...payload.data.message, timeline_type: 'message' };
}

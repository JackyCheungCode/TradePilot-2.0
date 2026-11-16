export type ChannelType = 'whatsapp' | 'line' | 'messenger' | 'telegram' | 'wecom' | 'email';
export type ConversationStatus = 'open' | 'pending' | 'resolved';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'local';
export type ContentType = 'text' | 'image' | 'file' | 'template' | 'email_card';

export interface Customer {
  id: string; company_name: string | null; contact_name: string; role: string;
  avatar: string; email: string; phone: string; tags: string[];
}
export interface CustomerIdentity {
  id: string; customer_id: string; channel_type: ChannelType; external_user_id: string;
  window_expires_at: number | null; is_primary: boolean;
}
export interface Conversation {
  id: string; customer_id: string; assignee_id: string; status: ConversationStatus;
  unread_count: number; last_message_at: number; last_channel_type: ChannelType;
}
export interface Message {
  id: string; conversation_id: string; customer_id: string; channel_type: ChannelType;
  direction: 'inbound' | 'outbound'; content_type: ContentType; content: string;
  email_subject?: string; media_url?: string; file_meta?: { filename: string; size: number };
  status: MessageStatus; created_at: number;
}
const ago = (minutes: number) => Date.now() - minutes * 60_000;
export const channelLabels: Record<ChannelType, string> = {
  whatsapp: 'WhatsApp', line: 'LINE', messenger: 'Messenger', telegram: 'Telegram', wecom: '微信', email: 'Email',
};
export const channelColors: Record<ChannelType, string> = {
  whatsapp: 'green', line: 'green', messenger: 'blue', telegram: 'purple', wecom: 'cyan', email: 'gray',
};
export const customersSeed: Customer[] = [
  { id: 'cus-a', company_name: 'Nordic Mobility AB', contact_name: 'Erik Andersson', role: '采购经理', avatar: 'EA', email: 'erik@nordicmobility.se', phone: '+46 70 123 4567', tags: ['VIP', '轮毂采购', '老客户'] },
  { id: 'cus-b', company_name: 'Berlin Auto GmbH', contact_name: 'Lena Fischer', role: 'CEO', avatar: 'LF', email: 'lena@berlinauto.de', phone: '+49 30 555 0182', tags: ['潜在客户', '汽车配件'] },
  { id: 'cus-c', company_name: 'Tokyo Parts株式会社', contact_name: '田中 健太', role: '采购经理', avatar: '田', email: 'k.tanaka@tokyoparts.jp', phone: '+81 3 4567 8901', tags: ['重点跟进', '轮毂采购'] },
  { id: 'cus-d', company_name: 'Pacific Trade Co.', contact_name: 'Sophie Chen', role: '财务经理', avatar: 'SC', email: 'sophie@pacifictrade.com', phone: '+65 6123 4567', tags: ['财务', '新客户'] },
];
export const identitiesSeed: CustomerIdentity[] = [
  { id: 'id-a1', customer_id: 'cus-a', channel_type: 'email', external_user_id: 'erik@nordicmobility.se', window_expires_at: null, is_primary: true },
  { id: 'id-a2', customer_id: 'cus-a', channel_type: 'wecom', external_user_id: 'wxid_nordic_erik', window_expires_at: null, is_primary: false },
  { id: 'id-a3', customer_id: 'cus-a', channel_type: 'whatsapp', external_user_id: '+46701234567', window_expires_at: null, is_primary: false },
  { id: 'id-b1', customer_id: 'cus-b', channel_type: 'whatsapp', external_user_id: '+49305550182', window_expires_at: null, is_primary: true },
  { id: 'id-c1', customer_id: 'cus-c', channel_type: 'line', external_user_id: 'tanaka_tokyo', window_expires_at: null, is_primary: true },
  { id: 'id-c2', customer_id: 'cus-c', channel_type: 'email', external_user_id: 'k.tanaka@tokyoparts.jp', window_expires_at: null, is_primary: false },
  { id: 'id-d1', customer_id: 'cus-d', channel_type: 'messenger', external_user_id: 'sophie.pacific', window_expires_at: null, is_primary: true },
];
export const conversationsSeed: Conversation[] = [
  { id: 'conv-a', customer_id: 'cus-a', assignee_id: 'me', status: 'open', unread_count: 0, last_message_at: ago(12), last_channel_type: 'wecom' },
  { id: 'conv-b', customer_id: 'cus-b', assignee_id: 'alex', status: 'pending', unread_count: 2, last_message_at: ago(1450), last_channel_type: 'whatsapp' },
  { id: 'conv-c', customer_id: 'cus-c', assignee_id: 'me', status: 'open', unread_count: 3, last_message_at: ago(35), last_channel_type: 'line' },
  { id: 'conv-d', customer_id: 'cus-d', assignee_id: 'jane', status: 'resolved', unread_count: 0, last_message_at: ago(360), last_channel_type: 'messenger' },
];
export const messagesSeed: Message[] = [
  { id: 'm-a1', conversation_id: 'conv-a', customer_id: 'cus-a', channel_type: 'email', direction: 'inbound', content_type: 'email_card', email_subject: 'RFQ – 18 inch alloy wheels / Q4 supply', content: 'Dear TradePilot team,\n\nPlease find our Q4 forecast attached. We would appreciate your best FOB pricing for 2,400 sets, including packaging details and lead time.\n\nBest regards, Erik', status: 'read', created_at: ago(180) },
  { id: 'm-a2', conversation_id: 'conv-a', customer_id: 'cus-a', channel_type: 'wecom', direction: 'inbound', content_type: 'text', content: '你好，我们希望确认一下新一批轮毂的交期。', status: 'read', created_at: ago(48) },
  { id: 'm-a3', conversation_id: 'conv-a', customer_id: 'cus-a', channel_type: 'wecom', direction: 'outbound', content_type: 'text', content: '没问题，生产计划已经预留，预计 25 天完成。', status: 'read', created_at: ago(42) },
  { id: 'm-a4', conversation_id: 'conv-a', customer_id: 'cus-a', channel_type: 'email', direction: 'outbound', content_type: 'file', content: '已发送正式报价单，请查收。', file_meta: { filename: 'Quotation_Nordic_Q4.pdf', size: 2480000 }, status: 'delivered', created_at: ago(22) },
  { id: 'm-a5', conversation_id: 'conv-a', customer_id: 'cus-a', channel_type: 'wecom', direction: 'inbound', content_type: 'text', content: '收到，谢谢！我会和团队确认。', status: 'read', created_at: ago(12) },
  { id: 'm-b1', conversation_id: 'conv-b', customer_id: 'cus-b', channel_type: 'whatsapp', direction: 'inbound', content_type: 'text', content: 'Could you send your latest product catalogue?', status: 'read', created_at: ago(1450) },
  { id: 'm-c1', conversation_id: 'conv-c', customer_id: 'cus-c', channel_type: 'line', direction: 'inbound', content_type: 'text', content: '次回の出荷スケジュールを確認したいです。', status: 'read', created_at: ago(55) },
  { id: 'm-c2', conversation_id: 'conv-c', customer_id: 'cus-c', channel_type: 'line', direction: 'outbound', content_type: 'text', content: '出荷予定を確認して、本日中にご連絡します。', status: 'failed', created_at: ago(35) },
  { id: 'm-d1', conversation_id: 'conv-d', customer_id: 'cus-d', channel_type: 'messenger', direction: 'inbound', content_type: 'text', content: 'Payment confirmation received. Thank you!', status: 'read', created_at: ago(360) },
];
export const assignees = [{ id: 'me', label: '我（Justin）' }, { id: 'alex', label: 'Alex Chen' }, { id: 'jane', label: 'Jane Wu' }];

export type CommunicationChannel = 'whatsapp' | 'messenger' | 'instagram' | 'email' | 'telegram' | 'line' | 'wecom';
export type ConversationState = 'open' | 'pending' | 'resolved';
export type MessageKind = 'text' | 'email' | 'file' | 'system';

export interface CommunicationCustomer {
  id: string;
  company: string;
  contact: string;
  avatarUrl?: string;
  role: string;
  email: string;
  phone: string;
  region: string;
  industry?: string;
  website?: string;
  tags: string[];
  identities: { channel: CommunicationChannel; account: string }[];
}
export interface CommunicationConversation {
  id: string;
  customerId: string;
  state: ConversationState;
  unread: number;
  channel: CommunicationChannel;
  updatedAt: number;
  preview: string;
}
export interface CommunicationMessage {
  id: string;
  conversationId: string;
  channel: CommunicationChannel;
  direction: 'inbound' | 'outbound' | 'system';
  kind: MessageKind;
  body: string;
  time: number;
  status?: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'received' | 'failed';
  subject?: string;
  filename?: string;
  fileSize?: string;
  translatedBody?: string;
  attachments?: { id: string; filename: string; contentType: string; scanStatus: string }[];
}

const minutesAgo = (minutes: number) => Date.now() - minutes * 60_000;

export const communicationChannelLabels: Record<CommunicationChannel, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Facebook Messenger',
  instagram: 'Instagram',
  email: '电子邮件',
  telegram: 'Telegram',
  line: 'LINE',
  wecom: '企业微信',
};

export const communicationCustomers: CommunicationCustomer[] = [
  {
    id: 'customer-nordic',
    company: 'Nordic Mobility AB',
    contact: 'Erik Andersson',
    role: '采购经理',
    email: 'erik@nordicmobility.se',
    phone: '+46 70 123 4567',
    region: '瑞典 · 北欧',
    tags: ['重点客户', '轮毂采购', '长期合作'],
    identities: [
      { channel: 'whatsapp', account: '+46 70 123 4567' },
      { channel: 'email', account: 'erik@nordicmobility.se' },
    ],
  },
  {
    id: 'customer-berlin',
    company: 'Berlin Auto GmbH',
    contact: 'Lena Fischer',
    role: 'Managing Director',
    email: 'lena@berlinauto.de',
    phone: '+49 30 555 0182',
    region: '德国 · 欧洲',
    tags: ['潜在客户', '汽车配件'],
    identities: [
      { channel: 'whatsapp', account: '+49 30 555 0182' },
      { channel: 'messenger', account: 'Lena Fischer' },
    ],
  },
  {
    id: 'customer-pacific',
    company: 'Pacific Trade Co.',
    contact: 'Sophie Chen',
    role: '商务经理',
    email: 'sophie@pacifictrade.com',
    phone: '+65 6123 4567',
    region: '新加坡 · 东南亚',
    tags: ['新客户', '报价跟进'],
    identities: [
      { channel: 'instagram', account: '@sophie.pacific' },
      { channel: 'email', account: 'sophie@pacifictrade.com' },
    ],
  },
  {
    id: 'customer-tokyo',
    company: 'Tokyo Parts株式会社',
    contact: '田中 健太',
    role: '采购负责人',
    email: 'k.tanaka@tokyoparts.jp',
    phone: '+81 3 4567 8901',
    region: '日本 · 东亚',
    tags: ['待跟进', '电子邮件'],
    identities: [
      { channel: 'telegram', account: '@tanaka_parts' },
      { channel: 'email', account: 'k.tanaka@tokyoparts.jp' },
    ],
  },
];

export const communicationConversations: CommunicationConversation[] = [
  { id: 'conversation-nordic', customerId: 'customer-nordic', state: 'open', unread: 2, channel: 'whatsapp', updatedAt: minutesAgo(8), preview: 'Could you confirm the lead time for the next shipment?' },
  { id: 'conversation-berlin', customerId: 'customer-berlin', state: 'pending', unread: 0, channel: 'messenger', updatedAt: minutesAgo(52), preview: 'Please send the latest product catalogue.' },
  { id: 'conversation-pacific', customerId: 'customer-pacific', state: 'open', unread: 1, channel: 'instagram', updatedAt: minutesAgo(145), preview: 'We are interested in your new product range.' },
  { id: 'conversation-tokyo', customerId: 'customer-tokyo', state: 'resolved', unread: 0, channel: 'email', updatedAt: minutesAgo(390), preview: 'Thank you for the quotation. We will review it.' },
];

export const communicationMessages: CommunicationMessage[] = [
  { id: 'nordic-1', conversationId: 'conversation-nordic', channel: 'email', direction: 'inbound', kind: 'email', subject: 'Q4 supply forecast and quotation request', body: 'Dear TradePilot team,\n\nPlease confirm your best FOB pricing for 2,400 sets and the estimated production lead time.\n\nBest regards, Erik', time: minutesAgo(180), status: 'read' },
  { id: 'nordic-2', conversationId: 'conversation-nordic', channel: 'whatsapp', direction: 'inbound', kind: 'text', body: 'Hello, could you confirm the lead time for the next shipment?', time: minutesAgo(18), status: 'read' },
  { id: 'nordic-3', conversationId: 'conversation-nordic', channel: 'whatsapp', direction: 'outbound', kind: 'text', body: 'Certainly. I am checking the production schedule and will confirm shortly.', time: minutesAgo(12), status: 'delivered' },
  { id: 'nordic-4', conversationId: 'conversation-nordic', channel: 'whatsapp', direction: 'inbound', kind: 'file', body: 'Updated shipment requirements', filename: 'Shipment_Requirements.pdf', fileSize: '1.8 MB', time: minutesAgo(8), status: 'read' },
  { id: 'berlin-1', conversationId: 'conversation-berlin', channel: 'messenger', direction: 'inbound', kind: 'text', body: 'Please send the latest product catalogue.', time: minutesAgo(52), status: 'read' },
  { id: 'pacific-1', conversationId: 'conversation-pacific', channel: 'instagram', direction: 'inbound', kind: 'text', body: 'We are interested in your new product range. Could you share more details?', time: minutesAgo(145), status: 'read' },
  { id: 'tokyo-1', conversationId: 'conversation-tokyo', channel: 'email', direction: 'inbound', kind: 'email', subject: 'Re: Product quotation', body: 'Thank you for the quotation. We will review it with our purchasing team and get back to you.', time: minutesAgo(390), status: 'read' },
];

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { Button, semanticIcons, Dropdown, Search, TextArea, TextInput } from '@/design-system';

type Channel = 'whatsapp' | 'messenger' | 'instagram' | 'email' | 'telegram' | 'wechat' | 'line';
type Filter = 'all' | 'unread' | 'pending' | 'resolved';
type ChannelFilter = 'all' | Channel;
type Customer = {
  id: string;
  name: string;
  company: string;
  role: string;
  country: string;
  email: string;
  phone: string;
  tags: string[];
  status: 'pending' | 'resolved';
  unread: number;
  lastActivityAt: number;
  lastPreview: string;
  lastChannel?: Channel;
  latestConversationId: string | null;
  aiSummary?: string;
};
type Identity = { id: string; customerId: string; channel: Channel; handle: string; account: string; connected: boolean };
type Message = {
  id: string;
  conversationId: string;
  customerId: string;
  channel: Channel;
  direction: 'inbound' | 'outbound';
  body: string;
  timestamp: number;
  status: 'read' | 'delivered' | 'sent' | 'local' | 'failed';
  subject?: string;
  attachment?: string;
  translatedContent?: string;
};

const channelNames: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  email: 'Email',
  telegram: 'Telegram',
  wechat: 'WeChat',
  line: 'LINE',
};
type ContactDbRow = {
  id: string; first_name: string | null; last_name: string | null; full_name: string | null;
  job_title: string | null; decision_role: string | null; email: string | null; phone: string | null;
  mobile: string | null; is_active: boolean; is_archived: boolean; updated_at: string;
  custom_fields: Record<string, unknown> | null;
  crm_accounts?: { account_name?: string | null; country_code?: string | null } | null;
};
type ConversationDbRow = {
  id: string; contact_id: string; unread_count: number | null; last_message_at: string | null;
  last_channel_type: string | null; last_message_preview: string | null; status: string | null; ai_summary: string | null;
};
type IdentityDbRow = {
  id: string; contact_id: string; channel_connection_id: string | null; channel_type: string;
  external_user_id: string; external_display_name: string | null; external_username: string | null;
  is_primary: boolean;
};
type ConnectionDbRow = { id: string; channel_type: string; display_name: string | null; external_account_id: string | null; connection_status: string };
type MessageDbRow = {
  id: string; conversation_id: string; channel_type: string; direction: string; content_type: string;
  content: string | null; email_subject: string | null; media_url: string | null; attachments: unknown;
  status: string | null; created_at: string; translated_content: string | null;
};
const channelAliases: Record<string, Channel> = {
  whatsapp: 'whatsapp', messenger: 'messenger', facebook_messenger: 'messenger', facebook: 'messenger',
  instagram: 'instagram', email: 'email', telegram: 'telegram', wechat: 'wechat', line: 'line',
};
function normalizeChannel(value: string | null | undefined): Channel {
  return channelAliases[(value ?? '').toLowerCase()] ?? 'email';
}
function timestamp(value: string | null | undefined): number {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}
function messageStatus(value: string | null): Message['status'] {
  if (value === 'failed' || value === 'error') return 'failed';
  if (value === 'read') return 'read';
  if (value === 'delivered') return 'delivered';
  if (value === 'sent' || value === 'accepted') return 'sent';
  return 'local';
}
async function postInboxAction<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
  const response = await fetch(path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: { message?: string } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message || '请求失败，请稍后重试。');
  return payload.data;
}
function contentFallback(contentType: string): string {
  if (contentType === 'image') return '图片';
  if (contentType === 'video') return '视频';
  if (contentType === 'audio' || contentType === 'voice') return '语音消息';
  if (contentType === 'file') return '文件';
  if (contentType === 'email_card') return '邮件';
  return '暂不支持显示的消息类型';
}
function ChannelBadge({ channel, compact = false }: { channel: Channel; compact?: boolean }) {
  const logo = channel === 'email' ? null : '/platform-logos/' + channel + '.svg';
  return <span className={'cc-channel cc-channel--' + channel}>
    {logo ? <img src={logo} alt="" aria-hidden="true" /> : <semanticIcons.email size={16} aria-hidden="true" />}
    {!compact && channelNames[channel]}
  </span>;
}
function Avatar({ name, size = 'normal', placeholder = false }: { name: string; size?: 'normal' | 'small'; placeholder?: boolean }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <span className={'cc-avatar cc-avatar--' + size + (placeholder ? ' cc-avatar--placeholder' : '')} aria-label={name} role="img">{placeholder ? <semanticIcons.user size={size === "small" ? 16 : 20} /> : initials}</span>;
}
function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function CustomerCommunicationsWidget({
  open,
  minimized,
  onClose,
  onRestore,
  onUnreadCountChange,
  fullPage = false,
  popupMode = false,
  initialCustomerId = '',
}: {
  open: boolean;
  minimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  navigationExpanded: boolean;
  onUnreadCountChange: (count: number) => void;
  fullPage?: boolean;
  popupMode?: boolean;
  initialCustomerId?: string;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeCustomerId, setActiveCustomerId] = useState(initialCustomerId);
  const [filter, setFilter] = useState<Filter>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [emailSubject, setEmailSubject] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [channelOverride, setChannelOverride] = useState<Channel | null>(null);
  const [profileOpen, setProfileOpen] = useState(true);
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [aiBusyAction, setAiBusyAction] = useState<'summary' | 'reply_draft' | 'intent' | null>(null);
  const [aiResult, setAiResult] = useState('');
  const [aiResultAction, setAiResultAction] = useState<'reply_draft' | 'intent' | null>(null);
  const [aiError, setAiError] = useState('');
  const [translationBusyId, setTranslationBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadInbox = useCallback(async () => {
    try {
      const client = await getSupabaseClient();
      const [contactsResult, conversationsResult, identitiesResult, connectionsResult] = await Promise.all([
        client.from('crm_contacts')
          .select('id,first_name,last_name,full_name,job_title,decision_role,email,phone,mobile,is_active,is_archived,updated_at,custom_fields,crm_accounts(account_name,country_code)')
          .eq('is_archived', false).order('updated_at', { ascending: false }),
        client.from('inbox_conversations')
          .select('id,contact_id,unread_count,last_message_at,last_channel_type,last_message_preview,status,ai_summary')
          .order('last_message_at', { ascending: false }),
        client.from('inbox_customer_identities')
          .select('id,contact_id,channel_connection_id,channel_type,external_user_id,external_display_name,external_username,is_primary'),
        client.from('inbox_channel_connections')
          .select('id,channel_type,display_name,external_account_id,connection_status'),
      ]);
      const failure = contactsResult.error || conversationsResult.error || identitiesResult.error || connectionsResult.error;
      if (failure) throw failure;

      const contacts = (contactsResult.data ?? []) as unknown as ContactDbRow[];
      const conversations = (conversationsResult.data ?? []) as unknown as ConversationDbRow[];
      const rawIdentities = (identitiesResult.data ?? []) as unknown as IdentityDbRow[];
      const connections = (connectionsResult.data ?? []) as unknown as ConnectionDbRow[];
      const messagesResult = conversations.length
        ? await client.from('inbox_messages')
          .select('id,conversation_id,channel_type,direction,content_type,content,email_subject,media_url,attachments,status,created_at,translated_content')
          .in('conversation_id', conversations.map((conversation) => conversation.id))
          .order('created_at', { ascending: true })
        : { data: [], error: null };
      if (messagesResult.error) throw messagesResult.error;
      const rawMessages = (messagesResult.data ?? []) as unknown as MessageDbRow[];
      const connectionById = new Map(connections.map((item) => [item.id, item]));
      const conversationsByContact = new Map<string, ConversationDbRow[]>();
      const contactByConversation = new Map<string, string>();
      conversations.forEach((conversation) => {
        const list = conversationsByContact.get(conversation.contact_id) ?? [];
        list.push(conversation);
        conversationsByContact.set(conversation.contact_id, list);
        contactByConversation.set(conversation.id, conversation.contact_id);
      });

      const nextCustomers: Customer[] = contacts.map((contact) => {
        const related = conversationsByContact.get(contact.id) ?? [];
        const latestConversation = related.slice().sort((a, b) => timestamp(b.last_message_at) - timestamp(a.last_message_at))[0];
        const account = contact.crm_accounts;
        const custom = contact.custom_fields ?? {};
        const tags = Array.isArray(custom.tags) ? custom.tags.filter((tag): tag is string => typeof tag === 'string') : [];
        const unread = related.reduce((total, conversation) => total + Math.max(0, conversation.unread_count ?? 0), 0);
        return {
          id: contact.id,
          name: contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '未命名联系人',
          company: account?.account_name || '未关联客户',
          role: contact.job_title || contact.decision_role || '联系人',
          country: (typeof custom.country === 'string' && custom.country) || account?.country_code || '—',
          email: contact.email || '',
          phone: contact.phone || contact.mobile || '',
          tags,
          status: latestConversation && ['resolved', 'closed'].includes(latestConversation.status ?? '') ? 'resolved' : 'pending',
          unread,
          lastActivityAt: timestamp(latestConversation?.last_message_at) || timestamp(contact.updated_at),
          lastPreview: latestConversation?.last_message_preview || '尚无消息',
          latestConversationId: latestConversation?.id ?? null,
          ...(latestConversation?.ai_summary ? { aiSummary: latestConversation.ai_summary } : {}),
          ...(latestConversation?.last_channel_type ? { lastChannel: normalizeChannel(latestConversation.last_channel_type) } : {}),
        };
      });

      const nextIdentities: Identity[] = rawIdentities.map((identity) => {
        const connection = identity.channel_connection_id ? connectionById.get(identity.channel_connection_id) : undefined;
        const channel = normalizeChannel(identity.channel_type);
        return {
          id: identity.id,
          customerId: identity.contact_id,
          channel,
          handle: identity.external_display_name || identity.external_username || identity.external_user_id,
          account: connection?.display_name || connection?.external_account_id || channelNames[channel],
          connected: connection?.connection_status === 'connected' || connection?.connection_status === 'active',
        };
      });

      const nextMessages: Message[] = rawMessages.flatMap((message) => {
        const customerId = contactByConversation.get(message.conversation_id);
        if (!customerId) return [];
        const attachmentList = Array.isArray(message.attachments) ? message.attachments as Array<{ filename?: string; name?: string }> : [];
        const attachment = attachmentList[0]?.filename || attachmentList[0]?.name || (message.media_url ? '附件' : undefined);
        return [{
          id: message.id,
          conversationId: message.conversation_id,
          customerId,
          channel: normalizeChannel(message.channel_type),
          direction: message.direction === 'outbound' ? 'outbound' : 'inbound',
          body: message.content || contentFallback(message.content_type),
          timestamp: timestamp(message.created_at),
          status: messageStatus(message.status),
          ...(message.email_subject ? { subject: message.email_subject } : {}),
          ...(message.translated_content ? { translatedContent: message.translated_content } : {}),
          ...(attachment ? { attachment } : {}),
        }];
      });

      setCustomers(nextCustomers);
      setIdentities(nextIdentities);
      setMessages(nextMessages);
      setActiveCustomerId((current) => nextCustomers.some((customer) => customer.id === current) ? current : nextCustomers.some((customer) => customer.id === initialCustomerId) ? initialCustomerId : nextCustomers[0]?.id ?? '');
      const unreadCount = nextCustomers.reduce((total, customer) => total + customer.unread, 0);
      onUnreadCountChange(unreadCount);
      setLoadError('');
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : '读取 CRM 联系人和收件箱失败');
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange, initialCustomerId]);

  useEffect(() => {
    void loadInbox();
    const refresh = window.setInterval(() => { void loadInbox(); }, 30_000);
    return () => window.clearInterval(refresh);
  }, [loadInbox]);

  const activeCustomer = customers.find((customer) => customer.id === activeCustomerId) ?? customers[0];
  const draft = drafts[activeCustomerId] ?? '';
  const customerMessages = activeCustomer ? messages.filter((message) => message.customerId === activeCustomer.id).sort((a, b) => a.timestamp - b.timestamp) : [];
  const lastInbound = [...customerMessages].reverse().find((message) => message.direction === 'inbound');
  const latestMessage = customerMessages[customerMessages.length - 1];
  const customerIdentities = activeCustomer ? identities.filter((identity) => identity.customerId === activeCustomer.id) : [];
  const defaultChannel = lastInbound?.channel ?? latestMessage?.channel ?? activeCustomer?.lastChannel ?? customerIdentities[0]?.channel ?? 'email';
  const replyChannel = channelOverride ?? defaultChannel;
  const replyIdentity = customerIdentities.find((identity) => identity.channel === replyChannel);
  const channelCanSend = ['whatsapp', 'messenger', 'telegram', 'line'].includes(replyChannel);
  const unreadTotal = customers.reduce((total, customer) => total + customer.unread, 0);

  const channelFilterOptions: { id: ChannelFilter; text: string }[] = [
    { id: 'all', text: '全部渠道' },
    ...Array.from(new Set([...identities.map((identity) => identity.channel), ...messages.map((message) => message.channel)])).map((channel) => ({ id: channel, text: channelNames[channel] })),
  ];
  const statusFilterOptions: { id: Filter; text: string }[] = [
    { id: 'all', text: '全部会话' },
    { id: 'unread', text: '未读消息' },
    { id: 'pending', text: '待处理' },
    { id: 'resolved', text: '已解决' },
  ];

  const sortedCustomers = useMemo(() => customers
    .filter((customer) => {
      const customerText = [customer.name, customer.company, customer.email, customer.phone, customer.lastPreview, ...customer.tags].join(' ').toLowerCase();
      const messageText = messages.filter((message) => message.customerId === customer.id).map((message) => message.body + ' ' + (message.subject ?? '')).join(' ').toLowerCase();
      const matchesSearch = !search || customerText.includes(search.toLowerCase()) || messageText.includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || (filter === 'unread' ? customer.unread > 0 : customer.status === filter);
      const matchesChannel = channelFilter === 'all' ||
        identities.some((identity) => identity.customerId === customer.id && identity.channel === channelFilter) ||
        messages.some((message) => message.customerId === customer.id && message.channel === channelFilter);
      return matchesSearch && matchesFilter && matchesChannel;
    })
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt), [customers, identities, messages, search, filter, channelFilter]);

  const updateCustomerConversationStatus = async () => {
    if (!activeCustomer?.latestConversationId || statusBusy) return;
    const nextStatus = activeCustomer.status === 'resolved' ? 'pending' : 'resolved';
    setStatusBusy(true);
    setNotice('');
    try {
      const client = await getSupabaseClient();
      const { error } = await client.from('inbox_conversations')
        .update({ status: nextStatus }).eq('id', activeCustomer.latestConversationId);
      if (error) throw error;
      setCustomers((current) => current.map((customer) => customer.id === activeCustomer.id
        ? { ...customer, status: nextStatus } : customer));
      setNotice(nextStatus === 'resolved' ? '该客户的会话已标记为已解决。' : '该客户的会话已重新打开。');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '更新会话状态失败，请稍后重试。');
    } finally {
      setStatusBusy(false);
    }
  };

  const selectCustomer = (customer: Customer) => {
    setActiveCustomerId(customer.id);
    setChannelOverride(null);
    setAiResult('');
    setAiResultAction(null);
    setAiError('');
    setTranslationBusyId(null);
    setMobileChatOpen(true);
    if (customer.unread > 0) {
      setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, unread: 0 } : item));
      onUnreadCountChange(Math.max(0, unreadTotal - customer.unread));
      void getSupabaseClient().then((client) => client.from('inbox_conversations')
        .update({ unread_count: 0 }).eq('contact_id', customer.id).gt('unread_count', 0))
        .then(({ error }) => { if (error) setNotice('已在本地清除未读标记，但服务器未能同步：' + error.message); })
        .catch((error) => setNotice(error instanceof Error ? error.message : '同步已读状态失败'));
    }
  };

  const generateSummary = async () => {
    if (!activeCustomer?.latestConversationId || aiBusyAction) return;
    setAiBusyAction('summary'); setAiError('');
    try {
      const result = await postInboxAction<{ ai_summary: string }>(
        '/api/v1/inbox/conversations/' + activeCustomer.latestConversationId + '/summary', {},
      );
      setCustomers((current) => current.map((item) => item.id === activeCustomer.id ? { ...item, aiSummary: result.ai_summary } : item));
    } catch (cause) {
      setAiError(cause instanceof Error ? cause.message : 'AI 摘要生成失败。');
    } finally { setAiBusyAction(null); }
  };

  const runAiAssistant = async (action: 'reply_draft' | 'intent') => {
    if (!activeCustomer?.latestConversationId || aiBusyAction) return;
    setAiBusyAction(action); setAiError(''); setAiResult('');
    try {
      const result = await postInboxAction<{ result: string }>(
        '/api/v1/inbox/conversations/' + activeCustomer.latestConversationId + '/assist', { action },
      );
      setAiResult(result.result); setAiResultAction(action);
    } catch (cause) {
      setAiError(cause instanceof Error ? cause.message : 'AI 助手暂时不可用。');
    } finally { setAiBusyAction(null); }
  };

  const translateMessage = async (message: Message) => {
    if (translationBusyId) return;
    setTranslationBusyId(message.id); setAiError('');
    try {
      const result = await postInboxAction<{ translated_content: string }>(
        '/api/v1/inbox/messages/' + message.id + '/translate', {},
      );
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, translatedContent: result.translated_content } : item));
    } catch (cause) {
      setAiError(cause instanceof Error ? cause.message : '消息翻译失败。');
    } finally { setTranslationBusyId(null); }
  };

  const openChatPopup = () => {
    if (!activeCustomer) return;
    const url = '/communications?chatPopup=1&contact=' + encodeURIComponent(activeCustomer.id);
    window.open(url, 'tradepilot-chat-' + activeCustomer.id, 'popup=yes,width=760,height=860,resizable=yes,scrollbars=yes');
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !replyIdentity?.connected || sending) return;
    if (!activeCustomer?.latestConversationId) {
      setNotice('当前联系人尚无可发送的真实会话。');
      return;
    }
    if (!['whatsapp', 'messenger', 'telegram', 'line'].includes(replyChannel)) {
      setNotice(channelNames[replyChannel] + ' 尚未开放真实消息发送，请选择已接入的渠道。');
      return;
    }
    setSending(true);
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      const response = await fetch('/api/v1/inbox/conversations/' + activeCustomer.latestConversationId + '/messages', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, channel_type: replyChannel }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
      if (!response.ok) throw new Error(payload.error?.message || payload.message || '渠道发送失败，请稍后重试。');
      setDrafts((current) => ({ ...current, [activeCustomerId]: '' }));
      setEmailSubject('');
      setNotice('消息已提交到 ' + channelNames[replyChannel] + '，正在同步会话状态。');
      await loadInbox();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '消息发送失败。');
    } finally {
      setSending(false);
    }
  };



  if (!open) return null;
  if (minimized && !fullPage) {
    return <div className="cc-minimized"><Button type="button" kind="primary" renderIcon={semanticIcons.chat} onClick={onRestore}>客户沟通{unreadTotal > 0 ? ' · ' + unreadTotal : ''}</Button></div>;
  }

  if (!activeCustomer) {
    return (
      <div className={"tp-communication-page" + (popupMode ? " tp-communication-page--popup" : "")}>
        <section className="tp-communication-shell" aria-label="沟通工作区">
          <header className="tp-communication-header">
            <div className="tp-communication-heading"><span className="tp-communication-brand" aria-hidden="true"><semanticIcons.chat size={22} /></span><div><h1>沟通</h1><p>CRM 客户 · 全渠道会话 · 小雅辅助</p></div></div>
            <div className="tp-communication-header-actions">
              <Button type="button" kind="ghost" size="sm" onClick={() => void loadInbox()}>刷新</Button>
              {!popupMode && <Button type="button" kind="ghost" size="sm" onClick={onClose}>返回工作台</Button>}
            </div>
          </header>
          <div className="tp-communication-empty">{loading ? '正在读取 CRM 客户…' : loadError || '暂无 CRM 客户。请先在客户档案或联系人模块添加客户。'}</div>
        </section>
      </div>
    );
  }

  return (
    <div className={"tp-communication-page" + (popupMode ? " tp-communication-page--popup" : "")}>
      <section className="tp-communication-shell" aria-label="沟通工作区">
        <header className="tp-communication-header">
          <div className="tp-communication-heading">
            <span className="tp-communication-brand" aria-hidden="true"><semanticIcons.chat size={22} /></span>
            <div><h1>沟通</h1><p>客户关系 · 全渠道会话 · AI 辅助跟进</p></div>
          </div>
          <div className="tp-communication-header-actions">
            <span className="tp-communication-overview">{customers.length} 位客户 <span>·</span> {unreadTotal} 条未读</span>
            <Button type="button" kind="ghost" size="sm" onClick={() => void loadInbox()}>刷新</Button>
            <Button type="button" kind="ghost" size="sm" onClick={() => setProfileOpen((value) => !value)}>{profileOpen ? '收起客户 360' : '显示客户 360'}</Button>
            <Button type="button" kind="ghost" size="sm" className="tp-chat-popout-action" onClick={openChatPopup}><span>弹出聊天窗口</span><semanticIcons.externalLink size={16} /></Button>
            {!popupMode && <Button type="button" kind="ghost" size="sm" onClick={onClose}>返回工作台</Button>}
          </div>
        </header>

        <div className={'tp-communication-grid' + (!profileOpen ? ' tp-communication-grid--profile-closed' : '') + (mobileChatOpen ? ' tp-communication-grid--mobile-chat' : '')}>
          <aside className="tp-communication-customers" aria-label="CRM 客户列表">
            <div className="tp-pane-heading">
              <div><h2>CRM 客户</h2><p>客户与最近沟通记录</p></div>
              <span className="tp-pane-count">{sortedCustomers.length}</span>
            </div>
            <div className="tp-communication-search">
              <Search size="lg" labelText="搜索客户、公司或消息" placeholder="搜索客户、公司或消息" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
            </div>
            <div className="tp-communication-filters">
              <Dropdown
                id="communication-channel-filter"
                titleText="消息渠道"
                label="全部渠道"
                size="sm"
                items={channelFilterOptions}
                itemToString={(item) => item?.text ?? ''}
                selectedItem={channelFilterOptions.find((item) => item.id === channelFilter) ?? channelFilterOptions[0]}
                onChange={({ selectedItem }) => setChannelFilter(selectedItem?.id ?? 'all')}
              />
              <Dropdown
                id="communication-status-filter"
                titleText="会话状态"
                label="全部会话"
                size="sm"
                items={statusFilterOptions}
                itemToString={(item) => item?.text ?? ''}
                selectedItem={statusFilterOptions.find((item) => item.id === filter) ?? statusFilterOptions[0]}
                onChange={({ selectedItem }) => setFilter(selectedItem?.id ?? 'all')}
              />
            </div>
            <div className="tp-communication-customer-list">
              {sortedCustomers.map((customer) => {
                const last = messages.filter((message) => message.customerId === customer.id).sort((a, b) => b.timestamp - a.timestamp)[0];
                return (
                  <Button key={customer.id} type="button" kind="ghost" size="lg" className={'tp-communication-customer' + (activeCustomerId === customer.id ? ' is-selected' : '')} onClick={() => selectCustomer(customer)} aria-current={activeCustomerId === customer.id ? 'true' : undefined}>
                    <Avatar name={customer.name} />
                    <span className="tp-communication-customer-copy">
                      <span className="tp-communication-customer-top"><strong>{customer.name}</strong><time>{last ? formatTime(last.timestamp) : customer.lastActivityAt ? formatTime(customer.lastActivityAt) : '—'}</time></span>
                      <span className="tp-communication-company">{customer.company}</span>
                      <span className="tp-communication-preview">{last?.body ?? customer.lastPreview}</span>
                      <span className="tp-communication-customer-meta">{(last?.channel || customer.lastChannel) && <ChannelBadge channel={last?.channel || customer.lastChannel!} compact />}<span>{customerIdentitiesCount(identities, customer.id)} 个渠道</span></span>
                    </span>
                    {customer.unread > 0 && <b className="tp-communication-unread">{customer.unread}</b>}
                    <semanticIcons.chevronRight className="tp-communication-customer-arrow" size={16} aria-hidden="true" />
                  </Button>
                );
              })}
              {sortedCustomers.length === 0 && <div className="tp-communication-empty-inline">没有符合条件的客户</div>}
            </div>
          </aside>

          <main className="tp-communication-chat" aria-label="客户聊天窗口">
            <header className="tp-chat-header">
              <Button type="button" kind="ghost" size="sm" className="tp-chat-back" onClick={() => setMobileChatOpen(false)}>客户列表</Button>
              <Avatar name={activeCustomer.name} size="small" />
              <div className="tp-chat-heading"><strong>{activeCustomer.name}</strong><span>{activeCustomer.company} · {activeCustomer.country}</span></div>
              <div className="tp-chat-context"><span className="tp-chat-live-dot" /> 全渠道会话</div>
              <Button type="button" kind={activeCustomer.status === 'resolved' ? 'tertiary' : 'ghost'} size="sm" disabled={statusBusy} onClick={() => void updateCustomerConversationStatus()}>{statusBusy ? '更新中…' : activeCustomer.status === 'resolved' ? '重新打开' : '标记已解决'}</Button>
              {popupMode ? <Button type="button" kind="ghost" size="sm" className="tp-chat-popup-close" onClick={() => window.close()}><span>关闭窗口</span><semanticIcons.close size={16} /></Button> : null}
            </header>
            <div className="tp-chat-timeline">
              <div className="tp-chat-timeline-label">消息时间线</div>
              {customerMessages.map((message, index) => {
                const previous = customerMessages[index - 1];
                const showDate = !previous || new Date(previous.timestamp).toDateString() !== new Date(message.timestamp).toDateString();
                return (
                  <div key={message.id} className={'tp-chat-message ' + (message.direction === 'outbound' ? 'is-outbound' : 'is-inbound')}>
                    {showDate && <div className="tp-chat-date"><span>{new Date(message.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>}
                    <div className="tp-chat-message-meta"><ChannelBadge channel={message.channel} /><time>{formatTime(message.timestamp)}</time><span>{message.direction === 'inbound' ? activeCustomer.name : '我方'}</span></div>
                    <div className="tp-chat-message-line">
                      <Avatar name={message.direction === 'inbound' ? activeCustomer.name : 'TradePilot'} size="small" placeholder />
                      <div className="tp-chat-bubble">
                        {message.subject && <strong className="tp-chat-email-subject">{message.subject}</strong>}
                        <p>{message.body}</p>
                        {message.attachment && <span className="tp-chat-attachment">▤ {message.attachment}</span>}
                        {message.translatedContent && <p className="tp-chat-translation">{message.translatedContent}</p>}
                        {message.direction === 'inbound' && !message.translatedContent && <Button type="button" kind="ghost" size="sm" disabled={translationBusyId === message.id} onClick={() => void translateMessage(message)}>{translationBusyId === message.id ? '翻译中…' : '翻译消息'}</Button>}
                      </div>
                    </div>
                    {message.direction === 'outbound' && <span className="tp-chat-message-status">{message.status === 'local' ? '本地演示 · 未发送' : message.status === 'delivered' ? '已送达' : '已发送'}</span>}
                  </div>
                );
              })}
              {customerMessages.length === 0 && <div className="tp-communication-empty-inline tp-chat-empty">这个客户当前没有收件箱消息。</div>}
            </div>

            <form className="tp-chat-composer" onSubmit={sendMessage}>
              <div className="tp-chat-routing">
                <span>回复渠道</span>
                <div className="tp-chat-channel-picker">
                  <Dropdown
                    id="communication-reply-channel"
                    titleText="回复渠道"
                    label="选择渠道"
                    size="sm"
                    items={customerIdentities.map((identity) => ({ id: identity.id, channel: identity.channel, text: channelNames[identity.channel] + ' · ' + identity.handle }))}
                    itemToString={(item) => item?.text ?? ''}
                    selectedItem={customerIdentities.find((identity) => identity.channel === replyChannel) ? {
                      id: customerIdentities.find((identity) => identity.channel === replyChannel)!.id,
                      channel: replyChannel,
                      text: channelNames[replyChannel] + ' · ' + customerIdentities.find((identity) => identity.channel === replyChannel)!.handle,
                    } : null}
                    onChange={({ selectedItem }) => setChannelOverride(selectedItem?.channel ?? null)}
                  />
                </div>
                <span>{channelOverride ? '手动选择渠道' : '跟随客户最后一条入站消息'}</span>
              </div>
              {replyChannel === 'email' && <TextInput id="communication-email-subject" labelText="邮件主题" hideLabel value={emailSubject} onChange={(event) => setEmailSubject(event.currentTarget.value)} placeholder="邮件主题" />}
              <TextArea id="communication-message-draft" labelText="消息内容" hideLabel value={draft} onChange={(event) => { const value = event.currentTarget.value; setDrafts((current) => ({ ...current, [activeCustomerId]: value })); }} placeholder={'发送消息给 ' + activeCustomer.name + '…'} rows={3} />
              <div className="tp-chat-composer-footer"><span>{channelCanSend ? '发送将调用已连接渠道的真实 API' : '该渠道暂未开放真实发送'}</span><Button type="submit" kind="primary" size="md" disabled={!channelCanSend || !draft.trim() || !replyIdentity?.connected || sending || !activeCustomer.latestConversationId}>{sending ? '发送中…' : '发送消息'}</Button></div>
            </form>
          </main>

          {profileOpen && (
            <aside className="tp-communication-side" aria-label="客户 360 与小雅建议">
              <section className="tp-customer-360">
                <div className="tp-side-heading"><div><h2>客户 360</h2><p>客户档案与关系概览</p></div></div>
                <div className="tp-customer-identity">
                  <Avatar name={activeCustomer.name} />
                  <strong>{activeCustomer.name}</strong>
                  <span>{activeCustomer.role}</span>
                  <small>{activeCustomer.company}</small>
                </div>
                <section className="tp-customer-section">
                  <h3>基本信息</h3>
                  <dl>
                    <dt>公司</dt><dd>{activeCustomer.company}</dd>
                    <dt>国家 / 地区</dt><dd>{activeCustomer.country}</dd>
                    <dt>职位</dt><dd>{activeCustomer.role}</dd>
                    <dt>邮箱</dt><dd>{activeCustomer.email || '—'}</dd>
                    <dt>电话</dt><dd>{activeCustomer.phone || '—'}</dd>
                  </dl>
                </section>
                <section className="tp-customer-section">
                  <h3>社交与沟通渠道 <span>{customerIdentities.length}</span></h3>
                  {customerIdentities.length > 0 ? customerIdentities.map((identity) => <div className="tp-customer-channel" key={identity.id}><ChannelBadge channel={identity.channel} /><div><strong>{identity.handle}</strong><small>{identity.account}</small></div><i className={identity.connected ? 'is-connected' : ''} /></div>) : <p className="tp-customer-no-data">尚未关联外部沟通身份</p>}
                </section>
                <section className="tp-customer-section">
                  <h3>客户标签</h3>
                  <div className="tp-customer-tags">{activeCustomer.tags.length ? activeCustomer.tags.map((tag) => <span key={tag}>{tag}</span>) : <small>暂无标签</small>}</div>
                </section>
              </section>

              <section className="tp-xiaoya-suggestions">
                <div className="tp-side-heading"><div><h2>小雅建议</h2><p>结合当前会话提供下一步建议</p></div><span className="tp-xiaoya-mark">AI</span></div>
                <div className="tp-xiaoya-actions">
                  <Button type="button" kind="primary" size="sm" disabled={aiBusyAction !== null || !activeCustomer.latestConversationId} onClick={() => void runAiAssistant('reply_draft')}>{aiBusyAction === 'reply_draft' ? '生成中…' : '生成回复建议'}</Button>
                  <Button type="button" kind="tertiary" size="sm" disabled={aiBusyAction !== null || !activeCustomer.latestConversationId} onClick={() => void runAiAssistant('intent')}>{aiBusyAction === 'intent' ? '分析中…' : '分析客户意图'}</Button>
                  <Button type="button" kind="ghost" size="sm" disabled={aiBusyAction !== null || !activeCustomer.latestConversationId} onClick={() => void generateSummary()}>{aiBusyAction === 'summary' ? '总结中…' : '总结本次会话'}</Button>
                </div>
                {activeCustomer.aiSummary && <div className="tp-xiaoya-result"><strong>会话摘要</strong><p>{activeCustomer.aiSummary}</p></div>}
                {aiResult && <div className="tp-xiaoya-result"><strong>{aiResultAction === 'reply_draft' ? '回复建议' : '客户意图分析'}</strong><p>{aiResult}</p>{aiResultAction === 'reply_draft' && <Button type="button" kind="tertiary" size="sm" onClick={() => { setDrafts((current) => ({ ...current, [activeCustomerId]: aiResult })); setAiResult(''); setAiResultAction(null); }}>采用建议并填入回复框</Button>}</div>}
                {aiError && <p className="tp-xiaoya-error" role="alert">{aiError}</p>}
                {!activeCustomer.latestConversationId && <p className="tp-xiaoya-empty">该客户暂无会话，暂时无法生成建议。</p>}
                <p className="tp-xiaoya-note">小雅提供辅助建议；所有对外消息均由你确认后发送。</p>
              </section>
            </aside>
          )}
        </div>
        {notice && <div className="tp-communication-notice" role="status"><span>{notice}</span><Button type="button" kind="ghost" size="sm" onClick={() => setNotice('')}>知道了</Button></div>}
      </section>
    </div>
  );

}

function customerIdentitiesCount(identities: Identity[], customerId: string) {
  return identities.filter((identity) => identity.customerId === customerId).length;
}

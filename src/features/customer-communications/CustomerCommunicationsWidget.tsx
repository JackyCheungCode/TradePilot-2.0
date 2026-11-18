import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { Button, Dropdown, IconButton, Search, TextArea, TextInput, CarbonIcons } from '@/design-system';

type Channel = 'whatsapp' | 'messenger' | 'instagram' | 'email' | 'telegram' | 'wechat' | 'line';
type Filter = 'all' | 'unread' | 'pending' | 'resolved';
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
  last_channel_type: string | null; last_message_preview: string | null; status: string | null;
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
  status: string | null; created_at: string;
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
    {logo ? <img src={logo} alt="" aria-hidden="true" /> : <CarbonIcons.Email size={16} aria-hidden="true" />}
    {!compact && channelNames[channel]}
  </span>;
}
type CarbonIconComponent = typeof CarbonIcons.Close;
function ActionIconButton({ label, icon, onClick }: { label: string; icon: CarbonIconComponent; onClick: () => void }) {
  return <IconButton label={label} renderIcon={icon} size="sm" onClick={onClick} />;
}
function Avatar({ name, size = 'normal', placeholder = false }: { name: string; size?: 'normal' | 'small'; placeholder?: boolean }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <span className={'cc-avatar cc-avatar--' + size + (placeholder ? ' cc-avatar--placeholder' : '')} aria-label={name} role="img">{placeholder ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm0 2c-4.2 0-7.5 2.15-7.5 4.85V21h15v-2.15C19.5 16.15 16.2 14 12 14Z" fill="currentColor"/></svg> : initials}</span>;
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
  onMinimize,
  onRestore,
  navigationExpanded,
  onUnreadCountChange,
  fullPage = false,
}: {
  open: boolean;
  minimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  navigationExpanded: boolean;
  onUnreadCountChange: (count: number) => void;
  fullPage?: boolean;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeCustomerId, setActiveCustomerId] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [emailSubject, setEmailSubject] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [channelOverride, setChannelOverride] = useState<Channel | null>(null);
  const [profileOpen, setProfileOpen] = useState(true);
  const [notice, setNotice] = useState('');
  const [maximized, setMaximized] = useState(false);
  const [sending, setSending] = useState(false);
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
          .select('id,contact_id,unread_count,last_message_at,last_channel_type,last_message_preview,status')
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
          .select('id,conversation_id,channel_type,direction,content_type,content,email_subject,media_url,attachments,status,created_at')
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
          status: related.length && related.every((item) => item.status === 'resolved') ? 'resolved' : 'pending',
          unread,
          lastActivityAt: timestamp(latestConversation?.last_message_at) || timestamp(contact.updated_at),
          lastPreview: latestConversation?.last_message_preview || '尚无消息',
          latestConversationId: latestConversation?.id ?? null,
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
          ...(attachment ? { attachment } : {}),
        }];
      });

      setCustomers(nextCustomers);
      setIdentities(nextIdentities);
      setMessages(nextMessages);
      setActiveCustomerId((current) => nextCustomers.some((customer) => customer.id === current) ? current : nextCustomers[0]?.id ?? '');
      const unreadCount = nextCustomers.reduce((total, customer) => total + customer.unread, 0);
      onUnreadCountChange(unreadCount);
      setLoadError('');
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : '读取 CRM 联系人和收件箱失败');
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

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

  const sortedCustomers = useMemo(() => customers
    .filter((customer) => {
      const customerText = [customer.name, customer.company, customer.email, customer.phone, customer.lastPreview, ...customer.tags].join(' ').toLowerCase();
      const messageText = messages.filter((message) => message.customerId === customer.id).map((message) => message.body + ' ' + (message.subject ?? '')).join(' ').toLowerCase();
      const matchesSearch = !search || customerText.includes(search.toLowerCase()) || messageText.includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || (filter === 'unread' ? customer.unread > 0 : customer.status === filter);
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt), [customers, messages, search, filter]);

  const selectCustomer = (customer: Customer) => {
    setActiveCustomerId(customer.id);
    setChannelOverride(null);
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
    return <div className="cc-minimized"><Button type="button" kind="primary" renderIcon={CarbonIcons.Chat} onClick={onRestore}>客户沟通{unreadTotal > 0 ? ' · ' + unreadTotal : ''}</Button></div>;
  }

  if (!activeCustomer) {
    return <div className={"cc-floating-root" + (fullPage ? " cc-floating-root--page" : "") + (navigationExpanded ? " cc-floating-root--nav-expanded" : "")}>
      <section className={"cc-window" + (fullPage ? " cc-window--page" : "")} role="region" aria-label="全渠道消息中心">
        <header className="cc-window-header"><div className="cc-window-brand"><span className="cc-brand-mark">TP</span><div><strong>客户沟通</strong><small>CRM 联系人与统一收件箱</small></div></div><div className="cc-window-tools"><ActionIconButton label="关闭聊天窗口" icon={CarbonIcons.Close} onClick={onClose} /></div></header>
        <div className="cc-empty">{loading ? '正在读取系统联系人…' : loadError || 'CRM 中暂无可显示的联系人。请先在联系人模块添加联系人。'}</div>
      </section>
    </div>;
  }

  return (
    <div className={"cc-floating-root" + (fullPage ? " cc-floating-root--page" : "") + (navigationExpanded ? " cc-floating-root--nav-expanded" : "")}>
      <section className={'cc-window' + (maximized ? ' cc-window--maximized' : '') + (fullPage ? ' cc-window--page' : '')} role={fullPage ? "region" : "dialog"} aria-label="全渠道消息中心" aria-modal={fullPage ? undefined : "false"}>
        <header className="cc-window-header">
          <div className="cc-window-brand"><span className="cc-brand-mark">TP</span><div><strong>客户沟通</strong><small>CRM 联系人与统一收件箱</small><span className="cc-mobile-app-label">聊天 App</span></div></div>
          <div className="cc-window-tools">
            {fullPage && <ActionIconButton label="返回工作台" icon={CarbonIcons.ArrowLeft} onClick={onClose} />}
            <ActionIconButton label={profileOpen ? '收起客户资料' : '显示客户资料'} icon={CarbonIcons.User} onClick={() => setProfileOpen((value) => !value)} />
            {!fullPage && <ActionIconButton label={maximized ? '还原窗口' : '最大化窗口'} icon={maximized ? CarbonIcons.Minimize : CarbonIcons.Maximize} onClick={() => setMaximized((value) => !value)} />}
            {!fullPage && <ActionIconButton label="最小化聊天窗口" icon={CarbonIcons.Subtract} onClick={onMinimize} />}
            {!fullPage && <ActionIconButton label="关闭聊天窗口" icon={CarbonIcons.Close} onClick={onClose} />}
          </div>
        </header>

        <div className={'cc-workspace' + (!profileOpen ? ' cc-workspace--no-profile' : '') + (mobileChatOpen ? ' cc-workspace--mobile-chat' : '')}>
          <aside className="cc-inbox">
            <div className="cc-inbox-heading"><div><strong>联系人</strong><span>{customers.length} 位 CRM 联系人</span></div></div>
            <div className="cc-search"><Search size="lg" labelText="搜索客户、公司或消息" placeholder="搜索客户、公司或消息" value={search} onChange={(event) => setSearch(event.currentTarget.value)} /></div>
            <div className="cc-filters">
              {([{ id: 'all', label: '全部' }, { id: 'unread', label: '未读' }, { id: 'pending', label: '待处理' }, { id: 'resolved', label: '已解决' }] as { id: Filter; label: string }[]).map((item) => <Button key={item.id} type="button" kind={filter === item.id ? 'primary' : 'ghost'} size="sm" className="cc-filter-button" onClick={() => setFilter(item.id)}>{item.label}{item.id === 'unread' && unreadTotal > 0 ? ' · ' + unreadTotal : ''}</Button>)}
            </div>
            <div className="cc-customer-list">
              {sortedCustomers.map((customer) => {
                const last = messages.filter((message) => message.customerId === customer.id).sort((a, b) => b.timestamp - a.timestamp)[0];
                return <Button type="button" key={customer.id} kind="ghost" size="lg" className={'cc-customer-row' + (activeCustomerId === customer.id ? ' is-selected' : '')} onClick={() => selectCustomer(customer)}>
                  <Avatar name={customer.name}/>
                  <span className="cc-customer-copy"><span className="cc-customer-top"><strong>{customer.name}</strong><time>{last ? formatTime(last.timestamp) : customer.lastActivityAt ? formatTime(customer.lastActivityAt) : '—'}</time></span><span className="cc-company">{customer.company}</span><span className="cc-preview">{last?.body ?? customer.lastPreview}</span><span className="cc-customer-bottom">{(last?.channel || customer.lastChannel) && <ChannelBadge channel={last?.channel || customer.lastChannel!} compact/>}<span>{customerIdentitiesCount(identities, customer.id)} 个渠道</span></span></span>
                  {customer.unread > 0 && <b className="cc-unread-count">{customer.unread}</b>}
                </Button>;
              })}
              {sortedCustomers.length === 0 && <div className="cc-empty">没有符合条件的客户</div>}
            </div>
          </aside>

          <main className="cc-chat">
            <div className="cc-chat-header">
              <ActionIconButton label="返回客户列表" icon={CarbonIcons.ArrowLeft} onClick={() => setMobileChatOpen(false)} />
              <Avatar name={activeCustomer.name} size="small"/>
              <div className="cc-chat-title"><strong>{activeCustomer.name}</strong><span>{activeCustomer.company} · {activeCustomer.country}</span></div>
              <div className="cc-chat-header-actions"><span className="cc-online-dot"/> <span>统一客户时间线</span></div>
            </div>
            <div className="cc-timeline">
              <div className="cc-timeline-date">所有渠道消息按时间排列</div>
              {customerMessages.map((message, index) => {
                const previous = customerMessages[index - 1];
                const showDate = !previous || new Date(previous.timestamp).toDateString() !== new Date(message.timestamp).toDateString();
                return <div key={message.id} className={'cc-message-group ' + (message.direction === 'outbound' ? 'is-outbound' : 'is-inbound')}>
                  {showDate && <div className="cc-date-divider"><span>{new Date(message.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>}
                  <div className="cc-message-meta"><ChannelBadge channel={message.channel}/><time>{formatTime(message.timestamp)}</time><span>{message.direction === 'inbound' ? activeCustomer.name : '我方'}</span></div>
                  <div className="cc-message-line">
                    <Avatar name={message.direction === 'inbound' ? activeCustomer.name : 'TradePilot'} size="small" placeholder/>
                    <div className={'cc-message-bubble' + (message.channel === 'email' ? ' is-email' : '')}>
                      {message.subject && <strong className="cc-email-subject">{message.subject}</strong>}
                      <p>{message.body}</p>
                      {message.attachment && <span className="cc-attachment">▤ {message.attachment}</span>}
                    </div>
                  </div>
                  {message.direction === 'outbound' && <span className="cc-message-status">{message.status === 'local' ? '本地演示 · 未发送' : message.status === 'delivered' ? '已送达' : '已发送'}</span>}
                </div>;
              })}
              {customerMessages.length === 0 && <div className="cc-empty cc-empty--timeline">这个联系人当前没有收件箱消息。</div>}
            </div>

            <form className="cc-composer" onSubmit={sendMessage}>
              <div className="cc-reply-routing">
                <span>回复渠道</span>
                <div className="cc-channel-picker">
                  <Dropdown
                    id="cc-reply-channel"
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
              <span className="cc-route-hint">{channelOverride ? '已手动切换' : '跟随客户最后一条入站消息'}</span>
              </div>
              {replyChannel === 'email' && <TextInput id="cc-email-subject" labelText="邮件主题" hideLabel value={emailSubject} onChange={(event) => setEmailSubject(event.currentTarget.value)} placeholder="邮件主题" />}
              <TextArea id="cc-message-draft" labelText="消息内容" hideLabel value={draft} onChange={(event) => { const value = event.currentTarget.value; setDrafts((current) => ({ ...current, [activeCustomerId]: value })); }} placeholder={'通过 ' + channelNames[replyChannel] + ' 回复 ' + activeCustomer.name + '…'} rows={3} />
              <div className="cc-composer-footer"><span>{channelCanSend ? '发送将调用已连接渠道的真实 API' : '该渠道暂未开放真实发送'}</span><Button type="submit" kind="primary" size="md" disabled={!channelCanSend || !draft.trim() || !replyIdentity?.connected || sending || !activeCustomer.latestConversationId}>{sending ? '发送中…' : '发送消息'}</Button></div>
            </form>
          </main>

          {profileOpen && <aside className="cc-profile">
            <div className="cc-profile-top"><Avatar name={activeCustomer.name}/><strong>{activeCustomer.name}</strong><span>{activeCustomer.role}</span><small>{activeCustomer.company}</small></div>
            <section className="cc-profile-section"><h3>客户信息</h3><dl><dt>国家 / 地区</dt><dd>{activeCustomer.country}</dd><dt>邮箱</dt><dd>{activeCustomer.email || '—'}</dd><dt>电话</dt><dd>{activeCustomer.phone || '—'}</dd></dl></section>
            <section className="cc-profile-section"><h3>渠道身份 <span>{customerIdentities.length}</span></h3>{customerIdentities.map((identity) => <div className="cc-identity" key={identity.id}><ChannelBadge channel={identity.channel}/><div><strong>{identity.handle}</strong><small>{identity.account}</small></div><i className={identity.connected ? 'is-connected' : ''}/></div>)}</section>
            <section className="cc-profile-section"><h3>客户标签</h3><div className="cc-tags">{activeCustomer.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>
            <div className="cc-profile-foot">CRM 联系人档案</div>
          </aside>}
        </div>
        {notice && <div className="cc-notice" role="status"><span>{notice}</span><Button type="button" kind="ghost" size="sm" onClick={() => setNotice('')}>知道了</Button></div>}
      </section>
    </div>
  );
}

function customerIdentitiesCount(identities: Identity[], customerId: string) {
  return identities.filter((identity) => identity.customerId === customerId).length;
}

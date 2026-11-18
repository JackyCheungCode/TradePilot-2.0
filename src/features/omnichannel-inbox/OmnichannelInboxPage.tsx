import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button, Search, TextInput, TextArea, Dropdown, Tag, InlineNotification, Modal, ModalBody, IconButton, Heading, Tile, LineChart, ScaleTypes, CarbonIcons, Breadcrumb, BreadcrumbItem, ContentSwitcher, Switch,
} from '@/design-system';
import {
  channelLabels, conversationsSeed, customersSeed, identitiesSeed, messagesSeed,
  type ChannelType, type Conversation, type Customer, type CustomerIdentity, type Message,
} from './data';
import '@/design-system/styles/omnichannel-inbox.scss';

type Filter = 'all' | 'unread' | 'pending' | 'resolved';
const now = () => Date.now();
const fmtTime = (value: number) => new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
const fmtSize = (bytes: number) => bytes > 1_000_000 ? (bytes / 1_000_000).toFixed(1) + ' MB' : Math.round(bytes / 1000) + ' KB';
const channelOptions = Object.keys(channelLabels).map((id) => ({ id, text: channelLabels[id as ChannelType] }));

function ChannelMark({ channel }: { channel: ChannelType }) {
  const ChannelIcon = channel === 'email' ? CarbonIcons.Email : CarbonIcons.Chat;
  return <Tag type="cool-gray"><ChannelIcon size={16} /> {channelLabels[channel]}</Tag>;
}
function avatarFallback(contactName: string) {
  const name = contactName.trim();
  if (!name) return '?';
  const firstToken = name.split(/\s+/)[0];
  if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(name)) return /[\u3400-\u9fff]/.test(firstToken) && Array.from(firstToken).length > 1 ? firstToken : Array.from(firstToken)[0];
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0]).charAt(0).toUpperCase();
}
function Avatar({ customer, small = false }: { customer: Customer; small?: boolean }) {
  const fallback = avatarFallback(customer.contact_name);
  const avatarText = customer.avatar?.trim() || fallback;
  return <span className="oi-avatar" role="img" aria-label={customer.contact_name}><CarbonIcons.User size={small ? 24 : 32} /><span className="oi-avatar-label">{avatarText}</span></span>;
}
function StatusText({ status }: { status: Message['status'] }) {
  if (status === 'local') return <span className="oi-message-status">仅本地演示</span>;
  if (status === 'failed') return <span className="oi-message-status oi-message-status--failed"><CarbonIcons.WarningAlt size={12} /> 发送失败</span>;
  if (status === 'read') return <span className="oi-message-status oi-message-status--read"><CarbonIcons.Checkmark size={13} /><CarbonIcons.Checkmark size={13} /> 已读</span>;
  if (status === 'delivered') return <span className="oi-message-status"><CarbonIcons.Checkmark size={13} /><CarbonIcons.Checkmark size={13} /> 已送达</span>;
  return <span className="oi-message-status">{status === 'sending' ? '发送中…' : '已发送'}</span>;
}

export function OmnichannelInboxPage() {
  const [customers, setCustomers] = useState(customersSeed);
  const [identities, setIdentities] = useState(identitiesSeed);
  const [conversations, setConversations] = useState(conversationsSeed);
  const [messages, setMessages] = useState(messagesSeed);
  const [activeId, setActiveId] = useState('conv-a');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState<ChannelType>('wecom');
  const [draft, setDraft] = useState('');
  const [subject, setSubject] = useState('');
  const [profileOpen, setProfileOpen] = useState(() => typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches);
  const [mobileChat, setMobileChat] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [identityChannel, setIdentityChannel] = useState<ChannelType>('whatsapp');
  const [externalId, setExternalId] = useState('');
  const [expandedEmail, setExpandedEmail] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState<Customer | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const profilePanelRef = useRef<HTMLElement | null>(null);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? conversations[0];
  const customer = customers.find((item) => item.id === activeConversation.customer_id)!;
  const customerIdentities = identities.filter((item) => item.customer_id === customer.id);
  const replyChannelOptions = customerIdentities.map((identity) => ({
    id: identity.id,
    text: channelLabels[identity.channel_type] + ' · ' + identity.external_user_id,
    channel: identity.channel_type,
  }));
  const lastWhatsappInbound = messages
    .filter((item) => item.conversation_id === activeConversation.id && item.channel_type === 'whatsapp' && item.direction === 'inbound')
    .sort((a, b) => b.created_at - a.created_at)[0];
  const whatsappWindowExpiresAt = lastWhatsappInbound ? lastWhatsappInbound.created_at + 24 * 60 * 60_000 : null;
  const whatsappClosed = channel === 'whatsapp' && (!whatsappWindowExpiresAt || whatsappWindowExpiresAt < now());
  const timeline = messages.filter((item) => item.conversation_id === activeConversation.id).sort((a, b) => a.created_at - b.created_at);

  const unreadConversationCount = conversations.filter((item) => item.unread_count > 0).length;
  const todayKey = new Date().toLocaleDateString('en-CA');
  const isSameLocalDay = (timestamp: number, key: string) => new Date(timestamp).toLocaleDateString('en-CA') === key;
  const todayActiveCustomerCount = new Set(messages.filter((item) => isSameLocalDay(item.created_at, todayKey)).map((item) => item.customer_id)).size;
  const dailyActivityData = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = date.toLocaleDateString('en-CA');
    const customerCount = new Set(messages.filter((item) => isSameLocalDay(item.created_at, key)).map((item) => item.customer_id)).size;
    return { group: '对话客户', date: date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }), customers: customerCount };
  }), [messages]);
  const yesterdayActiveCustomerCount = dailyActivityData[dailyActivityData.length - 2]?.customers ?? 0;
  const activeCustomerDelta = todayActiveCustomerCount - yesterdayActiveCustomerCount;
  // The previous unread snapshot is demo-only until real inbox analytics are connected.
  const demoPreviousUnreadCount = 3;
  const unreadDelta = unreadConversationCount - demoPreviousUnreadCount;
  const trendLabel = (delta: number) => delta > 0 ? '+' + delta : String(delta);

  const filteredConversations = useMemo(() => conversations.filter((conversation) => {
    const person = customers.find((item) => item.id === conversation.customer_id)!;
    const haystack = [person.company_name, person.contact_name, person.role, ...person.tags].join(' ').toLowerCase();
    const matchesQuery = haystack.includes(query.toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'unread' ? conversation.unread_count > 0 : conversation.status === filter);
    return matchesQuery && matchesFilter;
  }), [conversations, customers, query, filter]);

  const chooseConversation = (item: Conversation) => {
    setActiveId(item.id);
    setMobileChat(true);
    setChannel(identities.find((identity) => identity.customer_id === item.customer_id && identity.is_primary)?.channel_type ?? identities.find((identity) => identity.customer_id === item.customer_id)?.channel_type ?? 'email');
    setConversations((current) => current.map((conversation) => conversation.id === item.id ? { ...conversation, unread_count: 0 } : conversation));
  };
  const updateConversation = (patch: Partial<Conversation>) => setConversations((current) => current.map((item) => item.id === activeConversation.id ? { ...item, ...patch } : item));
  const appendMessage = (content: string, type: Message['content_type'] = 'text', extra: Partial<Message> = {}) => {
    const created_at = now();
    const message: Message = { id: 'm-' + created_at, conversation_id: activeConversation.id, customer_id: customer.id, channel_type: channel, direction: 'outbound', content_type: type, content, status: 'local', created_at, ...extra };
    setMessages((current) => [...current, message]);
    updateConversation({ last_message_at: created_at, last_channel_type: channel, status: 'open' });
    setDraft('');
    setActionNotice('演示模式：消息仅加入本地时间线，尚未连接真实渠道发送服务。');
  };
  const sendMessage = () => {
    if (!draft.trim() || whatsappClosed) return;
    appendMessage(draft.trim(), channel === 'email' ? 'email_card' : 'text', channel === 'email' ? { email_subject: subject.trim() || '(无主题)' } : {});
    setSubject('');
  };
  const retryMessage = (_message: Message) => {
    setActionNotice('演示模式：未连接渠道发送服务，因此没有执行真实重试；原消息仍保留失败状态。');
  };
  const saveProfile = () => {
    if (!profileDraft) return;
    setCustomers((current) => current.map((item) => item.id === customer.id ? profileDraft : item));
    setEditing(false);
    setProfileDraft(null);
  };
  const bindIdentity = () => {
    const normalizedId = externalId.trim().toLowerCase();
    if (!normalizedId) return;
    const duplicate = customerIdentities.some((item) => item.channel_type === identityChannel && item.external_user_id.toLowerCase() === normalizedId);
    if (duplicate) {
      setActionNotice('该客户已绑定相同的渠道身份，请检查账号信息。');
      return;
    }
    const identity: CustomerIdentity = { id: 'id-' + now(), customer_id: customer.id, channel_type: identityChannel, external_user_id: externalId.trim(), window_expires_at: null, is_primary: customerIdentities.length === 0 };
    setIdentities((current) => [...current, identity]);
    setChannel(identityChannel);
    setExternalId('');
    setIdentityOpen(false);
    setActionNotice('渠道身份已加入本地演示数据；尚未连接真实渠道授权。');
  };
  const removeIdentity = (identity: CustomerIdentity) => {
    if (customerIdentities.length <= 1) {
      setActionNotice('每位客户至少保留一个渠道身份。');
      return;
    }
    const fallback = customerIdentities.find((item) => item.id !== identity.id);
    setIdentities((current) => current.filter((item) => item.id !== identity.id).map((item) => item.id === fallback?.id ? { ...item, is_primary: true } : item));
    if (channel === identity.channel_type && fallback) setChannel(fallback.channel_type);
    setActionNotice('渠道身份已从本地演示数据中移除。');
  };
  useEffect(() => {
    if (!profileOpen || typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches) return;
    const panel = profilePanelRef.current;
    const focusable = panel?.querySelector<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false);
        return;
      }
      if (event.key === 'Tab' && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [profileOpen]);

  const tabs: { id: Filter; label: string }[] = [{ id: 'all', label: '全部' }, { id: 'unread', label: '未读' }, { id: 'pending', label: '待处理' }, { id: 'resolved', label: '已解决' }];

  return <main className={'oi-workspace' + (mobileChat ? ' oi-workspace--mobile-chat' : '') + (!profileOpen ? ' oi-workspace--profile-collapsed' : '')} aria-label="混合聊天工作台">
    <Breadcrumb noTrailingSlash>
      <BreadcrumbItem href="/dashboard">概览</BreadcrumbItem>
      <BreadcrumbItem isCurrentPage>混合聊天</BreadcrumbItem>
    </Breadcrumb>
    <header className="oi-page-header">
      <div><Heading className="oi-page-title">混合聊天</Heading><p>统一管理跨渠道客户沟通与跟进</p></div>
      <Tag type="cool-gray">{conversations.length} 个会话</Tag>
    </header>
    <section className="oi-metrics-row" aria-label="会话统计">
      <Tile className="oi-metric-tile">
        <div className="oi-metric-copy"><span>未读对话</span><Heading>{unreadConversationCount}</Heading><small>有未读消息的会话</small></div>
        <Tag type="cool-gray">较演示基准 {trendLabel(unreadDelta)}</Tag>
      </Tile>
      <Tile className="oi-metric-tile">
        <div className="oi-metric-copy"><span>今日活跃客户</span><Heading>{todayActiveCustomerCount}</Heading><small>按客户去重统计</small></div>
        <Tag type="cool-gray">较昨日 {trendLabel(activeCustomerDelta)}</Tag>
      </Tile>
    </section>
    <section className="oi-activity-panel" aria-label="每日对话客户数趋势">
      <Tile className="oi-activity-tile">
        <div className="oi-activity-heading">
          <div><Heading className="oi-activity-title">每日对话客户数</Heading><p>最近 7 天 · 同一客户跨渠道只计一次</p></div>
          <Tag type="cool-gray">演示数据</Tag>
        </div>
        <div className="oi-activity-chart">
          <LineChart data={dailyActivityData} options={{
            axes: {
              bottom: { title: '日期', mapsTo: 'date', scaleType: ScaleTypes.LABELS },
              left: { title: '客户数', mapsTo: 'customers', scaleType: ScaleTypes.LINEAR }
            },
            height: '168px',
            legend: { enabled: false },
            points: { enabled: true },
            toolbar: { enabled: false }
          }} />
        </div>
      </Tile>
    </section>
    <div className="oi-workspace-grid">
    <aside className="oi-conversation-panel">
      <div className="oi-list-header"><strong>会话列表</strong><span className="oi-total">{filteredConversations.length} 条</span></div>
      <div className="oi-search"><Search size="lg" labelText="搜索会话" placeholder="搜索公司、联系人或标签" value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value)} /></div>
      <div className="oi-filter-row" aria-label="会话状态筛选"><ContentSwitcher selectedIndex={tabs.findIndex((tab) => tab.id === filter)} onChange={(selection: { name?: string | number }) => { if (selection.name !== undefined) setFilter(String(selection.name) as Filter); }} size="sm">{tabs.map((tab) => <Switch key={tab.id} name={tab.id} text={tab.label + (tab.id === 'unread' ? ' ' + conversations.filter((item) => item.unread_count > 0).length : '')} />)}</ContentSwitcher></div>
      <div className="oi-conversation-scroll">{filteredConversations.map((conversation) => {
        const person = customers.find((item) => item.id === conversation.customer_id)!;
        const last = messages.filter((item) => item.conversation_id === conversation.id).sort((a, b) => b.created_at - a.created_at)[0];
        return <ClickableTile className={'oi-conversation' + (activeId === conversation.id ? ' is-selected' : '')} key={conversation.id} aria-label={'打开 ' + (person.company_name || person.contact_name) + '，联系人 ' + person.contact_name} aria-current={activeId === conversation.id ? 'true' : undefined} onClick={() => chooseConversation(conversation)}>
          <Avatar customer={person} />
          <span className="oi-conversation-copy"><strong>{person.company_name || person.contact_name}</strong><span>{person.contact_name} · {person.role}</span><small>{last?.content_type === 'file' ? '文件：' + last.file_meta?.filename : last?.content_type === 'email_card' ? '邮件：' + last.email_subject : last?.content}</small></span>
          <span className="oi-conversation-meta"><time>{fmtTime(conversation.last_message_at)}</time><ChannelMark channel={conversation.last_channel_type} />{conversation.unread_count > 0 && <b>{conversation.unread_count}</b>}</span>
        </ClickableTile>;
      })}{filteredConversations.length === 0 && <div className="oi-empty">没有符合条件的会话</div>}</div>
    </aside>

    <section className="oi-chat-panel">
      <header className="oi-chat-header">
        <div className="oi-chat-heading">
          <Button className="oi-mobile-back" kind="ghost" size="sm" hasIconOnly renderIcon={CarbonIcons.ArrowLeft} iconDescription="返回会话列表" onClick={() => setMobileChat(false)} />
          <Avatar customer={customer} small />
          <div><Heading className="oi-chat-title">{customer.company_name || customer.contact_name}</Heading><span>{customer.contact_name} · {customer.role}</span></div>
        </div>
        <div className="oi-chat-actions">
          <Button kind="ghost" size="sm" onClick={() => updateConversation({ status: activeConversation.status === 'resolved' ? 'open' : 'resolved' })}>{activeConversation.status === 'resolved' ? '重新打开' : '标记已解决'}</Button>
          <IconButton kind="ghost" label="客户档案" onClick={() => setProfileOpen((value) => !value)}>{profileOpen ? <CarbonIcons.ViewOff /> : <CarbonIcons.View />}</IconButton>
        </div>
      </header>
      <div className="oi-timeline" aria-label="统一消息时间线">{timeline.map((message) => <article key={message.id} className={'oi-message oi-message--' + message.direction}>
        <div className="oi-message-meta"><ChannelMark channel={message.channel_type} /><time>{fmtTime(message.created_at)}</time></div>
        {message.content_type === 'email_card' ? <Tile className="oi-email-card"><div className="oi-email-title"><CarbonIcons.Email size={18} /><strong>{message.email_subject}</strong><Button type="button" kind="ghost" size="sm" onClick={() => setExpandedEmail((current) => current.includes(message.id) ? current.filter((id) => id !== message.id) : [...current, message.id])}>{expandedEmail.includes(message.id) ? '收起' : '展开'} <CarbonIcons.ChevronDown size={14} /></Button></div><div className="oi-email-from">发件人：{customer.email}</div>{expandedEmail.includes(message.id) && <p>{message.content}</p>}</Tile>
          : message.content_type === 'file' ? <Tile className="oi-file-card"><CarbonIcons.DocumentPdf size={28} /><div><strong>{message.file_meta?.filename}</strong><span>{fmtSize(message.file_meta?.size ?? 0)} · PDF 文档</span></div><Button type="button" kind="ghost" size="sm" hasIconOnly renderIcon={CarbonIcons.Attachment} iconDescription="演示文件不可下载" disabled /></Tile>
          : <Tile className="oi-bubble">{message.content}</Tile>}
        {message.direction === 'outbound' && <div className="oi-message-foot"><StatusText status={message.status} />{message.status === 'failed' && <Button kind="ghost" size="sm" onClick={() => retryMessage(message)}>点击重试</Button>}</div>}
      </article>)}</div>
      <div className="oi-composer">
        <div className="oi-channel-picker">
          <Dropdown id="oi-reply-channel" titleText="发送渠道与身份" label="选择发送身份" items={replyChannelOptions} itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''} selectedItem={replyChannelOptions.find((item) => item.channel === channel) ?? null} onChange={({ selectedItem }: { selectedItem: { id: string; text: string; channel: ChannelType } | null }) => selectedItem && setChannel(selectedItem.channel)} />
        </div>
        {whatsappClosed && <><InlineNotification kind="warning" lowContrast hideCloseButton title="WhatsApp 24 小时自由回复窗口已关闭" subtitle="请使用官方审核模板触达客户。" /><Button size="sm" kind="tertiary" onClick={() => setTemplateOpen(true)}>选择模板消息</Button></>}
        {channel === 'email' && <div className="oi-subject"><TextInput id="oi-subject" labelText="邮件主题（Subject）" placeholder="输入邮件主题" value={subject} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSubject(event.currentTarget.value)} /></div>}
        {actionNotice && <InlineNotification kind="info" lowContrast title={actionNotice} hideCloseButton />}
        <div className="oi-compose-row"><TextArea id="oi-message" labelText="消息内容" hideLabel placeholder={whatsappClosed ? '自由文本已禁用，请选择模板消息' : '输入消息…（Enter 发送，Shift + Enter 换行）'} rows={2} value={draft} disabled={whatsappClosed} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.currentTarget.value)} onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} /><Button hasIconOnly renderIcon={CarbonIcons.Send} iconDescription="发送消息" disabled={!draft.trim() || whatsappClosed} onClick={sendMessage} /></div>
      </div>
    </section>

    {profileOpen && <div className="oi-profile-backdrop" aria-hidden="true" onClick={() => setProfileOpen(false)} />}
    {profileOpen && <aside ref={profilePanelRef} className="oi-profile-panel" role={typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'dialog' : 'complementary'} aria-modal={typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? true : undefined} aria-labelledby="oi-profile-title" tabIndex={-1}>
      <div className="oi-profile-header"><h2 id="oi-profile-title">客户 360 档案</h2><IconButton kind="ghost" label="关闭档案" onClick={() => setProfileOpen(false)}><CarbonIcons.Close /></IconButton></div>
      <div className="oi-profile-scroll">
        <Tile className="oi-profile-identity"><Avatar customer={customer} /><div><strong>{customer.company_name || customer.contact_name}</strong><span>{customer.contact_name}</span></div></Tile>
        <Tile className="oi-profile-section"><div className="oi-section-heading"><h3>基础信息</h3><Button kind="ghost" size="sm" onClick={() => { setProfileDraft({ ...customer, tags: [...customer.tags] }); setEditing(true); }}>编辑</Button></div>
          {editing && profileDraft ? <div className="oi-edit-fields">
            <TextInput id="oi-company" labelText="公司名称" value={profileDraft.company_name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, company_name: e.currentTarget.value })} />
            <TextInput id="oi-contact" labelText="联系人" value={profileDraft.contact_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, contact_name: e.currentTarget.value })} />
            <TextInput id="oi-role" labelText="职位" value={profileDraft.role} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, role: e.currentTarget.value })} />
            <TextInput id="oi-email" labelText="邮箱" value={profileDraft.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, email: e.currentTarget.value })} />
            <TextInput id="oi-phone" labelText="电话" value={profileDraft.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, phone: e.currentTarget.value })} />
            <TextInput id="oi-tags" labelText="标签（逗号分隔）" value={profileDraft.tags.join(', ')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, tags: e.currentTarget.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} />
            <div className="oi-edit-actions"><Button size="sm" onClick={saveProfile}>保存</Button><Button size="sm" kind="secondary" onClick={() => setEditing(false)}>取消</Button></div>
          </div> : <dl className="oi-details"><dt>联系人</dt><dd>{customer.contact_name} · {customer.role}</dd><dt>邮箱</dt><dd>{customer.email}</dd><dt>电话</dt><dd className="oi-mono">{customer.phone}</dd></dl>}
        </Tile>
        <Tile className="oi-profile-section"><div className="oi-section-heading"><h3>渠道身份绑定</h3><Button kind="ghost" size="sm" renderIcon={CarbonIcons.Add} onClick={() => setIdentityOpen(true)}>绑定新渠道</Button></div>
          {customerIdentities.map((identity) => <div className="oi-identity-row" key={identity.id}><ChannelMark channel={identity.channel_type} /><span>{identity.external_user_id}</span>{identity.is_primary && <Tag type="green">主要</Tag>}<IconButton kind="ghost" label={'移除 ' + channelLabels[identity.channel_type] + ' 身份'} disabled={customerIdentities.length <= 1} onClick={() => removeIdentity(identity)}><CarbonIcons.TrashCan /></IconButton></div>)}
        </Tile>
        <Tile className="oi-profile-section"><h3>客户标签</h3><div className="oi-tags">{customer.tags.map((tag) => <Tag key={tag} type="cool-gray">{tag}</Tag>)}</div></Tile>
      </div>
    </aside>}

    </div>
    <Modal open={templateOpen} onRequestClose={() => setTemplateOpen(false)} modalHeading="选择 WhatsApp 官方模板" primaryButtonText="使用模板" secondaryButtonText="取消" onRequestSubmit={() => { appendMessage('您好，关于您咨询的产品目录，我们已为您准备最新版本。请问是否方便接收？', 'template'); setTemplateOpen(false); }}><ModalBody><p className="oi-modal-copy">选择已通过 WhatsApp 审核的模板，模板内容会作为新消息加入时间线。</p><div className="oi-template-option"><strong>product_catalog_followup</strong><span>产品目录跟进 · zh_CN</span></div><div className="oi-template-option"><strong>quotation_reminder</strong><span>报价单提醒 · zh_CN</span></div></ModalBody></Modal>
    <Modal open={identityOpen} onRequestClose={() => setIdentityOpen(false)} modalHeading="绑定新渠道身份" primaryButtonText="确认绑定" secondaryButtonText="取消" onRequestSubmit={bindIdentity}><ModalBody><Dropdown id="oi-new-channel" titleText="渠道类型" label="选择渠道" items={channelOptions} itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''} selectedItem={channelOptions.find((item) => item.id === identityChannel)} onChange={({ selectedItem }: { selectedItem: { id: string; text: string } | null }) => selectedItem && setIdentityChannel(selectedItem.id as ChannelType)} /><TextInput id="oi-external-id" labelText="平台账号 ID / 邮箱 / 电话" value={externalId} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setExternalId(event.currentTarget.value)} /></ModalBody></Modal>
  </main>;
}

import { useMemo, useState } from 'react';
import {
  Button, Search, TextInput, TextArea, Dropdown, Tag, InlineNotification, Modal, ModalHeader, ModalBody, ModalFooter, IconButton,
} from '@/design-system';
import {
  Add, ArrowLeft, Attachment, Checkmark, ChevronDown, ChevronRight, Close, DocumentPdf, Email, Information, MessageSquare, OverflowMenuHorizontal, Send, UserAvatar, WarningAlt, View, ViewOff,
} from '@carbon/icons-react';
import {
  assignees, channelLabels, conversationsSeed, customersSeed, identitiesSeed, messagesSeed,
  type ChannelType, type Conversation, type Customer, type CustomerIdentity, type Message,
} from './data';
import '@/design-system/styles/omnichannel-inbox.scss';

type Filter = 'all' | 'unread' | 'pending' | 'resolved';
const now = () => Date.now();
const fmtTime = (value: number) => new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
const fmtSize = (bytes: number) => bytes > 1_000_000 ? (bytes / 1_000_000).toFixed(1) + ' MB' : Math.round(bytes / 1000) + ' KB';
const channelOptions = Object.keys(channelLabels).map((id) => ({ id, text: channelLabels[id as ChannelType] }));

function ChannelMark({ channel }: { channel: ChannelType }) {
  return <span className={'oi-channel oi-channel--' + channel}>{channelLabels[channel]}</span>;
}
function Avatar({ customer, small = false }: { customer: Customer; small?: boolean }) {
  return <div className={'oi-avatar' + (small ? ' oi-avatar--small' : '')}>{customer.avatar}</div>;
}
function StatusText({ status }: { status: Message['status'] }) {
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
  const [profileOpen, setProfileOpen] = useState(true);
  const [mobileChat, setMobileChat] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [identityChannel, setIdentityChannel] = useState<ChannelType>('whatsapp');
  const [externalId, setExternalId] = useState('');
  const [expandedEmail, setExpandedEmail] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState<Customer | null>(null);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? conversations[0];
  const customer = customers.find((item) => item.id === activeConversation.customer_id)!;
  const customerIdentities = identities.filter((item) => item.customer_id === customer.id);
  const activeIdentity = customerIdentities.find((item) => item.channel_type === channel);
  const whatsappClosed = channel === 'whatsapp' && (!activeIdentity?.window_expires_at || activeIdentity.window_expires_at < now());
  const timeline = messages.filter((item) => item.conversation_id === activeConversation.id).sort((a, b) => a.created_at - b.created_at);

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
    const message: Message = { id: 'm-' + created_at, conversation_id: activeConversation.id, customer_id: customer.id, channel_type: channel, direction: 'outbound', content_type: type, content, status: 'sent', created_at, ...extra };
    setMessages((current) => [...current, message]);
    updateConversation({ last_message_at: created_at, last_channel_type: channel, status: 'open' });
    setDraft('');
  };
  const sendMessage = () => {
    if (!draft.trim() || whatsappClosed) return;
    appendMessage(draft.trim(), channel === 'email' ? 'email_card' : 'text', channel === 'email' ? { email_subject: subject.trim() || '(无主题)' } : {});
    setSubject('');
  };
  const retryMessage = (message: Message) => setMessages((current) => current.map((item) => item.id === message.id ? { ...item, status: 'sent' } : item));
  const saveProfile = () => {
    if (!profileDraft) return;
    setCustomers((current) => current.map((item) => item.id === customer.id ? profileDraft : item));
    setEditing(false);
    setProfileDraft(null);
  };
  const bindIdentity = () => {
    if (!externalId.trim()) return;
    const identity: CustomerIdentity = { id: 'id-' + now(), customer_id: customer.id, channel_type: identityChannel, external_user_id: externalId.trim(), window_expires_at: identityChannel === 'whatsapp' ? now() + 24 * 60 * 60_000 : null, is_primary: customerIdentities.length === 0 };
    setIdentities((current) => [...current, identity]);
    setChannel(identityChannel);
    setExternalId('');
    setIdentityOpen(false);
  };
  const tabs: { id: Filter; label: string }[] = [{ id: 'all', label: '全部' }, { id: 'unread', label: '未读' }, { id: 'pending', label: '待处理' }, { id: 'resolved', label: '已解决' }];

  return <main className={'oi-workspace' + (mobileChat ? ' oi-workspace--mobile-chat' : '') + (!profileOpen ? ' oi-workspace--profile-collapsed' : '')}>
    <aside className="oi-conversation-panel">
      <div className="oi-list-header"><div><h1>混合聊天</h1><p>全渠道客户沟通</p></div><span className="oi-total">{conversations.length} 个会话</span></div>
      <div className="oi-search"><Search size="lg" labelText="搜索会话" placeholder="搜索公司、联系人或标签" value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value)} /></div>
      <div className="oi-filter-row" role="tablist" aria-label="会话状态筛选">{tabs.map((tab) => <button type="button" role="tab" aria-selected={filter === tab.id} className={filter === tab.id ? 'is-active' : ''} key={tab.id} onClick={() => setFilter(tab.id)}>{tab.label}{tab.id === 'unread' && <span>{conversations.filter((item) => item.unread_count > 0).length}</span>}</button>)}</div>
      <div className="oi-conversation-scroll">{filteredConversations.map((conversation) => {
        const person = customers.find((item) => item.id === conversation.customer_id)!;
        const last = messages.filter((item) => item.conversation_id === conversation.id).sort((a, b) => b.created_at - a.created_at)[0];
        return <button type="button" className={'oi-conversation' + (activeId === conversation.id ? ' is-selected' : '')} key={conversation.id} onClick={() => chooseConversation(conversation)}>
          <Avatar customer={person} />
          <span className="oi-conversation-copy"><strong>{person.company_name || person.contact_name}</strong><span>{person.contact_name} · {person.role}</span><small>{last?.content_type === 'file' ? '文件：' + last.file_meta?.filename : last?.content_type === 'email_card' ? '邮件：' + last.email_subject : last?.content}</small></span>
          <span className="oi-conversation-meta"><time>{fmtTime(conversation.last_message_at)}</time><ChannelMark channel={conversation.last_channel_type} />{conversation.unread_count > 0 && <b>{conversation.unread_count}</b>}</span>
        </button>;
      })}{filteredConversations.length === 0 && <div className="oi-empty">没有符合条件的会话</div>}</div>
    </aside>

    <section className="oi-chat-panel">
      <header className="oi-chat-header">
        <div className="oi-chat-heading">
          <button className="oi-mobile-back" type="button" aria-label="返回会话列表" onClick={() => setMobileChat(false)}><CarbonIcons.ArrowLeft /></button>
          <Avatar customer={customer} small />
          <div><strong>{customer.company_name || customer.contact_name}</strong><span>{customer.contact_name} · {customer.role}</span></div>
        </div>
        <div className="oi-chat-actions">
          <Dropdown id="oi-assignee" titleText="" label="负责人" size="sm" items={assignees} itemToString={(item: { id: string; label: string } | null) => item?.label ?? ''} selectedItem={assignees.find((item) => item.id === activeConversation.assignee_id) ?? assignees[0]} onChange={({ selectedItem }: { selectedItem: { id: string; label: string } | null }) => selectedItem && updateConversation({ assignee_id: selectedItem.id })} />
          <Button kind="ghost" size="sm" onClick={() => updateConversation({ status: activeConversation.status === 'resolved' ? 'open' : 'resolved' })}>{activeConversation.status === 'resolved' ? '重新打开' : '标记已解决'}</Button>
          <IconButton kind="ghost" label="客户档案" onClick={() => setProfileOpen((value) => !value)}>{profileOpen ? <CarbonIcons.ViewOff /> : <CarbonIcons.View />}</IconButton>
        </div>
      </header>
      <div className="oi-timeline" aria-label="统一消息时间线">{timeline.map((message) => <article key={message.id} className={'oi-message oi-message--' + message.direction}>
        <div className="oi-message-meta"><ChannelMark channel={message.channel_type} /><time>{fmtTime(message.created_at)}</time></div>
        {message.content_type === 'email_card' ? <div className="oi-email-card"><div className="oi-email-title"><CarbonIcons.Email size={18} /><strong>{message.email_subject}</strong><button type="button" onClick={() => setExpandedEmail((current) => current.includes(message.id) ? current.filter((id) => id !== message.id) : [...current, message.id])}>{expandedEmail.includes(message.id) ? '收起' : '展开'} <CarbonIcons.ChevronDown size={14} /></button></div><div className="oi-email-from">发件人：{customer.email}</div>{expandedEmail.includes(message.id) && <p>{message.content}</p>}</div>
          : message.content_type === 'file' ? <div className="oi-file-card"><CarbonIcons.DocumentPdf size={28} /><div><strong>{message.file_meta?.filename}</strong><span>{fmtSize(message.file_meta?.size ?? 0)} · PDF 文档</span></div><button type="button" aria-label="下载文件"><CarbonIcons.Attachment size={18} /></button></div>
          : <div className="oi-bubble">{message.content}</div>}
        {message.direction === 'outbound' && <div className="oi-message-foot"><StatusText status={message.status} />{message.status === 'failed' && <Button kind="ghost" size="sm" onClick={() => retryMessage(message)}>点击重试</Button>}</div>}
      </article>)}</div>
      <div className="oi-composer">
        <div className="oi-channel-picker"><span>发送渠道</span>{customerIdentities.map((identity) => <button type="button" key={identity.id} className={channel === identity.channel_type ? 'is-active' : ''} onClick={() => setChannel(identity.channel_type)}><ChannelMark channel={identity.channel_type} /></button>)}</div>
        {whatsappClosed && <InlineNotification kind="warning" lowContrast hideCloseButton title="WhatsApp 24 小时自由回复窗口已关闭" subtitle="请使用官方审核模板触达客户。" />
          <Button size="sm" kind="tertiary" onClick={() => setTemplateOpen(true)}>选择模板消息</Button>}
        {channel === 'email' && <div className="oi-subject"><TextInput id="oi-subject" labelText="邮件主题（Subject）" placeholder="输入邮件主题" value={subject} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSubject(event.currentTarget.value)} /></div>}
        <div className="oi-compose-row"><TextArea id="oi-message" labelText="消息内容" hideLabel placeholder={whatsappClosed ? '自由文本已禁用，请选择模板消息' : '输入消息…（Enter 发送，Shift + Enter 换行）'} rows={2} value={draft} disabled={whatsappClosed} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.currentTarget.value)} onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} /><Button hasIconOnly renderIcon={CarbonIcons.Send} iconDescription="发送消息" disabled={!draft.trim() || whatsappClosed} onClick={sendMessage} /></div>
      </div>
    </section>

    {profileOpen && <aside className="oi-profile-panel">
      <div className="oi-profile-header"><h2>客户 360 档案</h2><IconButton kind="ghost" label="关闭档案" onClick={() => setProfileOpen(false)}><CarbonIcons.Close /></IconButton></div>
      <div className="oi-profile-scroll">
        <div className="oi-profile-identity"><Avatar customer={customer} /><div><strong>{customer.company_name || customer.contact_name}</strong><span>{customer.contact_name}</span></div></div>
        <div className="oi-profile-section"><div className="oi-section-heading"><h3>基础信息</h3><Button kind="ghost" size="sm" onClick={() => { setProfileDraft({ ...customer, tags: [...customer.tags] }); setEditing(true); }}>编辑</Button></div>
          {editing && profileDraft ? <div className="oi-edit-fields">
            <TextInput id="oi-company" labelText="公司名称" value={profileDraft.company_name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, company_name: e.currentTarget.value })} />
            <TextInput id="oi-contact" labelText="联系人" value={profileDraft.contact_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, contact_name: e.currentTarget.value })} />
            <TextInput id="oi-role" labelText="职位" value={profileDraft.role} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, role: e.currentTarget.value })} />
            <TextInput id="oi-email" labelText="邮箱" value={profileDraft.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, email: e.currentTarget.value })} />
            <TextInput id="oi-phone" labelText="电话" value={profileDraft.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, phone: e.currentTarget.value })} />
            <TextInput id="oi-tags" labelText="标签（逗号分隔）" value={profileDraft.tags.join(', ')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileDraft({ ...profileDraft, tags: e.currentTarget.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} />
            <div className="oi-edit-actions"><Button size="sm" onClick={saveProfile}>保存</Button><Button size="sm" kind="secondary" onClick={() => setEditing(false)}>取消</Button></div>
          </div> : <dl className="oi-details"><dt>联系人</dt><dd>{customer.contact_name} · {customer.role}</dd><dt>邮箱</dt><dd>{customer.email}</dd><dt>电话</dt><dd className="oi-mono">{customer.phone}</dd></dl>}
          {!editing && <div className="oi-tags">{customer.tags.map((tag) => <Tag key={tag} type="blue">{tag}</Tag>)}</div>}
        </div>
        <div className="oi-profile-section"><div className="oi-section-heading"><h3>渠道身份绑定</h3><Button kind="ghost" size="sm" renderIcon={CarbonIcons.Add} onClick={() => setIdentityOpen(true)}>绑定新渠道</Button></div>
          {customerIdentities.map((identity) => <div className="oi-identity-row" key={identity.id}><ChannelMark channel={identity.channel_type} /><span>{identity.external_user_id}</span>{identity.is_primary && <Tag type="green">主要</Tag>}</div>)}
        </div>
        <div className="oi-profile-section"><h3>客户标签</h3><div className="oi-tags">{customer.tags.map((tag) => <Tag key={tag} type="cool-gray">{tag}</Tag>)}</div></div>
      </div>
    </aside>}

    <Modal open={templateOpen} onRequestClose={() => setTemplateOpen(false)} modalHeading="选择 WhatsApp 官方模板" primaryButtonText="使用模板" secondaryButtonText="取消" onRequestSubmit={() => { appendMessage('您好，关于您咨询的产品目录，我们已为您准备最新版本。请问是否方便接收？', 'template'); setTemplateOpen(false); }}><ModalBody><p className="oi-modal-copy">选择已通过 WhatsApp 审核的模板，模板内容会作为新消息加入时间线。</p><div className="oi-template-option"><strong>product_catalog_followup</strong><span>产品目录跟进 · zh_CN</span></div><div className="oi-template-option"><strong>quotation_reminder</strong><span>报价单提醒 · zh_CN</span></div></ModalBody></Modal>
    <Modal open={identityOpen} onRequestClose={() => setIdentityOpen(false)} modalHeading="绑定新渠道身份" primaryButtonText="确认绑定" secondaryButtonText="取消" onRequestSubmit={bindIdentity}><ModalBody><Dropdown id="oi-new-channel" titleText="渠道类型" label="选择渠道" items={channelOptions} itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''} selectedItem={channelOptions.find((item) => item.id === identityChannel)} onChange={({ selectedItem }: { selectedItem: { id: string; text: string } | null }) => selectedItem && setIdentityChannel(selectedItem.id as ChannelType)} /><TextInput id="oi-external-id" labelText="平台账号 ID / 邮箱 / 电话" value={externalId} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setExternalId(event.currentTarget.value)} /></ModalBody></Modal>
  </main>;
}

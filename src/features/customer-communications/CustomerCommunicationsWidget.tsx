import { useMemo, useState, type FormEvent } from 'react';

type Channel = 'whatsapp' | 'messenger' | 'instagram' | 'email' | 'telegram' | 'wechat';
type Theme = 'whatsapp' | 'wechat' | 'messenger' | 'outlook';
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
};
type Identity = { customerId: string; channel: Channel; handle: string; account: string; connected: boolean };
type Message = {
  id: string;
  customerId: string;
  channel: Channel;
  direction: 'inbound' | 'outbound';
  body: string;
  timestamp: number;
  status: 'read' | 'delivered' | 'sent' | 'local' | 'failed';
  subject?: string;
  attachment?: string;
};

const ago = (minutes: number) => Date.now() - minutes * 60_000;
const channelNames: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  email: 'Email',
  telegram: 'Telegram',
  wechat: 'WeChat',
};
const channelGlyphs: Record<Channel, string> = {
  whatsapp: '◉',
  messenger: 'ϟ',
  instagram: '◎',
  email: '✉',
  telegram: '➤',
  wechat: '◌',
};
const customerSeed: Customer[] = [
  { id: 'customer-1', name: 'Michael Brown', company: 'ABC Electronics', role: '采购经理', country: 'United States', email: 'michael@abcelectronics.com', phone: '+1 415 555 0138', tags: ['重点客户', '消费电子', '批发商'], status: 'pending', unread: 2 },
  { id: 'customer-2', name: 'Sarah Johnson', company: 'Global Trading Ltd.', role: '采购总监', country: 'United Kingdom', email: 'sarah@globaltrading.co.uk', phone: '+44 20 7946 0182', tags: ['潜在客户', '渠道商'], status: 'pending', unread: 1 },
  { id: 'customer-3', name: 'David Lee', company: 'Tech Distribution', role: '创始人', country: 'Singapore', email: 'david@techdist.sg', phone: '+65 6123 4567', tags: ['新客户'], status: 'resolved', unread: 0 },
];
const identitySeed: Identity[] = [
  { customerId: 'customer-1', channel: 'whatsapp', handle: '+1 415 555 0138', account: 'TradePilot Sales', connected: true },
  { customerId: 'customer-1', channel: 'instagram', handle: '@michael.brown', account: 'TradePilot Official', connected: true },
  { customerId: 'customer-1', channel: 'email', handle: 'michael@abcelectronics.com', account: 'sales@tradepilot.com', connected: true },
  { customerId: 'customer-2', channel: 'messenger', handle: 'sarah.johnson', account: 'TradePilot Page', connected: true },
  { customerId: 'customer-2', channel: 'email', handle: 'sarah@globaltrading.co.uk', account: 'sales@tradepilot.com', connected: true },
  { customerId: 'customer-3', channel: 'telegram', handle: '@david_lee', account: 'TradePilot Sales Bot', connected: true },
  { customerId: 'customer-3', channel: 'wechat', handle: 'david_techdist', account: 'TradePilot WeChat', connected: true },
];
const messageSeed: Message[] = [
  { id: 'm1', customerId: 'customer-1', channel: 'whatsapp', direction: 'inbound', body: 'Hello, I am interested in your latest product range.', timestamp: ago(190), status: 'read' },
  { id: 'm2', customerId: 'customer-1', channel: 'whatsapp', direction: 'outbound', body: 'Thanks for reaching out. I can share our latest catalogue.', timestamp: ago(184), status: 'delivered' },
  { id: 'm3', customerId: 'customer-1', channel: 'email', direction: 'inbound', body: 'Please send the catalogue and wholesale price list.', subject: 'Product catalogue request', timestamp: ago(92), status: 'read' },
  { id: 'm4', customerId: 'customer-1', channel: 'instagram', direction: 'inbound', body: 'I also want to know the MOQ for the new models.', timestamp: ago(18), status: 'read' },
  { id: 'm5', customerId: 'customer-2', channel: 'messenger', direction: 'inbound', body: 'Could you provide your distributor terms?', timestamp: ago(46), status: 'read' },
  { id: 'm6', customerId: 'customer-2', channel: 'email', direction: 'inbound', body: 'Following up on our conversation. Please share your company profile.', subject: 'Company profile', timestamp: ago(12), status: 'read' },
  { id: 'm7', customerId: 'customer-3', channel: 'telegram', direction: 'inbound', body: 'Thank you. We have received the quotation.', timestamp: ago(320), status: 'read' },
  { id: 'm8', customerId: 'customer-3', channel: 'wechat', direction: 'outbound', body: 'You are welcome. Please let me know if you need anything else.', timestamp: ago(310), status: 'sent' },
];

function ChannelBadge({ channel, compact = false }: { channel: Channel; compact?: boolean }) {
  return <span className={'cc-channel cc-channel--' + channel}><span aria-hidden="true">{channelGlyphs[channel]}</span>{!compact && channelNames[channel]}</span>;
}
function Avatar({ name, size = 'normal' }: { name: string; size?: 'normal' | 'small' }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <span className={'cc-avatar cc-avatar--' + size}>{initials}</span>;
}
function IconButton({ label, children, onClick }: { label: string; children: string; onClick: () => void }) {
  return <button className="cc-icon-button" type="button" aria-label={label} title={label} onClick={onClick}>{children}</button>;
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
}: {
  open: boolean;
  minimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
}) {
  const [customers, setCustomers] = useState(customerSeed);
  const [identities, setIdentities] = useState(identitySeed);
  const [messages, setMessages] = useState(messageSeed);
  const [activeCustomerId, setActiveCustomerId] = useState('customer-1');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<Theme>('whatsapp');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [emailSubject, setEmailSubject] = useState('');
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [channelOverride, setChannelOverride] = useState<Channel | null>(null);
  const [profileOpen, setProfileOpen] = useState(true);
  const [notice, setNotice] = useState('');
  const [maximized, setMaximized] = useState(false);

  const activeCustomer = customers.find((customer) => customer.id === activeCustomerId) ?? customers[0]!;
  const draft = drafts[activeCustomerId] ?? '';
  const customerMessages = messages.filter((message) => message.customerId === activeCustomerId).sort((a, b) => a.timestamp - b.timestamp);
  const lastInbound = [...customerMessages].reverse().find((message) => message.direction === 'inbound');
  const latestMessage = customerMessages[customerMessages.length - 1];
  const customerIdentities = identities.filter((identity) => identity.customerId === activeCustomerId);
  const defaultChannel = lastInbound?.channel ?? latestMessage?.channel ?? customerIdentities[0]?.channel ?? 'email';
  const replyChannel = channelOverride ?? defaultChannel;
  const replyIdentity = customerIdentities.find((identity) => identity.channel === replyChannel);
  const unreadTotal = customers.reduce((total, customer) => total + customer.unread, 0);

  const sortedCustomers = useMemo(() => customers
    .filter((customer) => {
      const customerText = [customer.name, customer.company, customer.email, customer.phone, ...customer.tags].join(' ').toLowerCase();
      const messageText = messages.filter((message) => message.customerId === customer.id).map((message) => message.body + ' ' + (message.subject ?? '')).join(' ').toLowerCase();
      const matchesSearch = !search || customerText.includes(search.toLowerCase()) || messageText.includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || (filter === 'unread' ? customer.unread > 0 : customer.status === filter);
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const aTime = Math.max(0, ...messages.filter((message) => message.customerId === a.id).map((message) => message.timestamp));
      const bTime = Math.max(0, ...messages.filter((message) => message.customerId === b.id).map((message) => message.timestamp));
      return bTime - aTime;
    }), [customers, messages, search, filter]);

  const selectCustomer = (customer: Customer) => {
    setActiveCustomerId(customer.id);
    setChannelOverride(null);
    setChannelPickerOpen(false);
    setMobileChatOpen(true);
    setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, unread: 0 } : item));
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !replyIdentity?.connected) return;
    const now = Date.now();
    const next: Message = {
      id: 'local-' + now,
      customerId: activeCustomerId,
      channel: replyChannel,
      direction: 'outbound',
      body: content,
      timestamp: now,
      status: 'local',
      ...(replyChannel === 'email' ? { subject: emailSubject.trim() || 'Re: ' + (lastInbound?.subject ?? 'Customer inquiry') } : {}),
    };
    setMessages((current) => [...current, next]);
    setCustomers((current) => current.map((item) => item.id === activeCustomerId ? { ...item, status: 'pending' } : item));
    setDrafts((current) => ({ ...current, [activeCustomerId]: '' }));
    setEmailSubject('');
    setNotice('演示模式：消息仅保存在当前页面的本地状态中，没有发送到真实平台。');
  };

  const createDemoCustomer = () => {
    const id = 'customer-' + (customers.length + 1);
    const next: Customer = { id, name: 'New customer', company: 'New company', role: '联系人', country: '—', email: '', phone: '', tags: ['新客户'], status: 'pending', unread: 0 };
    setCustomers((current) => [...current, next]);
    setIdentities((current) => [...current, { customerId: id, channel: 'email', handle: 'new-customer@example.com', account: 'sales@tradepilot.com', connected: true }]);
    setActiveCustomerId(id);
    setChannelOverride('email');
    setMobileChatOpen(true);
    setNotice('已创建本地演示客户。真实客户创建功能将在后端接入后启用。');
  };

  if (!open) return null;
  if (minimized) {
    return <div className="cc-minimized"><button type="button" className="cc-restore" onClick={onRestore}><span className="cc-restore-icon">✉</span><span>客户沟通</span>{unreadTotal > 0 && <b>{unreadTotal}</b>}</button></div>;
  }

  return (
    <div className="cc-floating-root">
      <section className={'cc-window cc-theme-' + theme + (maximized ? ' cc-window--maximized' : '')} role="dialog" aria-label="客户沟通工作台" aria-modal="false">
        <header className="cc-window-header">
          <div className="cc-window-brand"><span className="cc-brand-mark">TP</span><div><strong>客户沟通</strong><small>统一收件箱 · 本地演示</small></div></div>
          <div className="cc-window-tools">
            <div className="cc-theme-switcher" aria-label="切换聊天界面主题">
              {(['whatsapp', 'wechat', 'messenger', 'outlook'] as Theme[]).map((item) => <button key={item} type="button" className={theme === item ? 'is-active' : ''} onClick={() => setTheme(item)}>{({ whatsapp: 'WhatsApp', wechat: 'WeChat', messenger: 'Messenger', outlook: 'Outlook' })[item]}</button>)}
            </div>
            <IconButton label={profileOpen ? '收起客户资料' : '显示客户资料'} onClick={() => setProfileOpen((value) => !value)}>{profileOpen ? '▣' : '▤'}</IconButton>
            <IconButton label={maximized ? '还原窗口' : '最大化窗口'} onClick={() => setMaximized((value) => !value)}>{maximized ? '❐' : '□'}</IconButton>
            <IconButton label="最小化聊天窗口" onClick={onMinimize}>−</IconButton>
            <IconButton label="关闭聊天窗口" onClick={onClose}>×</IconButton>
          </div>
        </header>

        <div className={'cc-workspace' + (!profileOpen ? ' cc-workspace--no-profile' : '') + (mobileChatOpen ? ' cc-workspace--mobile-chat' : '')}>
          <aside className="cc-inbox">
            <div className="cc-inbox-heading"><div><strong>收件箱</strong><span>{customers.length} 位客户</span></div><button type="button" className="cc-new-button" onClick={createDemoCustomer}>＋ 新建</button></div>
            <label className="cc-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="搜索客户、公司或消息"/></label>
            <div className="cc-filters">
              {([{ id: 'all', label: '全部' }, { id: 'unread', label: '未读' }, { id: 'pending', label: '待处理' }, { id: 'resolved', label: '已解决' }] as { id: Filter; label: string }[]).map((item) => <button key={item.id} type="button" className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)}>{item.label}{item.id === 'unread' && unreadTotal > 0 ? <span>{unreadTotal}</span> : null}</button>)}
            </div>
            <div className="cc-customer-list">
              {sortedCustomers.map((customer) => {
                const last = messages.filter((message) => message.customerId === customer.id).sort((a, b) => b.timestamp - a.timestamp)[0];
                return <button type="button" key={customer.id} className={'cc-customer-row' + (activeCustomerId === customer.id ? ' is-selected' : '')} onClick={() => selectCustomer(customer)}>
                  <Avatar name={customer.name}/>
                  <span className="cc-customer-copy"><span className="cc-customer-top"><strong>{customer.name}</strong><time>{last ? formatTime(last.timestamp) : '新客户'}</time></span><span className="cc-company">{customer.company}</span><span className="cc-preview">{last?.body ?? '尚无消息'}</span><span className="cc-customer-bottom">{last && <ChannelBadge channel={last.channel} compact/>}<span>{customerIdentitiesCount(identities, customer.id)} 个渠道</span></span></span>
                  {customer.unread > 0 && <b className="cc-unread-count">{customer.unread}</b>}
                </button>;
              })}
              {sortedCustomers.length === 0 && <div className="cc-empty">没有符合条件的客户</div>}
            </div>
          </aside>

          <main className="cc-chat">
            <div className="cc-chat-header">
              <button type="button" className="cc-mobile-back" onClick={() => setMobileChatOpen(false)} aria-label="返回客户列表">‹</button>
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
                  <div className={'cc-message-bubble' + (message.channel === 'email' ? ' is-email' : '')}>
                    {message.subject && <strong className="cc-email-subject">{message.subject}</strong>}
                    <p>{message.body}</p>
                    {message.attachment && <span className="cc-attachment">▤ {message.attachment}</span>}
                  </div>
                  {message.direction === 'outbound' && <span className="cc-message-status">{message.status === 'local' ? '本地演示 · 未发送' : message.status === 'delivered' ? '已送达' : '已发送'}</span>}
                </div>;
              })}
              {customerMessages.length === 0 && <div className="cc-empty cc-empty--timeline">这个客户还没有消息。你可以在下方输入一条本地演示消息。</div>}
            </div>

            <form className="cc-composer" onSubmit={sendMessage}>
              <div className="cc-reply-routing">
                <span>回复渠道</span>
                <div className="cc-channel-picker">
                <button type="button" className="cc-channel-trigger" aria-expanded={channelPickerOpen} onClick={() => setChannelPickerOpen((value) => !value)}><ChannelBadge channel={replyChannel}/><span>⌄</span></button>
                {channelPickerOpen && <div className="cc-channel-menu">{customerIdentities.map((identity) => <button key={identity.channel} type="button" onClick={() => { setChannelOverride(identity.channel); setChannelPickerOpen(false); }}><ChannelBadge channel={identity.channel}/><small>{identity.handle}</small></button>)}</div>}
              </div>
              <span className="cc-route-hint">{channelOverride ? '已手动切换' : '跟随客户最后一条入站消息'}</span>
              </div>
              {replyChannel === 'email' && <input className="cc-email-subject-input" value={emailSubject} onChange={(event) => setEmailSubject(event.currentTarget.value)} placeholder="邮件主题"/>}
              <textarea value={draft} onChange={(event) => { const value = event.currentTarget.value; setDrafts((current) => ({ ...current, [activeCustomerId]: value })); }} placeholder={'通过 ' + channelNames[replyChannel] + ' 回复 ' + activeCustomer.name + '…'} rows={3}/>
              <div className="cc-composer-footer"><span>附件和真实发送将在后端接入阶段启用</span><button type="submit" disabled={!draft.trim() || !replyIdentity?.connected}>发送消息 <span>↗</span></button></div>
            </form>
          </main>

          {profileOpen && <aside className="cc-profile">
            <div className="cc-profile-top"><Avatar name={activeCustomer.name}/><strong>{activeCustomer.name}</strong><span>{activeCustomer.role}</span><small>{activeCustomer.company}</small></div>
            <section className="cc-profile-section"><h3>客户信息</h3><dl><dt>国家 / 地区</dt><dd>{activeCustomer.country}</dd><dt>邮箱</dt><dd>{activeCustomer.email || '—'}</dd><dt>电话</dt><dd>{activeCustomer.phone || '—'}</dd></dl></section>
            <section className="cc-profile-section"><h3>渠道身份 <span>{customerIdentities.length}</span></h3>{customerIdentities.map((identity) => <div className="cc-identity" key={identity.channel}><ChannelBadge channel={identity.channel}/><div><strong>{identity.handle}</strong><small>{identity.account}</small></div><i className={identity.connected ? 'is-connected' : ''}/></div>)}</section>
            <section className="cc-profile-section"><h3>客户标签</h3><div className="cc-tags">{activeCustomer.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>
            <div className="cc-profile-foot">单人工作台 · 本地模拟资料</div>
          </aside>}
        </div>
        {notice && <div className="cc-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')}>知道了</button></div>}
      </section>
    </div>
  );
}

function customerIdentitiesCount(identities: Identity[], customerId: string) {
  return identities.filter((identity) => identity.customerId === customerId).length;
}

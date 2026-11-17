import { useMemo, useRef, useState, useEffect } from 'react';
import {
  communicationCustomers,
  communicationConversations,
  communicationMessages,
  communicationChannelLabels,
  type CommunicationConversation,
  type CommunicationMessage,
} from './data';
import '@/design-system/styles/customer-communications-window.scss';

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
const timeLabel = (time: number) => new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(time);
const dateLabel = (time: number) => new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric' }).format(time);
type ChatTheme = 'whatsapp' | 'wechat' | 'messenger' | 'outlook';
const chatThemes: { id: ChatTheme; label: string; description: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp UI', description: 'WhatsApp Web 风格' },
  { id: 'wechat', label: 'WeChat UI', description: '微信桌面版风格' },
  { id: 'messenger', label: 'Messenger UI', description: 'Facebook Messenger 风格' },
  { id: 'outlook', label: 'Microsoft Outlook UI', description: 'Outlook 邮件工作台风格' },
];

export function CustomerCommunicationsWindowPage() {
  const [conversations, setConversations] = useState(communicationConversations);
  const [messages, setMessages] = useState(communicationMessages);
  const [activeId, setActiveId] = useState(communicationConversations[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [draft, setDraft] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileList, setMobileList] = useState(true);
  const [theme, setTheme] = useState<ChatTheme>(() => {
    try { const saved = window.localStorage.getItem('tp-customer-communications-theme'); return chatThemes.some((item) => item.id === saved) ? saved as ChatTheme : 'whatsapp'; } catch { return 'whatsapp'; }
  });
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  useEffect(() => { try { window.localStorage.setItem('tp-customer-communications-theme', theme); } catch { /* storage may be unavailable */ } }, [theme]);
  const activeTheme = chatThemes.find((item) => item.id === theme) ?? chatThemes[0];
  const timelineRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? conversations[0];
  const customer = communicationCustomers.find((item) => item.id === activeConversation?.customerId) ?? communicationCustomers[0];
  const activeMessages = useMemo(() => messages.filter((item) => item.conversationId === activeId).sort((a, b) => a.time - b.time), [messages, activeId]);
  const visible = conversations.filter((conversation) => {
    const person = communicationCustomers.find((item) => item.id === conversation.customerId);
    return !!person
      && (filter === 'all' || conversation.unread > 0)
      && [person.contact, person.company, conversation.preview].join(' ').toLowerCase().includes(search.toLowerCase());
  });

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: 'smooth' });
  }, [activeId, activeMessages.length]);

  const select = (conversation: CommunicationConversation) => {
    setActiveId(conversation.id);
    setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, unread: 0 } : item));
    setMobileList(false);
  };

  const send = () => {
    const body = draft.trim();
    if (!body || !activeConversation) return;
    const now = Date.now();
    const message: CommunicationMessage = {
      id: 'window-' + now,
      conversationId: activeConversation.id,
      channel: activeConversation.channel,
      direction: 'outbound',
      kind: 'text',
      body,
      time: now,
      status: 'sent',
    };
    setMessages((current) => [...current, message]);
    setConversations((current) => current.map((item) => item.id === activeConversation.id
      ? { ...item, preview: body, updatedAt: now, state: 'open' }
      : item));
    setDraft('');
  };

  return (
    <main className={'tp-wa-page tp-wa-theme--' + theme} aria-label="客户沟通工作台">
      <header className="tp-communications-titlebar">
        <div className="tp-communications-title"><strong>TradePilot</strong><span>客户沟通工作台</span></div>
        <div className="tp-theme-picker">
          <button type="button" className="tp-theme-picker-trigger" aria-haspopup="listbox" aria-expanded={themeMenuOpen} onClick={() => setThemeMenuOpen((value) => !value)}><span><small>界面主题</small><strong>{activeTheme.label}</strong></span><span className="tp-theme-chevron">⌄</span></button>
          {themeMenuOpen && <div className="tp-theme-picker-menu" role="listbox" aria-label="选择界面主题">{chatThemes.map((item) => <button type="button" role="option" aria-selected={theme === item.id} className={theme === item.id ? 'is-selected' : ''} key={item.id} onClick={() => { setTheme(item.id); setThemeMenuOpen(false); }}><strong>{item.label}</strong><small>{item.description}</small>{theme === item.id && <span aria-hidden="true">✓</span>}</button>)}</div>}
        </div>
      </header>
      <section className={"tp-wa-app" + (profileOpen ? " has-profile" : "")}>
        <aside className={'tp-wa-sidebar' + (mobileList ? ' is-mobile-visible' : '')}>
          <header className="tp-wa-sidebar-head">
            <div className="tp-wa-profile-avatar">TP</div>
            <div className="tp-wa-head-actions">
              <button type="button" aria-label="新建聊天" title="新建聊天" onClick={() => setSearch('')}><span>＋</span></button>
              <button type="button" aria-label="更多选项" title="更多选项" onClick={() => setMenuOpen((value) => !value)}>⋮</button>
              {menuOpen && <div className="tp-wa-menu"><button onClick={() => setProfileOpen(false)}>关闭客户资料</button><button onClick={() => setFilter('all')}>显示全部会话</button></div>}
            </div>
          </header>
          <div className="tp-wa-list-title"><h1>{theme === 'outlook' ? '邮件' : theme === 'wechat' ? '微信' : theme === 'messenger' ? 'Chats' : '聊天'}</h1><span>{conversations.length}</span></div>
          <label className="tp-wa-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={theme === 'outlook' ? '搜索邮件' : '搜索或开始新聊天'} aria-label="搜索会话"/>
          </label>
          <div className="tp-wa-filters">
            <button className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>全部</button>
            <button className={filter === 'unread' ? 'is-active' : ''} onClick={() => setFilter('unread')}>未读</button>
          </div>
          <div className="tp-wa-conversations">
            {visible.map((conversation) => {
              const person = communicationCustomers.find((item) => item.id === conversation.customerId)!;
              return (
                <button type="button" key={conversation.id} className={'tp-wa-conversation' + (activeId === conversation.id ? ' is-selected' : '')} onClick={() => select(conversation)}>
                  <span className="tp-wa-avatar">{initials(person.contact)}</span>
                  <span className="tp-wa-conversation-content">
                    <span className="tp-wa-conversation-top"><strong>{person.contact}</strong><time>{timeLabel(conversation.updatedAt)}</time></span>
                    <span className="tp-wa-conversation-bottom"><span>{conversation.preview}</span>{conversation.unread > 0 && <i>{conversation.unread}</i>}</span>
                    <span className="tp-wa-company">{person.company}</span>
                  </span>
                </button>
              );
            })}
            {visible.length === 0 && <div className="tp-wa-no-results">没有匹配的聊天</div>}
          </div>
          <footer className="tp-wa-sidebar-foot">TradePilot · 客户沟通</footer>
        </aside>

        <section className={'tp-wa-chat' + (mobileList ? ' is-mobile-hidden' : '')}>
          {activeConversation && customer ? <>
            <header className="tp-wa-chat-head">
              <button className="tp-wa-back" onClick={() => setMobileList(true)} aria-label="返回会话列表">‹</button>
              <button className="tp-wa-chat-person" onClick={() => setProfileOpen((value) => !value)}>
                <span className="tp-wa-avatar">{initials(customer.contact)}</span>
                <span><strong>{customer.contact}</strong><small>{customer.company}</small></span>
              </button>
              <div className="tp-wa-chat-tools">
                <span className={'tp-wa-channel tp-wa-channel--' + activeConversation.channel}>{communicationChannelLabels[activeConversation.channel]}</span>
                <button aria-label="搜索聊天" title="搜索聊天"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg></button>
                <button aria-label="客户资料" title="客户资料" onClick={() => setProfileOpen((value) => !value)}>ⓘ</button>
                <button aria-label="更多操作" title="更多操作" onClick={() => setMenuOpen((value) => !value)}>⋮</button>
              </div>
            </header>
            <div className="tp-wa-encryption">{theme === 'outlook' ? <><span>✉</span> 邮件会话 · {communicationChannelLabels[activeConversation.channel]}</> : theme === 'wechat' ? <><span>✓</span> 微信式会话视图</> : theme === 'messenger' ? <><span>●</span> Messenger 会话</> : <><span>🔒</span> 消息和通话均受到端到端加密保护。点击此处了解详情。</>}</div>
            <div className="tp-wa-timeline" ref={timelineRef}>
              <div className="tp-wa-date-divider"><span>{dateLabel(activeMessages[0]?.time ?? Date.now())}</span></div>
              {activeMessages.map((message) => (
                <article key={message.id} className={'tp-wa-message ' + (message.direction === 'outbound' ? 'is-outbound' : message.direction === 'system' ? 'is-system' : 'is-inbound')}>
                  <div className="tp-wa-bubble">
                    {message.kind === 'email' && <div className="tp-wa-email-label">电子邮件 · {message.subject}</div>}
                    {message.kind === 'file' && <div className="tp-wa-file"><span>▤</span><span><strong>{message.filename ?? '附件'}</strong><small>{message.fileSize}</small></span></div>}
                    <p>{message.body}</p>
                    <div className="tp-wa-message-meta"><time>{timeLabel(message.time)}</time>{message.direction === 'outbound' && <span className="tp-wa-ticks">✓✓</span>}</div>
                  </div>
                  {message.direction === 'inbound' && <span className="tp-wa-source">{communicationChannelLabels[message.channel]}</span>}
                </article>
              ))}
            </div>
            <footer className="tp-wa-composer">
              <button aria-label="表情符号" title="表情符号">☺</button>
              <button aria-label="添加附件" title="添加附件">＋</button>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
              }} placeholder={theme === 'outlook' ? '撰写邮件…' : theme === 'wechat' ? '发送消息…' : '输入消息'} rows={1} aria-label="输入消息"/>
              <button className="tp-wa-send" onClick={send} disabled={!draft.trim()} aria-label="发送消息" title="发送消息">
                <svg viewBox="0 0 24 24"><path d="m3 20 18-8L3 4l2 7 9 1-9 1-2 7Z"/></svg>
              </button>
            </footer>
          </> : <div className="tp-wa-welcome"><div className="tp-wa-welcome-icon">◉</div><h2>客户沟通工作台</h2><p>选择一个会话，开始与客户沟通</p></div>}
        </section>

        {profileOpen && customer && activeConversation && (
          <aside className="tp-wa-contact-panel">
            <header><strong>客户资料</strong><button onClick={() => setProfileOpen(false)} aria-label="关闭客户资料">×</button></header>
            <div className="tp-wa-contact-main">
              <span className="tp-wa-avatar tp-wa-avatar--large">{initials(customer.contact)}</span>
              <strong>{customer.contact}</strong><span>{customer.company}</span>
              <small>{customer.role}</small>
            </div>
            <section><h3>联系信息</h3><dl><dt>电子邮件</dt><dd>{customer.email}</dd><dt>电话</dt><dd>{customer.phone}</dd><dt>地区</dt><dd>{customer.region}</dd></dl></section>
            <section><h3>渠道身份</h3>{customer.identities.map((identity) => <div className="tp-wa-identity" key={identity.channel}><span className={'tp-wa-channel-dot tp-wa-channel-dot--' + identity.channel}/><span>{communicationChannelLabels[identity.channel]}</span><small>{identity.account}</small></div>)}</section>
            <section><h3>客户标签</h3><div className="tp-wa-tags">{customer.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>
            <section><h3>会话状态</h3><p>{activeConversation.state === 'resolved' ? '已解决' : activeConversation.state === 'pending' ? '待处理' : '处理中'}</p></section>
          </aside>
        )}
      </section>
    </main>
  );
}

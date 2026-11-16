import { useMemo, useState } from 'react';
import {
  Button, Search, TextArea, Dropdown, Tag, InlineNotification, Heading, CarbonIcons,
} from '@/design-system';
import {
  communicationChannelLabels,
  communicationConversations,
  communicationCustomers,
  communicationMessages,
  type CommunicationChannel,
  type CommunicationConversation,
  type CommunicationMessage,
} from './data';
import '@/design-system/styles/customer-communications.scss';

type ConversationFilter = 'all' | 'unread' | 'pending' | 'resolved';
type ChannelOption = { id: CommunicationChannel; text: string };

const channelOptions: ChannelOption[] = Object.entries(communicationChannelLabels).map(([id, text]) => ({
  id: id as CommunicationChannel,
  text,
}));
const formatTime = (timestamp: number) => new Intl.DateTimeFormat('zh-TW', {
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(timestamp);
const formatDate = (timestamp: number) => new Intl.DateTimeFormat('zh-TW', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(timestamp);
const statusLabels: Record<ConversationFilter, string> = {
  all: '全部',
  unread: '未读',
  pending: '待处理',
  resolved: '已解决',
};

function ChannelLogo({ channel, size = 'md' }: { channel: CommunicationChannel; size?: 'sm' | 'md' | 'lg' }) {
  const labels: Record<CommunicationChannel, string> = {
    whatsapp: 'WhatsApp',
    messenger: 'Facebook Messenger',
    instagram: 'Instagram',
    email: '电子邮件',
    telegram: 'Telegram',
  };
  return (
    <span className={`cc-channel-logo cc-channel-logo--${channel} cc-channel-logo--${size}`} role="img" aria-label={labels[channel]} title={labels[channel]}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {channel === 'whatsapp' && <><path d="M12 2.2a9.4 9.4 0 0 0-8.08 14.2L2.7 21.8l5.55-1.45A9.4 9.4 0 1 0 12 2.2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M8.1 7.7c.25-.55.5-.56.8-.57h.55c.17 0 .4.06.55.42l.78 1.87c.08.2.06.39-.07.57l-.58.72c-.15.18-.2.35-.06.59.48.82 1.17 1.5 2.02 1.96.24.13.42.1.58-.08l.75-.88c.17-.2.36-.24.59-.15l1.8.85c.28.13.43.2.46.35.03.15-.02.86-.48 1.32-.45.46-1.12.67-1.82.53-1.07-.2-2.4-.84-3.7-2.02-1.06-.96-1.8-2.14-2.03-3.05-.24-.9.02-1.83.36-2.43Z" fill="currentColor"/></>}
        {channel === 'messenger' && <path d="M12 2.5c-5.53 0-10 4.1-10 9.16 0 2.88 1.45 5.45 3.72 7.13v3.2l3.4-1.87c.91.25 1.88.39 2.88.39 5.52 0 10-4.1 10-9.16S17.52 2.5 12 2.5Zm1.02 12.33-2.55-2.72-4.98 2.72 5.48-5.82 2.61 2.72 4.92-2.72-5.48 5.82Z" fill="currentColor"/>}
        {channel === 'instagram' && <><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="17.6" cy="6.6" r="1.1" fill="currentColor"/></>}
        {channel === 'email' && <><rect x="2.8" y="4.5" width="18.4" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m3.8 6 8.2 6.4L20.2 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></>}
        {channel === 'telegram' && <path d="m21.2 4.1-3.2 15.1c-.24 1.07-.86 1.34-1.75.83l-4.85-3.57-2.34 2.25c-.26.26-.48.48-.98.48l.35-4.94 8.99-8.12c.39-.35-.09-.55-.6-.2L5.7 12.9l-4.7-1.47c-1.02-.32-1.04-1.02.21-1.52L19.6 2.6c.86-.32 1.61.2 1.6 1.5Z" fill="currentColor"/>}
      </svg>
    </span>
  );
}

function MessageStatus({ status }: { status?: CommunicationMessage['status'] }) {
  if (status === 'failed') return <Tag type="red">发送失败</Tag>;
  if (status === 'read') return <Tag type="green">已读</Tag>;
  if (status === 'delivered') return <Tag type="blue">已送达</Tag>;
  if (status === 'sent') return <Tag type="cool-gray">已发送</Tag>;
  return null;
}

export function CustomerCommunicationsPage() {
  const [conversations, setConversations] = useState<CommunicationConversation[]>(communicationConversations);
  const [messages, setMessages] = useState<CommunicationMessage[]>(communicationMessages);
  const [activeId, setActiveId] = useState('conversation-nordic');
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [channelFilter, setChannelFilter] = useState<CommunicationChannel | 'all'>('all');
  const [query, setQuery] = useState('');
  const [replyChannel, setReplyChannel] = useState<CommunicationChannel>('whatsapp');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [mobileChat, setMobileChat] = useState(false);
  const [profileOpen, setProfileOpen] = useState(() => typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? conversations[0];
  const activeCustomer = communicationCustomers.find((item) => item.id === activeConversation.customerId) ?? communicationCustomers[0];
  const customerChannels = activeCustomer.identities.map((identity) => identity.channel);
  const replyOptions = channelOptions.filter((option) => customerChannels.includes(option.id));
  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    const customer = communicationCustomers.find((item) => item.id === conversation.customerId);
    if (!customer) return false;
    const matchesQuery = [customer.company, customer.contact, customer.role, ...customer.tags]
      .join(' ').toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = filter === 'all'
      || (filter === 'unread' ? conversation.unread > 0 : conversation.state === filter);
    const matchesChannel = channelFilter === 'all' || conversation.channel === channelFilter;
    return matchesQuery && matchesStatus && matchesChannel;
  }), [conversations, filter, channelFilter, query]);

  const activeMessages = messages
    .filter((message) => message.conversationId === activeConversation.id)
    .sort((a, b) => a.time - b.time);

  const selectConversation = (conversation: CommunicationConversation) => {
    setActiveId(conversation.id);
    setMobileChat(true);
    setReplyChannel(conversation.channel);
    setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, unread: 0 } : item));
    setNotice('');
  };

  const sendReply = () => {
    const body = draft.trim();
    if (!body) return;
    const time = Date.now();
    const message: CommunicationMessage = {
      id: 'local-' + time,
      conversationId: activeConversation.id,
      channel: replyChannel,
      direction: 'outbound',
      kind: 'text',
      body,
      time,
      status: 'sent',
    };
    setMessages((current) => [...current, message]);
    setConversations((current) => current.map((item) => item.id === activeConversation.id
      ? { ...item, channel: replyChannel, preview: body, updatedAt: time, state: 'open' }
      : item));
    setDraft('');
    setNotice('演示模式：回复已加入本地消息时间线，尚未连接真实渠道发送服务。');
  };

  return (
    <main className="cc-page" aria-label="客户沟通工作台">
      <header className="cc-page-header">
        <div className="cc-page-heading">
          <Heading>客户沟通工作台</Heading>
          <p>统一处理跨渠道客户消息与跟进</p>
        </div>
        
      </header>

      {notice && (
        <InlineNotification
          kind="info"
          lowContrast
          title="本地演示"
          subtitle={notice}
          onCloseButtonClick={() => setNotice('')}
        />
      )}

      <section className={'cc-workspace' + (mobileChat ? ' cc-workspace--mobile-chat' : '') + (!profileOpen ? ' cc-workspace--profile-collapsed' : '')}>
        <aside className="cc-list-panel" aria-label="会话列表">
          <div className="cc-panel-heading">
            <Heading className="cc-section-title">会话</Heading>
            <span className="cc-result-count">{visibleConversations.length} 条</span>
          </div>
          <div className="cc-list-controls">
            <Search
              size="lg"
              labelText="搜索会话"
              placeholder="搜索公司、联系人或标签"
              value={query}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value)}
            />
            <div className="cc-channel-filter-control">
            {channelFilter !== 'all' && <ChannelLogo channel={channelFilter} size="md" />}
            <Dropdown
              id="cc-channel-filter"
              titleText="渠道"
              label="全部渠道"
              size="md"
              items={[{ id: 'all', text: '全部渠道' }, ...channelOptions]}
              itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''}
              selectedItem={[{ id: 'all', text: '全部渠道' }, ...channelOptions].find((item) => item.id === channelFilter) ?? null}
              onChange={({ selectedItem }: { selectedItem?: { id: string; text: string } | null }) => {
                if (selectedItem) setChannelFilter(selectedItem.id as CommunicationChannel | 'all');
              }}
            />
            </div>
          </div>
          <div className="cc-status-filter">
            <Dropdown
              id="cc-status-filter"
              titleText="会话状态"
              label="全部"
              size="md"
              items={(Object.keys(statusLabels) as ConversationFilter[]).map((id) => ({ id, text: statusLabels[id] }))}
              itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''}
              selectedItem={{ id: filter, text: statusLabels[filter] }}
              onChange={({ selectedItem }: { selectedItem?: { id: string; text: string } | null }) => {
                if (selectedItem) setFilter(selectedItem.id as ConversationFilter);
              }}
            />
          </div>
          <div className="cc-conversation-list">
            {visibleConversations.map((conversation) => {
              const customer = communicationCustomers.find((item) => item.id === conversation.customerId)!;
              return (
                <Button
                  key={conversation.id}
                  kind="ghost"
                  size="lg"
                  className={'cc-conversation-row' + (conversation.id === activeId ? ' is-selected' : '')}
                  aria-current={conversation.id === activeId ? 'true' : undefined}
                  onClick={() => selectConversation(conversation)}
                >
                  <span className="cc-customer-initial" aria-hidden="true">{customer.contact.slice(0, 1)}</span>
                  <span className="cc-conversation-copy">
                    <strong>{customer.company}</strong>
                    <span>{customer.contact} · {customer.role}</span>
                    <small>{conversation.preview}</small>
                  </span>
                  <span className="cc-conversation-meta">
                    <time>{formatTime(conversation.updatedAt)}</time>
                    <ChannelLogo channel={conversation.channel} size="sm" />
                    {conversation.unread > 0 && <span className="cc-unread-count">{conversation.unread}</span>}
                  </span>
                </Button>
              );
            })}
            {visibleConversations.length === 0 && <p className="cc-empty-state">没有符合条件的会话</p>}
          </div>
        </aside>

        <section className="cc-chat-panel" aria-label="消息时间线">
          <header className="cc-chat-header">
            <div className="cc-chat-contact">
              <Button kind="ghost" size="sm" className="cc-mobile-back" onClick={() => setMobileChat(false)}>返回会话</Button>
              <div>
                <Heading className="cc-chat-company-title">{activeCustomer.company}</Heading>
                <p>{activeCustomer.contact} · {activeCustomer.role}</p>
              </div>
            </div>
            <div className="cc-chat-actions">
              <ChannelLogo channel={activeConversation.channel} size="md" />
              <Tag type={activeConversation.state === 'resolved' ? 'green' : activeConversation.state === 'pending' ? 'warm-gray' : 'blue'}>
                {activeConversation.state === 'resolved' ? '已解决' : activeConversation.state === 'pending' ? '待处理' : '处理中'}
              </Tag>
              <Button kind="tertiary" size="sm" onClick={() => setProfileOpen((open) => !open)}>
                {profileOpen ? '收起客户资料' : '客户资料'}
              </Button>
            </div>
          </header>

          <div className="cc-timeline">
            {activeMessages.map((message) => (
              <article
                key={message.id}
                className={'cc-message' + (message.direction === 'outbound' ? ' cc-message--outbound' : '') + (message.direction === 'system' ? ' cc-message--system' : '')}
              >
                <div className="cc-message-meta">
                  <ChannelLogo channel={message.channel} size="sm" />
                  <time>{formatDate(message.time)}</time>
                </div>
                {message.kind === 'email' ? (
                  <div className="cc-email-message">
                    <strong>{message.subject}</strong>
                    <p>{message.body}</p>
                  </div>
                ) : message.kind === 'file' ? (
                  <div className="cc-file-message">
                    <CarbonIcons.Document size={20} />
                    <div><strong>{message.filename}</strong><span>{message.fileSize} · {message.body}</span></div>
                  </div>
                ) : (
                  <div className="cc-message-body">{message.body}</div>
                )}
                <div className="cc-message-footer">
                  {message.direction === 'outbound' && <MessageStatus status={message.status} />}
                </div>
              </article>
            ))}
          </div>

          <footer className="cc-composer">
            <div className="cc-composer-channel">
              <div className="cc-reply-channel-control">
              <ChannelLogo channel={replyChannel} size="md" />
              <Dropdown
                id="cc-reply-channel"
                titleText="回复渠道"
                label="选择回复渠道"
                size="md"
                items={replyOptions}
                itemToString={(item: ChannelOption | null) => item?.text ?? ''}
                selectedItem={replyOptions.find((item) => item.id === replyChannel) ?? replyOptions[0] ?? null}
                onChange={({ selectedItem }: { selectedItem?: ChannelOption | null }) => {
                  if (selectedItem) setReplyChannel(selectedItem.id);
                }}
              />
              </div>
            </div>
            <TextArea
              id="cc-reply-draft"
              labelText="回复内容"
              hideLabel
              placeholder="输入消息内容…（Enter 发送，Shift + Enter 换行）"
              rows={3}
              value={draft}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.currentTarget.value)}
              onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendReply();
                }
              }}
            />
            <div className="cc-composer-actions">
              <span className="cc-demo-hint">本地演示 · 不会发送真实消息</span>
              <Button kind="primary" size="md" renderIcon={CarbonIcons.Send} disabled={!draft.trim()} onClick={sendReply}>发送</Button>
            </div>
          </footer>
        </section>

        {profileOpen && (
          <aside className="cc-profile-panel" aria-label="客户档案">
            <div className="cc-panel-heading">
              <Heading className="cc-profile-title">客户档案</Heading>
              <Button kind="ghost" size="sm" onClick={() => setProfileOpen(false)}>收起</Button>
            </div>
            <div className="cc-profile-scroll">
              <div className="cc-profile-identity">
                <span className="cc-customer-initial cc-customer-initial--large">{activeCustomer.contact.slice(0, 1)}</span>
                <div><strong>{activeCustomer.contact}</strong><span>{activeCustomer.role}</span><span>{activeCustomer.company}</span></div>
              </div>
              <section className="cc-profile-section">
                <Heading className="cc-profile-section-title">基本信息</Heading>
                <dl className="cc-details">
                  <dt>地区</dt><dd>{activeCustomer.region}</dd>
                  <dt>电子邮件</dt><dd>{activeCustomer.email}</dd>
                  <dt>电话</dt><dd>{activeCustomer.phone}</dd>
                </dl>
              </section>
              <section className="cc-profile-section">
                <Heading className="cc-profile-section-title">渠道身份</Heading>
                {activeCustomer.identities.map((identity) => (
                  <div className="cc-identity-row" key={identity.channel}>
                    <ChannelLogo channel={identity.channel} size="sm" />
                    <span>{identity.account}</span>
                  </div>
                ))}
              </section>
              <section className="cc-profile-section">
                <Heading className="cc-profile-section-title">客户标签</Heading>
                <div className="cc-customer-tags">{activeCustomer.tags.map((tag) => <Tag key={tag} type="cool-gray">{tag}</Tag>)}</div>
              </section>
              <section className="cc-profile-section">
                <Heading className="cc-profile-section-title">会话信息</Heading>
                <dl className="cc-details">
                  <dt>会话状态</dt><dd>{statusLabels[activeConversation.state === 'open' ? 'all' : activeConversation.state]}</dd>
                  <dt>最近沟通</dt><dd>{formatDate(activeConversation.updatedAt)}</dd>
                  <dt>负责人</dt><dd>当前用户</dd>
                </dl>
              </section>
            </div>
          </aside>
        )}
      </section>
    </main>
  );
}

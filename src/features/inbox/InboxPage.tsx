import { useEffect, useMemo, useState } from 'react';
import { Button, Search, Tag, Tile, TextArea, CarbonIcons, InlineLoading } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { getInboxConversations, getInboxMessages, type InboxConversation, type InboxTimelineItem } from './api';
import './InboxPage.scss';

const channels = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'line', label: 'LINE' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'wecom', label: 'WeCom' },
  { id: 'email', label: 'Email' },
];
const channelLabel = (id?: string | null) => channels.find(channel => channel.id === id)?.label ?? '未知渠道';
const formatTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '';

export function InboxPage() {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selected, setSelected] = useState<InboxConversation | null>(null);
  const [messages, setMessages] = useState<InboxTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const client = await getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();
        if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
        const rows = await getInboxConversations(session.access_token);
        if (active) {
          setConversations(rows);
          setSelected(current => current ? rows.find(row => row.id === current.id) ?? null : null);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '读取会话失败。');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selected) {
      setMessages([]);
      return () => { active = false; };
    }
    void (async () => {
      setMessagesLoading(true);
      try {
        const client = await getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();
        if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
        const rows = await getInboxMessages(session.access_token, selected.id);
        if (active) setMessages(rows);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '读取消息失败。');
      } finally {
        if (active) setMessagesLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selected?.id]);

  const visibleConversations = useMemo(() => conversations.filter(row => {
    const matchesChannel = channelFilter === 'all' || row.last_channel_type === channelFilter;
    const haystack = [
      row.display_name, row.contact_display_name, row.contact?.email, row.contact?.phone,
      row.contact?.mobile, row.last_message_preview,
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return matchesChannel && haystack.includes(query.trim().toLocaleLowerCase());
  }), [conversations, channelFilter, query]);

  return (
    <main className="tp-inbox">
      <header className="tp-inbox__header">
        <div>
          <p className="tp-inbox__eyebrow">CUSTOMER COMMUNICATION</p>
          <h1>消息 <span>Inbox</span></h1>
          <p className="tp-inbox__description">统一查看和处理来自不同渠道的客户沟通。</p>
        </div>
        <div className="tp-inbox__header-actions">
          <Button kind="tertiary" renderIcon={CarbonIcons.Settings} disabled>渠道设置</Button>
        </div>
      </header>

      {error && <div className="tp-inbox__error" role="alert">{error}</div>}

      <section className="tp-inbox__workspace" aria-label="消息工作台">
        <aside className="tp-inbox__conversations">
          <div className="tp-inbox__list-header">
            <h2>会话 <span>Conversations</span></h2>
            <Tag type="cool-gray">{conversations.length}</Tag>
          </div>
          <Search
            size="lg"
            labelText="搜索会话"
            placeholder="搜索公司、联系人、电话或邮箱"
            value={query}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          />
          <div className="tp-inbox__filters" aria-label="渠道筛选">
            <Button size="sm" kind={channelFilter === 'all' ? 'primary' : 'tertiary'} onClick={() => setChannelFilter('all')}>全部</Button>
            {channels.map(channel => (
              <Button key={channel.id} size="sm" kind={channelFilter === channel.id ? 'primary' : 'tertiary'} onClick={() => setChannelFilter(channel.id)}>{channel.label}</Button>
            ))}
          </div>
          <div className="tp-inbox__conversation-list">
            {loading && <InlineLoading description="正在加载会话…" />}
            {!loading && visibleConversations.map(row => (
              <button
                type="button"
                key={row.id}
                className={'tp-inbox__conversation-item' + (selected?.id === row.id ? ' is-selected' : '')}
                onClick={() => { setSelected(row); setError(''); }}
              >
                <span className="tp-inbox__avatar">{(row.display_name || '客').slice(0, 1).toUpperCase()}</span>
                <span className="tp-inbox__conversation-copy">
                  <span className="tp-inbox__conversation-title">{row.display_name}</span>
                  <span className="tp-inbox__conversation-contact">{row.contact_display_name}{row.contact?.job_title ? ' · ' + row.contact.job_title : ''}</span>
                  <span className="tp-inbox__conversation-preview">{row.last_message_preview || '暂无消息内容'}</span>
                </span>
                <span className="tp-inbox__conversation-meta">
                  <span>{formatTime(row.last_message_at)}</span>
                  {row.last_channel_type && <Tag type="blue">{channelLabel(row.last_channel_type)}</Tag>}
                  {row.unread_count > 0 && <Tag type="red">{row.unread_count}</Tag>}
                </span>
              </button>
            ))}
            {!loading && visibleConversations.length === 0 && (
              <div className="tp-inbox__empty-list">
                <CarbonIcons.Chat size={28} />
                <h3>{conversations.length ? '没有匹配的会话' : '暂无会话'}</h3>
                <p>{conversations.length ? '尝试更换搜索词或渠道筛选。' : '连接沟通渠道并收到客户消息后，会话会显示在这里。'}</p>
              </div>
            )}
          </div>
        </aside>

        <section className="tp-inbox__thread" aria-label="聊天内容">
          {selected ? (
            <>
              <div className="tp-inbox__thread-header">
                <div>
                  <h2>{selected.display_name}</h2>
                  <p>{selected.contact_display_name}{selected.contact?.job_title ? ' · ' + selected.contact.job_title : ''}</p>
                </div>
                <div className="tp-inbox__thread-tools">
                  {selected.last_channel_type && <Tag type="blue">{channelLabel(selected.last_channel_type)}</Tag>}
                  <Button kind="ghost" size="sm" renderIcon={CarbonIcons.Download} disabled>导出会话</Button>
                </div>
              </div>
              <div className="tp-inbox__timeline">
                {messagesLoading && <InlineLoading description="正在加载消息…" />}
                {!messagesLoading && messages.length === 0 && (
                  <div className="tp-inbox__thread-empty">
                    <CarbonIcons.Chat size={36} />
                    <h2>暂无消息</h2>
                    <p>该客户暂时没有已归档的跨渠道消息。</p>
                  </div>
                )}
                {messages.map((item, index) => {
                  const previous = messages[index - 1];
                  const channelChanged = item.timeline_type === 'message' && previous?.timeline_type === 'message' && previous.channel_type !== item.channel_type;
                  return (
                    <div key={item.id}>
                      {channelChanged && <div className="tp-inbox__channel-divider">切换至 {channelLabel(item.channel_type)} · {formatTime(item.created_at)}</div>}
                      <article className={'tp-inbox__message ' + (item.timeline_type === 'internal_note' ? 'is-note' : item.direction === 'outbound' ? 'is-outbound' : 'is-inbound')}>
                        <div className="tp-inbox__message-meta">
                          {item.timeline_type === 'internal_note' ? '内部备注' : channelLabel(item.channel_type)}
                          <span>{formatTime(item.created_at)}</span>
                          {item.status && <span>{item.status}</span>}
                        </div>
                        {item.email_subject && <strong className="tp-inbox__email-subject">{item.email_subject}</strong>}
                        <p>{item.content}</p>
                        {item.translated_content && <div className="tp-inbox__translation"><span>DeepL</span>{item.translated_content}</div>}
                      </article>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="tp-inbox__thread-empty">
              <CarbonIcons.Chat size={40} />
              <h2>选择一个会话</h2>
              <p>从左侧选择客户，即可查看跨渠道消息时间线。</p>
            </div>
          )}
          <div className="tp-inbox__composer" aria-label="消息编辑区">
            <div className="tp-inbox__composer-meta">
              <Tag type="cool-gray">回复渠道：{selected?.last_channel_type ? channelLabel(selected.last_channel_type) : '等待选择会话'}</Tag>
              <span>发送功能将在渠道授权完成后启用</span>
            </div>
            <TextArea id="inbox-message-draft" labelText="撰写消息" hideLabel placeholder="选择会话后开始撰写消息…" value={draft} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)} rows={3} disabled />
            <div className="tp-inbox__composer-actions">
              <Button kind="ghost" size="sm" renderIcon={CarbonIcons.Attachment} disabled>添加附件</Button>
              <Button size="md" renderIcon={CarbonIcons.Send} disabled>发送消息</Button>
            </div>
          </div>
        </section>

        <aside className="tp-inbox__insights" aria-label="AI 助手与客户业务数据">
          <section className="tp-inbox__panel">
            <div className="tp-inbox__panel-heading">
              <h2>AI 助手 <span>AI Assist</span></h2>
              <CarbonIcons.Chat size={20} />
            </div>
            <p className="tp-inbox__muted">结合客户沟通与 ERP 业务记录，辅助整理客户诉求和跟进建议。</p>
            <Button kind="tertiary" size="sm" renderIcon={CarbonIcons.Chat} disabled>生成会话总结</Button>
            <div className="tp-inbox__placeholder">{selected?.ai_summary || '选择会话后，将在此显示客户摘要、待确认事项和建议回复。'}</div>
          </section>
          <section className="tp-inbox__panel">
            <h2>业务概览 <span>Business Overview</span></h2>
            <div className="tp-inbox__metrics">
              <Tile><span>总订单数</span><strong>—</strong></Tile>
              <Tile><span>累计交易额</span><strong>—</strong></Tile>
              <Tile><span>进行中订单</span><strong>—</strong></Tile>
            </div>
            <div className="tp-inbox__placeholder">选择客户后，显示订单趋势及报价、订单、发运和收款单据入口。</div>
          </section>
        </aside>
      </section>
    </main>
  );
}

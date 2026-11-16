import { useEffect, useMemo, useState } from 'react';
import '@/design-system/patterns/inbox.scss';
import {
  Button, Search, Tag, Tile, TextArea, CarbonIcons, InlineLoading, Modal, ModalBody, Select, SelectItem, TextInput,
  Grid, Column, Stack, ClickableTile, LineChart, ScaleTypes,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { getInboxConversations, createInboxConversation, getInboxMessages, getInboxBusinessMetrics, translateInboxMessage, generateInboxSummary, createInboxNote, sendInboxMessage, getInboxUnmatchedEvents, searchInboxCRMContacts, assignInboxUnmatchedEvent, type InboxConversation, type InboxTimelineItem, type InboxBusinessMetrics, type InboxUnmatchedEvent, type InboxCRMContact, type InboxContact } from './api';

const channels = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'line', label: 'LINE' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'wecom', label: 'WeCom' },
  { id: 'email', label: 'Email' },
];
const channelLabel = (id?: string | null) => channels.find(channel => channel.id === id)?.label ?? '未知渠道';
const messageStatusLabel = (status?: string) => {
  const labels: Record<string, string> = {
    queued: '排队中', sending: '发送中', sent: '已发送',
    delivered: '已送达', read: '已读', received: '已接收', failed: '发送失败',
  };
  return status ? labels[status] ?? status : '';
};
const formatTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '';
const formatFileSize = (value?: number) => {
  if (!value || !Number.isFinite(value)) return '大小未知';
  if (value < 1024) return value + ' B';
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
  return (value / (1024 * 1024)).toFixed(1) + ' MB';
};
const attachmentScanLabel = (status: string) => ({
  pending: '待安全扫描',
  clean: '已通过安全检查',
  rejected: '已隔离',
  unavailable: '扫描服务不可用',
}[status] ?? '状态未知');
const attachmentScanTag = (status: string) => ({
  pending: 'cool-gray',
  clean: 'green',
  rejected: 'red',
  unavailable: 'warm-gray',
}[status] ?? 'cool-gray');

export function InboxPage() {
  const [query, setQuery] = useState('');
  const [mobileQuery, setMobileQuery] = useState('');
  const [mobileContacts, setMobileContacts] = useState<Array<InboxContact & { crm_accounts?: { account_name?: string | null } | null }>>([]);
  const [mobileContactsLoading, setMobileContactsLoading] = useState(true);
  const [openingContactId, setOpeningContactId] = useState('');
  const [draft, setDraft] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selected, setSelected] = useState<InboxConversation | null>(null);
  const [messages, setMessages] = useState<InboxTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');
  const [composerMode, setComposerMode] = useState<'reply' | 'note'>('reply');
  const [savingNote, setSavingNote] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [translatingMessageId, setTranslatingMessageId] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [businessMetrics, setBusinessMetrics] = useState<InboxBusinessMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [unmatchedEvents, setUnmatchedEvents] = useState<InboxUnmatchedEvent[]>([]);
  const [matchingEvent, setMatchingEvent] = useState<InboxUnmatchedEvent | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [contactOptions, setContactOptions] = useState<InboxCRMContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const [eventAssigning, setEventAssigning] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      setMobileContactsLoading(true);
      try {
        const client = await getSupabaseClient();
        const { data, error: queryError } = await client.from('crm_contacts')
          .select('id,full_name,first_name,last_name,job_title,email,phone,mobile,preferred_language,account_id,crm_accounts(account_name)')
          .eq('is_archived', false).eq('is_active', true).order('full_name', { ascending: true }).limit(1000);
        if (queryError) throw queryError;
        if (active) setMobileContacts((data ?? []) as unknown as Array<InboxContact & { crm_accounts?: { account_name?: string | null } | null }>);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '读取 CRM 联系人失败。');
      } finally {
        if (active) setMobileContactsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const openMobileContact = async (contact: InboxContact & { crm_accounts?: { account_name?: string | null } | null }) => {
    if (openingContactId) return;
    setOpeningContactId(contact.id);
    setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      const conversation = await createInboxConversation(session.access_token, contact.id);
      const fullName = contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '未命名联系人';
      const accountName = contact.crm_accounts?.account_name || '';
      const selectedConversation: InboxConversation = {
        ...conversation, display_name: accountName || fullName, contact_display_name: fullName,
        contact, account: contact.account_id ? { id: contact.account_id, account_name: accountName } : null,
      };
      setSelected(selectedConversation);
      setConversations(rows => [selectedConversation, ...rows.filter(row => row.id !== selectedConversation.id)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '打开客户聊天失败。');
    } finally {
      setOpeningContactId('');
    }
  };

  const visibleMobileContacts = useMemo(() => {
    const q = mobileQuery.trim().toLocaleLowerCase();
    if (!q) return mobileContacts;
    return mobileContacts.filter(contact => [
      contact.full_name, contact.first_name, contact.last_name, contact.job_title,
      contact.crm_accounts?.account_name, contact.email, contact.phone, contact.mobile,
    ].filter(Boolean).join(' ').toLocaleLowerCase().includes(q));
  }, [mobileContacts, mobileQuery]);

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


  useEffect(() => {
    let active = true;
    let channel: ReturnType<Awaited<ReturnType<typeof getSupabaseClient>>['channel']> | null = null;
    void (async () => {
      try {
        const client = await getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();
        if (!session?.access_token || !active) return;
        channel = client.channel('inbox-list:' + session.user.id)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'inbox_conversations',
            filter: 'owner_id=eq.' + session.user.id,
          }, async () => {
            try {
              const rows = await getInboxConversations(session.access_token);
              if (active) setConversations(rows);
            } catch (cause) {
              if (active) setError(cause instanceof Error ? cause.message : '刷新会话失败。');
            }
          })
          .subscribe();
      } catch {
        // Initial REST loading remains available if realtime cannot connect.
      }
    })();
    return () => {
      active = false;
      if (channel) void getSupabaseClient().then(client => client.removeChannel(channel!));
    };
  }, []);

  const sendMessage = async () => {
    if (!selected || !draft.trim() || sendingMessage) return;
    setSendingMessage(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      await sendInboxMessage(session.access_token, selected.id, draft.trim());
      const rows = await getInboxMessages(session.access_token, selected.id);
      setMessages(rows);
      const conversations = await getInboxConversations(session.access_token);
      setConversations(conversations);
      setSelected(conversations.find(row => row.id === selected.id) ?? selected);
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发送消息失败。');
    } finally {
      setSendingMessage(false);
    }
  };

  const addInternalNote = async () => {
    if (!selected || !draft.trim() || savingNote) return;
    setSavingNote(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      await createInboxNote(session.access_token, selected.id, draft.trim());
      const rows = await getInboxMessages(session.access_token, selected.id);
      setMessages(rows);
      setDraft('');
      setComposerMode('reply');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '添加内部备注失败。');
    } finally {
      setSavingNote(false);
    }
  };


  useEffect(() => {
    let active = true;
    let channel: ReturnType<Awaited<ReturnType<typeof getSupabaseClient>>['channel']> | null = null;
    if (!selected) return () => { active = false; };
    void (async () => {
      try {
        const client = await getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();
        if (!session?.access_token || !active) return;
        const refresh = async () => {
          try {
            const rows = await getInboxMessages(session.access_token, selected.id);
            if (active) setMessages(rows);
          } catch (cause) {
            if (active) setError(cause instanceof Error ? cause.message : '刷新消息失败。');
          }
        };
        channel = client.channel('inbox-thread:' + selected.id)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'inbox_messages',
            filter: 'conversation_id=eq.' + selected.id,
          }, () => { void refresh(); })
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'inbox_internal_notes',
            filter: 'conversation_id=eq.' + selected.id,
          }, () => { void refresh(); })
          .subscribe();
      } catch {
        // The REST timeline remains usable without realtime.
      }
    })();
    return () => {
      active = false;
      if (channel) void getSupabaseClient().then(client => client.removeChannel(channel!));
    };
  }, [selected?.id]);


  useEffect(() => {
    let active = true;
    if (!selected) {
      setBusinessMetrics(null);
      return () => { active = false; };
    }
    void (async () => {
      setMetricsLoading(true);
      try {
        const client = await getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();
        if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
        const metrics = await getInboxBusinessMetrics(session.access_token, selected.contact_id);
        if (active) setBusinessMetrics(metrics);
      } catch (cause) {
        if (active) setBusinessMetrics(null);
        if (active) setError(cause instanceof Error ? cause.message : '读取客户业务概览失败。');
      } finally {
        if (active) setMetricsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selected?.contact_id]);


  const translateMessage = async (messageId: string) => {
    if (translatingMessageId) return;
    setTranslatingMessageId(messageId);
    setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      await translateInboxMessage(session.access_token, messageId);
      const rows = selected ? await getInboxMessages(session.access_token, selected.id) : [];
      setMessages(rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'DeepL 翻译失败。');
    } finally {
      setTranslatingMessageId('');
    }
  };


  const generateSummary = async () => {
    if (!selected || summaryLoading) return;
    setSummaryLoading(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      const summary = await generateInboxSummary(session.access_token, selected.id);
      const updated = { ...selected, ai_summary: summary };
      setSelected(updated);
      setConversations(rows => rows.map(row => row.id === selected.id ? updated : row));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 会话总结失败。');
    } finally {
      setSummaryLoading(false);
    }
  };

  const searchContacts = async () => {
    if (contactSearch.trim().length < 2 || contactSearchLoading) return;
    setContactSearchLoading(true);
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      setContactOptions(await searchInboxCRMContacts(session.access_token, contactSearch.trim()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '搜索 CRM 联系人失败。');
    } finally {
      setContactSearchLoading(false);
    }
  };

  const assignUnmatchedEvent = async () => {
    if (!matchingEvent || !selectedContactId || eventAssigning) return;
    setEventAssigning(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      await assignInboxUnmatchedEvent(session.access_token, matchingEvent.id, selectedContactId);
      const [events, rows] = await Promise.all([
        getInboxUnmatchedEvents(session.access_token),
        getInboxConversations(session.access_token),
      ]);
      setUnmatchedEvents(events);
      setConversations(rows);
      setSelected(current => current ? rows.find(row => row.id === current.id) ?? current : null);
      setMatchingEvent(null);
      setContactSearch('');
      setContactOptions([]);
      setSelectedContactId('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '关联客户失败。');
    } finally {
      setEventAssigning(false);
    }
  };

  const visibleConversations = useMemo(() => conversations.filter(row => {
    const matchesChannel = channelFilter === 'all' || row.last_channel_type === channelFilter;
    const haystack = [
      row.display_name, row.contact_display_name, row.contact?.email, row.contact?.phone,
      row.contact?.mobile, row.last_message_preview,
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return matchesChannel && haystack.includes(query.trim().toLocaleLowerCase());
  }), [conversations, channelFilter, query]);



  return (
    <div className={`tp-inbox-page ${selected ? "has-selection" : "has-no-selection"}`}>
    <Stack gap={5}>
      <Stack orientation="horizontal" gap={4}>
        <Stack gap={2}>
          <p> CUSTOMER COMMUNICATION </p>
          <h1>消息 <span>Inbox</span></h1>
          <p>统一查看和处理来自不同渠道的客户沟通。</p>
        </Stack>
      </Stack>


      {unmatchedEvents.length > 0 && (
        <Tile>
          <Stack gap={3}>
            <Stack orientation="horizontal">
              <h2>待匹配消息 <span>Unmatched Messages</span></h2>
              <Tag type="warm-gray">{unmatchedEvents.length}</Tag>
            </Stack>
            <p>这些消息已通过渠道验签，但发送者尚未关联到 CRM 联系人。匹配后才会进入客户会话。</p>
            {unmatchedEvents.map(event => (
              <Stack key={event.id} gap={2}>
                <Stack orientation="horizontal" gap={2}>
                  <Tag type="blue">{channelLabel(event.channel_type)}</Tag>
                  <strong>{event.payload.displayName || event.payload.username || event.payload.externalUserId || '未知发送者'}</strong>
                  <span>{formatTime(event.received_at)}</span>
                </Stack>
                <p>{event.payload.content || '（无文本内容）'}</p>
                <Button kind="tertiary" size="sm" onClick={() => {
                  setMatchingEvent(event);
                  setContactSearch('');
                  setContactOptions([]);
                  setSelectedContactId('');
                }}>匹配 CRM 联系人</Button>
              </Stack>
            ))}
          </Stack>
        </Tile>
      )}

      {error && <Tile><Tag type="red">操作失败</Tag><p>{error}</p></Tile>}

      <section className={selected ? 'tp-inbox-mobile-directory is-hidden-mobile' : 'tp-inbox-mobile-directory'}>
        <div className="tp-inbox-mobile-directory-heading"><h1>联系人</h1><span>{mobileContacts.length}</span></div>
        <Search size="lg" labelText="搜索联系人" placeholder="搜索姓名、职位、公司、电话或邮箱" value={mobileQuery}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMobileQuery(event.target.value)} />
        {mobileContactsLoading && <InlineLoading description="正在读取客户联系人…" />}
        {!mobileContactsLoading && visibleMobileContacts.map(contact => (
          <button type="button" className="tp-inbox-mobile-contact" key={contact.id}
            onClick={() => void openMobileContact(contact)} disabled={Boolean(openingContactId)}>
            <span className="tp-inbox-contact-avatar"><CarbonIcons.UserAvatar size={32} /></span>
            <span className="tp-inbox-contact-content">
              <strong>{contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '未命名联系人'}</strong>
              <span>{[contact.job_title, contact.crm_accounts?.account_name].filter(Boolean).join(' · ') || '未设置职位与公司'}</span>
            </span>
            {openingContactId === contact.id ? <InlineLoading description="打开中" /> : <CarbonIcons.ChevronRight size={20} />}
          </button>
        ))}
        {!mobileContactsLoading && visibleMobileContacts.length === 0 && <p className="tp-inbox-mobile-empty">{mobileContacts.length ? '没有匹配的联系人' : '暂无客户联系人'}</p>}
      </section>

      <Grid fullWidth className="tp-inbox-layout">
        <Column className={selected ? "tp-inbox-conversation-column is-hidden-mobile" : "tp-inbox-conversation-column"} sm={4} md={4} lg={3}>
          <Stack gap={3} className="tp-inbox-list-panel">
            <Stack orientation="horizontal">
              <h2 className="tp-inbox-section-title">会话</h2>
              <Tag type="cool-gray">{conversations.length}</Tag>
            </Stack>
            <Search size="lg" labelText="搜索会话" placeholder="搜索公司、联系人、电话或邮箱" value={query}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} />
            <Stack orientation="horizontal" gap={2} className="tp-inbox-channel-filters">
              <Button size="sm" kind={channelFilter === 'all' ? 'primary' : 'tertiary'} onClick={() => setChannelFilter('all')}>全部</Button>
              {channels.map(channel => (
                <Button key={channel.id} size="sm" kind={channelFilter === channel.id ? 'primary' : 'tertiary'} onClick={() => setChannelFilter(channel.id)}>{channel.label}</Button>
              ))}
            </Stack>
            {loading && <InlineLoading description="正在加载会话…" />}
            {!loading && visibleConversations.map(row => (
              <ClickableTile
                key={row.id}
                className={selected?.id === row.id ? 'tp-inbox__selected tp-inbox-contact-item' : 'tp-inbox-contact-item'}
                onClick={() => { setSelected(row); setError(''); }}
              >
                <span className="tp-inbox-contact-avatar" aria-hidden="true"><CarbonIcons.UserAvatar size={28} /></span>
                <span className="tp-inbox-contact-content">
                  <span className="tp-inbox-contact-topline">
                    <strong>{row.contact?.full_name || row.contact_display_name}</strong>
                    <time>{row.last_message_at ? formatTime(row.last_message_at) : ''}</time>
                  </span>
                  <span className="tp-inbox-contact-subline">
                    {[row.contact?.job_title, row.account?.account_name || row.display_name].filter(Boolean).join(' · ')}
                  </span>
                  <span className="tp-inbox-contact-bottomline">
                    <span>{row.last_message_preview || '暂无消息'}</span>
                    {row.unread_count > 0 && <Tag type="green">{row.unread_count}</Tag>}
                  </span>
                </span>
              </ClickableTile>
            ))}
            {!loading && visibleConversations.length === 0 && (
              <Tile>
                <Stack gap={2}>
                  <CarbonIcons.Chat size={28} />
                  <strong>{conversations.length ? '没有匹配的会话' : '暂无会话'}</strong>
                  <p>{conversations.length ? '尝试更换搜索词或渠道筛选。' : '连接沟通渠道并收到客户消息后，会话会显示在这里。'}</p>
                </Stack>
              </Tile>
            )}
          </Stack>
        </Column>

        <Column className={selected ? "tp-inbox-message-column" : "tp-inbox-message-column is-hidden-mobile"} sm={4} md={8} lg={6}>
          <Stack gap={3} className="tp-inbox-chat-panel">
            {selected ? (
              <>
                <Stack orientation="horizontal" className="tp-inbox-conversation-heading">
                  <Button className="tp-inbox-mobile-back" kind="ghost" size="sm" onClick={() => setSelected(null)}>返回会话</Button>
                  <span className="tp-inbox-header-avatar" aria-hidden="true"><CarbonIcons.UserAvatar size={28} /></span>
                  <Stack gap={1} className="tp-inbox-header-contact">
                    <strong>{selected.contact?.full_name || selected.contact_display_name}</strong>
                    <p>{[selected.contact?.job_title, selected.account?.account_name || selected.display_name].filter(Boolean).join(' · ')}</p>
                  </Stack>
                  <Stack orientation="horizontal" gap={2}>
                    {selected.last_channel_type && <Tag type="blue">{channelLabel(selected.last_channel_type)}</Tag>}
                    <Button kind="ghost" size="sm" renderIcon={CarbonIcons.Download} disabled>导出会话</Button>
                  </Stack>
                </Stack>
                {messagesLoading && <InlineLoading description="正在加载消息…" />}
                <Stack gap={3} className="tp-inbox-message-list">
                  {!messagesLoading && messages.length === 0 && <Tile><p>该客户暂时没有已归档的跨渠道消息。</p></Tile>}
                  {messages.map((item, index) => {
                    const previous = messages[index - 1];
                    const channelChanged = item.timeline_type === 'message' && previous?.timeline_type === 'message' && previous.channel_type !== item.channel_type;
                    return (
                      <Stack key={item.id} gap={2} className={item.timeline_type === 'internal_note' ? 'tp-inbox-message-row is-note' : item.direction === 'outbound' ? 'tp-inbox-message-row is-outbound' : 'tp-inbox-message-row is-inbound'}>
                        {channelChanged && <p>──────── 切换至 {channelLabel(item.channel_type)} · {formatTime(item.created_at)} ────────</p>}
                        <Tile className="tp-inbox-message-bubble">
                          <Stack gap={2}>
                            <Stack orientation="horizontal" gap={2}>
                              <Tag type={item.timeline_type === 'internal_note' ? 'warm-gray' : item.direction === 'outbound' ? 'blue' : 'cool-gray'}>
                                {item.timeline_type === 'internal_note' ? '内部备注' : channelLabel(item.channel_type)}
                              </Tag>
                              <span>{formatTime(item.created_at)}</span>
                              {item.status && <span className="tp-inbox-message-status">{messageStatusLabel(item.status)} {item.direction === 'outbound' && (item.status === 'read' ? '✓✓' : '✓')}</span>}
                            </Stack>
                            {item.email_subject && <strong>{item.email_subject}</strong>}
                            <p>{item.content}</p>
                            {item.attachments?.length ? (
                              <Stack gap={2}>
                                <strong>附件（{item.attachments.length}）</strong>
                                {item.attachments.map(file => (
                                  <Tile key={file.id}>
                                    <Stack orientation="horizontal" gap={2}>
                                      <Stack gap={1}>
                                        <strong>{file.original_file_name}</strong>
                                        <span>{file.content_type} · {formatFileSize(file.file_size_bytes)}</span>
                                      </Stack>
                                      <Tag type={attachmentScanTag(file.scan_status) as 'cool-gray' | 'green' | 'red' | 'warm-gray'}>
                                        {attachmentScanLabel(file.scan_status)}
                                      </Tag>
                                    </Stack>
                                  </Tile>
                                ))}
                              </Stack>
                            ) : null}
                            {item.translated_content
                              ? <Tile><Tag type="cool-gray">DeepL · {item.target_language || '已翻译'}</Tag><p>{item.translated_content}</p></Tile>
                              : item.timeline_type === 'message' && item.direction === 'inbound' && <Button kind="ghost" size="sm" disabled={Boolean(translatingMessageId)} onClick={() => void translateMessage(item.id)}>{translatingMessageId === item.id ? '正在翻译…' : '翻译消息'}</Button>}
                          </Stack>
                        </Tile>
                      </Stack>
                    );
                  })}
                </Stack>
              </>
            ) : (
              <Tile>
                <Stack gap={3}>
                  <CarbonIcons.Chat size={40} />
                  <h2>选择一个会话</h2>
                  <p>从左侧选择客户，即可查看跨渠道消息时间线。</p>
                </Stack>
              </Tile>
            )}
            {selected && <Tile className="tp-inbox-composer">
              <Stack gap={3}>
                <Stack orientation="horizontal" gap={2}>
                  <Button size="sm" kind={composerMode === 'reply' ? 'primary' : 'tertiary'} onClick={() => setComposerMode('reply')}>回复客户</Button>
                  <Button size="sm" kind={composerMode === 'note' ? 'primary' : 'tertiary'} onClick={() => setComposerMode('note')} disabled={!selected}>内部备注</Button>
                </Stack>
                {composerMode === 'reply'
                  ? <Tag type="cool-gray">回复渠道：{selected?.last_channel_type ? channelLabel(selected.last_channel_type) : '等待选择会话'}</Tag>
                  : <Tag type="warm-gray">仅团队内部可见，不会发送给客户</Tag>}
                <TextArea id="inbox-message-draft" labelText={composerMode === 'note' ? '内部备注' : '撰写消息'}
                  placeholder={composerMode === 'note' ? '记录内部跟进信息…' : '输入要发送给客户的消息…'}
                  value={draft} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
                  rows={3} disabled={!selected || (composerMode === 'reply' && !['whatsapp', 'line', 'messenger', 'telegram'].includes(selected.last_channel_type || ''))} />
                {composerMode === 'note'
                  ? <Button size="md" renderIcon={CarbonIcons.Add} onClick={() => void addInternalNote()} disabled={!selected || !draft.trim() || savingNote}>{savingNote ? '正在保存…' : '添加内部备注'}</Button>
                  : <Button size="md" renderIcon={CarbonIcons.Send} onClick={() => void sendMessage()} disabled={!selected || !draft.trim() || sendingMessage || !['whatsapp', 'line', 'messenger', 'telegram'].includes(selected.last_channel_type || '')}>{sendingMessage ? '正在发送…' : '发送消息'}</Button>}
                {composerMode === 'reply' && <p>{selected?.last_channel_type === 'whatsapp' || selected?.last_channel_type === 'messenger'
                  ? 'WhatsApp / Messenger 将在服务窗口内发送；超出 24 小时窗口时，系统会拦截普通文本回复。'
                  : selected?.last_channel_type === 'line' || selected?.last_channel_type === 'telegram'
                    ? '发送前会检查客户渠道身份与凭证；企业微信和 Email 暂未开放发送。'
                    : '当前渠道暂不支持真实发送，请切换到已接入的 WhatsApp、LINE、Messenger 或 Telegram 会话。'}</p>}
              </Stack>
            </Tile>}
          </Stack>
        </Column>

        <Column className="tp-inbox-assist-column" sm={4} md={4} lg={3}>
          <Stack gap={4}>
            <Tile className="tp-inbox-ai-panel">
              <Stack gap={3}>
                <Stack orientation="horizontal">
                  <h2>AI 助手 <span>AI Assist</span></h2>
                  <CarbonIcons.Chat size={20} />
                </Stack>
                <p>结合客户沟通与 ERP 业务记录，辅助整理客户诉求和跟进建议。</p>
                <Button kind="tertiary" size="sm" renderIcon={CarbonIcons.Chat} disabled={!selected || summaryLoading} onClick={() => void generateSummary()}>{summaryLoading ? "正在生成…" : "生成会话总结"}</Button>
                <p>{selected?.ai_summary || '选择会话后生成客户摘要、待确认事项和建议回复。'}</p>
              </Stack>
            </Tile>
            <Tile className="tp-inbox-business-panel">
              <Stack gap={3}>
                <h2>业务概览 <span>Business Overview</span></h2>
                <Grid>
                  <Column sm={4} md={2} lg={4}><Tile><p>总订单数</p><h3>{metricsLoading ? '…' : businessMetrics?.total_order_count ?? '—'}</h3></Tile></Column>
                  <Column sm={4} md={3} lg={4}>
                    <Tile>
                      <p>累计交易额</p>
                      {metricsLoading ? <h3>…</h3> : businessMetrics?.total_amount_by_currency.length
                        ? businessMetrics.total_amount_by_currency.map(item => (
                          <p key={item.currency}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency, maximumFractionDigits: 0 }).format(item.amount)}</p>
                        ))
                        : <h3>—</h3>}
                    </Tile>
                  </Column>
                  <Column sm={4} md={3} lg={4}><Tile><p>进行中订单</p><h3>{metricsLoading ? '…' : businessMetrics?.active_order_count ?? '—'}</h3></Tile></Column>
                </Grid>
                <Stack orientation="horizontal" gap={2}>
                  <Tag type="cool-gray">销售订单 {businessMetrics?.total_order_count ?? 0}</Tag>
                  <Tag type="cool-gray">发运单 {businessMetrics?.shipment_count ?? 0}</Tag>
                  <Tag type="cool-gray">收款单 {businessMetrics?.payment_count ?? 0}</Tag>
                </Stack>
                {businessMetrics?.monthly_trend.length
                  ? <LineChart
                      data={businessMetrics.monthly_trend.map(item => ({ group: '订单数', period: item.period, value: item.order_count }))}
                      options={{
                        title: '订单趋势',
                        axes: {
                          bottom: { title: '月份', mapsTo: 'period', scaleType: ScaleTypes.LABELS },
                          left: { title: '订单数', mapsTo: 'value', scaleType: ScaleTypes.LINEAR },
                        },
                        height: '220px',
                        legend: { enabled: false },
                        points: { enabled: true },
                      }}
                    />
                  : <p>暂无可用的订单趋势数据。</p>}
                <p>统计基于现有 ERP 客户、销售订单、发运和收款记录；不同币种分别汇总。</p>
              </Stack>
            </Tile>
          </Stack>
        </Column>
      </Grid>


      <Modal
        open={Boolean(matchingEvent)}
        modalHeading="匹配 CRM 联系人"
        primaryButtonText={eventAssigning ? "正在关联…" : "关联并归档消息"}
        primaryButtonDisabled={eventAssigning || !selectedContactId}
        secondaryButtonText="取消"
        onRequestSubmit={() => void assignUnmatchedEvent()}
        onRequestClose={() => setMatchingEvent(null)}
      >
        <ModalBody>
          <Stack gap={4}>
            <Tile>
              <strong>{matchingEvent?.payload.displayName || matchingEvent?.payload.username || matchingEvent?.payload.externalUserId}</strong>
              <p>{matchingEvent?.payload.content || "（无文本内容）"}</p>
            </Tile>
            <TextInput id="inbox-contact-search" labelText="搜索 CRM 联系人" value={contactSearch}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setContactSearch(event.target.value)}
              placeholder="输入姓名、邮箱或电话" />
            <Button kind="tertiary" size="sm" onClick={() => void searchContacts()} disabled={contactSearch.length < 2 || contactSearchLoading}>
              {contactSearchLoading ? "正在搜索…" : "搜索联系人"}
            </Button>
            <Select id="inbox-contact-select" labelText="选择联系人" value={selectedContactId}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setSelectedContactId(event.target.value)}>
              <SelectItem value="" text="请选择 CRM 联系人" />
              {contactOptions.map(contact => (
                <SelectItem key={contact.id} value={contact.id}
                  text={[contact.display_name, contact.email, contact.phone || contact.mobile].filter(Boolean).join(" · ")} />
              ))}
            </Select>
            {contactOptions.length === 0 && <p>请先搜索 CRM 联系人，再选择正确的客户档案。</p>}
          </Stack>
        </ModalBody>
      </Modal>
    </Stack>
    </div>
  );
}

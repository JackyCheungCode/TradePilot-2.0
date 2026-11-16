import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Search, Tag, Tile, TextArea, CarbonIcons, InlineLoading, Modal, ModalBody, Select, SelectItem, TextInput,
  Grid, Column, Stack, ClickableTile, LineChart, ScaleTypes,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { getInboxConversations, getInboxMessages, getInboxBusinessMetrics, getInboxChannelReadiness, translateInboxMessage, generateInboxSummary, createInboxNote, sendInboxMessage, getInboxConnections, createInboxConnection, getInboxUnmatchedEvents, searchInboxCRMContacts, assignInboxUnmatchedEvent, type InboxConversation, type InboxTimelineItem, type InboxBusinessMetrics, type InboxChannelReadiness, type InboxConnection, type InboxUnmatchedEvent, type InboxCRMContact } from './api';

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
  const navigate = useNavigate();
  const [channelReadiness, setChannelReadiness] = useState<InboxChannelReadiness>({});
  const [query, setQuery] = useState('');
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
  const [connections, setConnections] = useState<InboxConnection[]>([]);
  const [unmatchedEvents, setUnmatchedEvents] = useState<InboxUnmatchedEvent[]>([]);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [connectionChannel, setConnectionChannel] = useState('whatsapp');
  const [connectionName, setConnectionName] = useState('');
  const [externalAccountId, setExternalAccountId] = useState('');
  const [connectionSaving, setConnectionSaving] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [matchingEvent, setMatchingEvent] = useState<InboxUnmatchedEvent | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [contactOptions, setContactOptions] = useState<InboxCRMContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const [eventAssigning, setEventAssigning] = useState(false);

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
        try {
          const readiness = await getInboxChannelReadiness(session.access_token);
          if (active) setChannelReadiness(readiness);
        } catch { /* Inbox remains usable when integration status is temporarily unavailable. */ }
        try {
          const [connectionRows, unmatchedRows] = await Promise.all([
            getInboxConnections(session.access_token),
            getInboxUnmatchedEvents(session.access_token),
          ]);
          if (active) {
            setConnections(connectionRows);
            setUnmatchedEvents(unmatchedRows);
          }
        } catch { /* Existing conversations remain available if connection setup data is unavailable. */ }
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

  const visibleConversations = useMemo(() => conversations.filter(row => {
    const matchesChannel = channelFilter === 'all' || row.last_channel_type === channelFilter;
    const haystack = [
      row.display_name, row.contact_display_name, row.contact?.email, row.contact?.phone,
      row.contact?.mobile, row.last_message_preview,
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return matchesChannel && haystack.includes(query.trim().toLocaleLowerCase());
  }), [conversations, channelFilter, query]);

  const channelSetup = [
    { id: 'whatsapp', label: 'WhatsApp', ready: Boolean(channelReadiness.whatsappAccessToken && channelReadiness.whatsappPhoneNumberId) },
    { id: 'line', label: 'LINE', ready: Boolean(channelReadiness.lineChannelAccessToken && channelReadiness.lineChannelSecret) },
    { id: 'messenger', label: 'Messenger', ready: Boolean(channelReadiness.messengerPageAccessToken && channelReadiness.messengerPageId) },
    { id: 'telegram', label: 'Telegram', ready: Boolean(channelReadiness.telegramBotToken) },
    { id: 'wecom', label: '企业微信', ready: Boolean(channelReadiness.wecomCorpId && channelReadiness.wecomSecret) },
    { id: 'email', label: 'Email', ready: Boolean(channelReadiness.emailImapHost && channelReadiness.emailSmtpHost && channelReadiness.emailUsername && channelReadiness.emailPassword) },
  ];

  return (
    <Stack gap={5}>
      <Stack orientation="horizontal" gap={4}>
        <Stack gap={2}>
          <p> CUSTOMER COMMUNICATION </p>
          <h1>消息 <span>Inbox</span></h1>
          <p>统一查看和处理来自不同渠道的客户沟通。</p>
        </Stack>
        <Button kind="tertiary" renderIcon={CarbonIcons.Settings} onClick={() => navigate("/settings?domain=integrations&section=api")}>渠道设置</Button>
      </Stack>

      <Grid fullWidth>
        {channelSetup.map(channel => (
          <Column key={channel.id} sm={2} md={4} lg={2}>
            <Tag type={channel.ready ? 'green' : 'cool-gray'}>{channel.label} · {channel.ready ? '凭证已配置' : '待配置'}</Tag>
          </Column>
        ))}
      </Grid>

      {error && <Tile><Tag type="red">读取失败</Tag><p>{error}</p></Tile>}

      <Grid fullWidth>
        <Column sm={4} md={3} lg={5}>
          <Stack gap={4}>
            <Stack orientation="horizontal">
              <h2>会话 <span>Conversations</span></h2>
              <Tag type="cool-gray">{conversations.length}</Tag>
            </Stack>
            <Search size="lg" labelText="搜索会话" placeholder="搜索公司、联系人、电话或邮箱" value={query}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} />
            <Stack orientation="horizontal" gap={2}>
              <Button size="sm" kind={channelFilter === 'all' ? 'primary' : 'tertiary'} onClick={() => setChannelFilter('all')}>全部</Button>
              {channels.map(channel => (
                <Button key={channel.id} size="sm" kind={channelFilter === channel.id ? 'primary' : 'tertiary'} onClick={() => setChannelFilter(channel.id)}>{channel.label}</Button>
              ))}
            </Stack>
            {loading && <InlineLoading description="正在加载会话…" />}
            {!loading && visibleConversations.map(row => (
              <ClickableTile key={row.id} className={selected?.id === row.id ? 'tp-inbox__selected' : ''} onClick={() => { setSelected(row); setError(''); }}>
                <Stack gap={2}>
                  <Stack orientation="horizontal">
                    <strong>{row.display_name}</strong>
                    <span>{formatTime(row.last_message_at)}</span>
                  </Stack>
                  <span>{row.contact_display_name}{row.contact?.job_title ? ' · ' + row.contact.job_title : ''}</span>
                  <span>{row.last_message_preview || '暂无消息内容'}</span>
                  <Stack orientation="horizontal" gap={2}>
                    {row.last_channel_type && <Tag type="blue">{channelLabel(row.last_channel_type)}</Tag>}
                    {row.unread_count > 0 && <Tag type="red">{row.unread_count}</Tag>}
                  </Stack>
                </Stack>
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

        <Column sm={4} md={5} lg={7}>
          <Stack gap={4}>
            {selected ? (
              <>
                <Stack orientation="horizontal">
                  <Stack gap={1}>
                    <h2>{selected.display_name}</h2>
                    <p>{selected.contact_display_name}{selected.contact?.job_title ? ' · ' + selected.contact.job_title : ''}</p>
                  </Stack>
                  <Stack orientation="horizontal" gap={2}>
                    {selected.last_channel_type && <Tag type="blue">{channelLabel(selected.last_channel_type)}</Tag>}
                    <Button kind="ghost" size="sm" renderIcon={CarbonIcons.Download} disabled>导出会话</Button>
                  </Stack>
                </Stack>
                {messagesLoading && <InlineLoading description="正在加载消息…" />}
                <Stack gap={3}>
                  {!messagesLoading && messages.length === 0 && <Tile><p>该客户暂时没有已归档的跨渠道消息。</p></Tile>}
                  {messages.map((item, index) => {
                    const previous = messages[index - 1];
                    const channelChanged = item.timeline_type === 'message' && previous?.timeline_type === 'message' && previous.channel_type !== item.channel_type;
                    return (
                      <Stack key={item.id} gap={2}>
                        {channelChanged && <p>──────── 切换至 {channelLabel(item.channel_type)} · {formatTime(item.created_at)} ────────</p>}
                        <Tile>
                          <Stack gap={2}>
                            <Stack orientation="horizontal" gap={2}>
                              <Tag type={item.timeline_type === 'internal_note' ? 'warm-gray' : item.direction === 'outbound' ? 'blue' : 'cool-gray'}>
                                {item.timeline_type === 'internal_note' ? '内部备注' : channelLabel(item.channel_type)}
                              </Tag>
                              <span>{formatTime(item.created_at)}</span>
                              {item.status && <span>{item.status}</span>}
                            </Stack>
                            {item.email_subject && <strong>{item.email_subject}</strong>}
                            <p>{item.content}</p>
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
            <Tile>
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
            </Tile>
          </Stack>
        </Column>

        <Column sm={4} md={8} lg={4}>
          <Stack gap={4}>
            <Tile>
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
            <Tile>
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
    </Stack>
  );
}

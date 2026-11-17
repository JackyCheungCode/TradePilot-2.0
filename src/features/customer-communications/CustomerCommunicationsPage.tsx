import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import {
  Button, IconButton, Search, TextInput, TextArea, Dropdown, Tag, InlineNotification, Heading, Modal, CarbonIcons,
} from '@/design-system';
import {
  communicationChannelLabels,
  communicationConversations,
  communicationCustomers,
  communicationMessages,
  type CommunicationChannel,
  type CommunicationCustomer,
  type CommunicationConversation,
  type CommunicationMessage,
} from './data';
import {
  getInboxSessionToken, getInboxConversations, getInboxConnections, getInboxMessages,
  sendInboxMessage, updateInboxConversation, searchInboxCrmContacts, createInboxConversation, createInboxChannelConnection,
  createInboxNote, generateInboxSummary, translateInboxMessage, getInboxAttachmentSignedUrl, searchInboxMessages,
  type InboxChannel, type InboxConversation, type InboxMessage, type InboxConnection, type InboxCrmContact,
} from './api';
import '@/design-system/styles/customer-communications.scss';

type ConversationFilter = 'all' | 'unread' | 'open' | 'pending' | 'resolved';
type ChannelOption = { id: CommunicationChannel; text: string };

const channelOptions: ChannelOption[] = Object.entries(communicationChannelLabels).map(([id, text]) => ({
  id: id as CommunicationChannel,
  text,
}));
const sendableChannels = new Set<CommunicationChannel>(['whatsapp', 'messenger', 'telegram', 'line']);

function mapInboxConversation(row: InboxConversation): { conversation: CommunicationConversation; customer: CommunicationCustomer } {
  const contact = row.contact ?? ({} as NonNullable<InboxConversation['contact']>);
  const contactName = row.contact_display_name || contact.full_name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '未命名联系人';
  const channel = (row.last_channel_type || row.identities[0]?.channel_type || 'email') as CommunicationChannel;
  const customer: CommunicationCustomer = {
    id: row.contact_id,
    company: row.account?.account_name || row.display_name || contactName,
    contact: contactName,
    avatarUrl: contact.avatar_url || undefined,
    role: contact.job_title || contact.department || '—',
    email: contact.email || '—',
    phone: contact.phone || contact.mobile || '—',
    region: contact.preferred_language || '—',
    industry: row.account?.industry || undefined,
    website: row.account?.website || undefined,
    tags: [],
    identities: row.identities.map((identity) => ({
      channel: identity.channel_type as CommunicationChannel,
      account: identity.external_display_name || identity.external_username || identity.external_user_id,
    })),
  };
  return {
    customer,
    conversation: {
      id: row.id,
      customerId: row.contact_id,
      state: row.status === 'pending' ? 'pending' : row.status === 'resolved' || row.status === 'closed' ? 'resolved' : 'open',
      unread: row.unread_count || 0,
      channel,
      updatedAt: Date.parse(row.last_message_at || '') || Date.now(),
      preview: row.last_message_preview || '暂无消息，等待客户联系',
    },
  };
}

function mapInboxMessage(row: InboxMessage): CommunicationMessage {
  const attachment = row.attachments?.[0];
  const isNote = row.timeline_type === 'internal_note' || row.direction === 'internal';
  const kind: CommunicationMessage['kind'] = isNote ? 'system' : row.content_type === 'email_card'
    ? 'email' : ['file', 'image', 'audio', 'video'].includes(row.content_type || '') ? 'file' : 'text';
  const bytes = attachment?.file_size_bytes ?? 0;
  const fileSize = bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    : bytes >= 1024 ? Math.round(bytes / 1024) + ' KB' : bytes ? bytes + ' B' : '附件';
  return {
    id: row.id, conversationId: row.conversation_id,
    channel: row.channel_type ? row.channel_type as CommunicationChannel : undefined,
    direction: isNote ? 'system' : row.direction === 'outbound' ? 'outbound' : 'inbound',
    kind, body: row.content || row.media_url || '（此消息没有文本内容）',
    translatedBody: row.translated_content || undefined,
    time: Date.parse(row.created_at) || Date.now(),
    status: isNote ? undefined : row.status,
    subject: row.email_subject || undefined, filename: attachment?.original_file_name || undefined,
    fileSize: attachment ? fileSize : undefined,
    attachments: row.attachments?.map(item => ({ id: item.id, filename: item.original_file_name, contentType: item.content_type, scanStatus: item.scan_status })),
  };
}

const formatTime = (timestamp: number) => new Intl.DateTimeFormat('zh-TW', {
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(timestamp);
const formatDate = (timestamp: number) => new Intl.DateTimeFormat('zh-TW', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(timestamp);
const conversationStateLabels: Record<CommunicationConversation['state'], string> = {
  open: '处理中',
  pending: '待处理',
  resolved: '已解决',
};
const statusLabels: Record<ConversationFilter, string> = {
  all: '全部',
  unread: '未读',
  open: '处理中',
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
    line: 'LINE',
    wecom: '企业微信',
  };
  return (
    <span className={`cc-channel-logo cc-channel-logo--${channel} cc-channel-logo--${size}`} role="img" aria-label={labels[channel]} title={labels[channel]}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {channel === 'whatsapp' && <><path d="M12 2.2a9.4 9.4 0 0 0-8.08 14.2L2.7 21.8l5.55-1.45A9.4 9.4 0 1 0 12 2.2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M8.1 7.7c.25-.55.5-.56.8-.57h.55c.17 0 .4.06.55.42l.78 1.87c.08.2.06.39-.07.57l-.58.72c-.15.18-.2.35-.06.59.48.82 1.17 1.5 2.02 1.96.24.13.42.1.58-.08l.75-.88c.17-.2.36-.24.59-.15l1.8.85c.28.13.43.2.46.35.03.15-.02.86-.48 1.32-.45.46-1.12.67-1.82.53-1.07-.2-2.4-.84-3.7-2.02-1.06-.96-1.8-2.14-2.03-3.05-.24-.9.02-1.83.36-2.43Z" fill="currentColor"/></>}
        {channel === 'messenger' && <path d="M12 2.5c-5.53 0-10 4.1-10 9.16 0 2.88 1.45 5.45 3.72 7.13v3.2l3.4-1.87c.91.25 1.88.39 2.88.39 5.52 0 10-4.1 10-9.16S17.52 2.5 12 2.5Zm1.02 12.33-2.55-2.72-4.98 2.72 5.48-5.82 2.61 2.72 4.92-2.72-5.48 5.82Z" fill="currentColor"/>}
        {channel === 'instagram' && <><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="17.6" cy="6.6" r="1.1" fill="currentColor"/></>}
        {channel === 'email' && <><rect x="2.8" y="4.5" width="18.4" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m3.8 6 8.2 6.4L20.2 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></>}
        {channel === 'telegram' && <path d="m21.2 4.1-3.2 15.1c-.24 1.07-.86 1.34-1.75.83l-4.85-3.57-2.34 2.25c-.26.26-.48.48-.98.48l.35-4.94 8.99-8.12c.39-.35-.09-.55-.6-.2L5.7 12.9l-4.7-1.47c-1.02-.32-1.04-1.02.21-1.52L19.6 2.6c.86-.32 1.61.2 1.6 1.5Z" fill="currentColor"/>}
        {channel === 'line' && <path d="M12 3C6.48 3 2 6.55 2 10.93c0 3.9 3.5 7.17 8.23 7.83.32.07.76.22.87.5.1.25.07.64.03.9l-.14.84c-.04.25-.2.97.86.53 1.06-.45 5.73-3.38 7.82-5.78C21.1 14.2 22 12.6 22 10.93 22 6.55 17.52 3 12 3Z" fill="currentColor"/>}
        {channel === 'wecom' && <><path d="M12 3C6.8 3 2.6 6.2 2.6 10.1c0 2.1 1.2 4 3.2 5.3l-.6 2.4 3.1-1.4c1.1.3 2.3.5 3.7.5 5.2 0 9.4-3.1 9.4-6.9S17.2 3 12 3Z" fill="currentColor"/><path d="M17.5 16.2c-.5 0-1 .1-1.5.1-1.5 0-2.8-.3-3.9-.8.7 2 3 3.5 5.8 3.5.7 0 1.3-.1 1.9-.3l2 .9-.4-1.5c1-.7 1.6-1.7 1.6-2.8 0-1-.5-1.9-1.4-2.5-.4 1.4-1.9 2.7-4.1 3.4Z" fill="currentColor" opacity=".8"/></>}
      </svg>
    </span>
  );
}

function CustomerAvatar({ customer, large = false }: { customer: (typeof communicationCustomers)[number]; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const className = 'cc-customer-initial' + (large ? ' cc-customer-initial--large' : '');
  if (customer.avatarUrl && !failed) return <img className={className + ' cc-avatar-image'} src={customer.avatarUrl} alt={customer.contact + '头像'} onError={() => setFailed(true)} />;
  return <span className={className} aria-label={customer.contact + '头像'}>{customer.contact.slice(0, 1)}</span>;
}

function UserAvatar({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <img className="cc-message-avatar cc-avatar-image" src={src} alt={name + '头像'} onError={() => setFailed(true)} />;
  return <span className="cc-message-avatar" aria-label={name + '头像'}>{name.slice(0, 1) || 'U'}</span>;
}

function MessageStatus({ status }: { status?: CommunicationMessage['status'] }) {
  if (status === 'failed') return <Tag type="red">发送失败</Tag>;
  if (status === 'sending' || status === 'queued') return <Tag type="blue">发送中</Tag>;
  if (status === 'read') return <Tag type="green">已读</Tag>;
  if (status === 'delivered') return <Tag type="blue">已送达</Tag>;
  if (status === 'sent') return <Tag type="cool-gray">已发送</Tag>;
  if (status === 'received') return <Tag type="cool-gray">已接收</Tag>;
  return null;
}

export function CustomerCommunicationsPage() {
  const [conversations, setConversations] = useState<CommunicationConversation[]>([]);
  const [customers, setCustomers] = useState<CommunicationCustomer[]>([]);
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [activeId, setActiveId] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [channelFilter, setChannelFilter] = useState<CommunicationChannel | 'all'>('all');
  const [query, setQuery] = useState('');
  const [replyChannel, setReplyChannel] = useState<CommunicationChannel>('whatsapp');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [messageSearchIds, setMessageSearchIds] = useState<string[]>([]);
  const previousUnreadRef = useRef<Record<string, number>>({});
  const notificationSnapshotRef = useRef(false);
  const sendReplyRef = useRef<() => Promise<void>>(async () => undefined);
  const [currentUser, setCurrentUser] = useState({ name: '当前用户', avatarUrl: '' });
  const [mobileChat, setMobileChat] = useState(false);
  const [profileOpen, setProfileOpen] = useState(() => typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches);
  const [storageReady, setStorageReady] = useState(false);
  const [backendMode, setBackendMode] = useState<'loading' | 'connected' | 'unavailable'>('loading');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [connections, setConnections] = useState<InboxConnection[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<InboxCrmContact[]>([]);
  const [selectedContact, setSelectedContact] = useState<InboxCrmContact | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [newChannelType, setNewChannelType] = useState<Exclude<InboxChannel, 'email' | 'wecom'>>('whatsapp');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelAccountId, setNewChannelAccountId] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');

  useEffect(() => {
    setStorageReady(true);
    let active = true;
    void getSupabaseClient().then((client) => client.auth.getUser()).then(({ data }) => {
      if (!active || !data.user) return;
      const metadata = data.user.user_metadata ?? {};
      setCurrentUser({
        name: String(metadata.full_name || metadata.name || data.user.email || '当前用户'),
        avatarUrl: String(metadata.avatar_url || metadata.picture || ''),
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadInbox = async () => {
      try {
        const token = await getInboxSessionToken();
        const [rows, channelConnections] = await Promise.all([
          getInboxConversations(token),
          getInboxConnections(token),
        ]);
        if (cancelled) return;
        const mapped = rows.map(mapInboxConversation);
        const customerById = new Map(mapped.map((item) => [item.customer.id, item.customer]));
        setCustomers([...customerById.values()]);
        setConversations(mapped.map((item) => item.conversation));
        setMessages([]);
        setConnections(channelConnections);
        setSessionToken(token);
        setActiveId((current) => mapped.some((item) => item.conversation.id === current)
          ? current : mapped[0]?.conversation.id ?? '');
        setBackendMode('connected');
        setNotice('');
      } catch (error) {
        if (cancelled) return;
        let restored = false;
        try {
          const saved = window.localStorage.getItem('tradepilot.customer-communications.demo.v1');
          if (saved) {
            const parsed = JSON.parse(saved) as { conversations?: CommunicationConversation[]; messages?: CommunicationMessage[] };
            if (Array.isArray(parsed.conversations) && parsed.conversations.length) {
              setConversations(parsed.conversations);
              setMessages(Array.isArray(parsed.messages) ? parsed.messages : []);
              setActiveId(parsed.conversations[0].id);
              restored = true;
            }
          }
        } catch {
          // Invalid local demo state is ignored.
        }
        if (!restored) {
          setConversations(communicationConversations);
          setMessages(communicationMessages);
          setActiveId(communicationConversations[0].id);
        }
        setCustomers(communicationCustomers);
        setBackendMode('unavailable');
        setNotice(error instanceof Error ? '真实收件箱暂不可用：' + error.message + ' 当前显示本地演示数据。' : '真实收件箱暂不可用，当前显示本地演示数据。');
      }
    };
    void loadInbox();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (backendMode !== 'connected' || !sessionToken || !activeId) return;
    let cancelled = false;
    let firstLoad = true;
    const refreshMessages = async () => {
      try {
        const rows = await getInboxMessages(sessionToken, activeId);
        if (cancelled) return;
        const mapped = rows.map(mapInboxMessage);
        setMessages((current) => [...current.filter((message) => message.conversationId !== activeId), ...mapped]);
        if (firstLoad) {
          firstLoad = false;
          setConversations((current) => current.map((item) => item.id === activeId ? { ...item, unread: 0 } : item));
          void updateInboxConversation(sessionToken, activeId, { markRead: true }).catch(() => undefined);
        }
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? '读取消息失败：' + error.message : '读取消息失败，请稍后重试。');
      }
    };
    void refreshMessages();
    const poll = window.setInterval(() => { void refreshMessages(); }, 5000);
    return () => { cancelled = true; window.clearInterval(poll); };
  }, [backendMode, sessionToken, activeId]);

  useEffect(() => {
    if (backendMode !== 'connected' || !sessionToken) return;
    let cancelled = false;
    const refreshConversations = async () => {
      try {
        const [rows, channelConnections] = await Promise.all([
          getInboxConversations(sessionToken), getInboxConnections(sessionToken),
        ]);
        if (cancelled) return;
        setConnections(channelConnections);
        const mapped = rows.map(mapInboxConversation);
        const customerById = new Map(mapped.map((item) => [item.customer.id, item.customer]));
        setCustomers([...customerById.values()]);
        setConversations(mapped.map((item) => ({
          ...item.conversation,
          unread: item.conversation.id === activeId ? 0 : item.conversation.unread,
        })));
      } catch {
        // Keep the last successfully loaded inbox snapshot during transient network failures.
      }
    };
    const poll = window.setInterval(() => { void refreshConversations(); }, 15000);
    return () => { cancelled = true; window.clearInterval(poll); };
  }, [backendMode, sessionToken, activeId]);

  useEffect(() => {
    if (!storageReady || backendMode !== 'unavailable') return;
    try {
      window.localStorage.setItem('tradepilot.customer-communications.demo.v1', JSON.stringify({ conversations, messages }));
    } catch {
      setNotice('浏览器存储不可用；本次会话仍可操作，但刷新后记录可能不会保留。');
    }
  }, [conversations, messages, storageReady, backendMode]);

  useEffect(() => {
    if (!newConversationOpen || backendMode !== 'connected' || !sessionToken || contactSearch.trim().length < 2) {
      setContactResults([]);
      setContactLoading(false);
      return;
    }
    let cancelled = false;
    setContactLoading(true);
    const timer = window.setTimeout(() => {
      void searchInboxCrmContacts(sessionToken, contactSearch.trim()).then((results) => {
        if (!cancelled) setContactResults(results);
      }).catch((error) => {
        if (!cancelled) setNotice(error instanceof Error ? '搜索 CRM 联系人失败：' + error.message : '搜索联系人失败。');
      }).finally(() => {
        if (!cancelled) setContactLoading(false);
      });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [newConversationOpen, backendMode, sessionToken, contactSearch]);

  const activeConversation = conversations.find((item) => item.id === activeId) ?? conversations[0];
  const activeCustomer = activeConversation
    ? customers.find((item) => item.id === activeConversation.customerId) ?? customers[0]
    : customers[0];
  const customerChannels = activeCustomer?.identities.map((identity) => identity.channel) ?? [];
  const connectedChannels = new Set(connections.filter((connection) => connection.connection_status === 'connected').map((connection) => connection.channel_type));
  const replyOptions = channelOptions.filter((option) => customerChannels.includes(option.id)
    && sendableChannels.has(option.id) && (backendMode !== 'connected' || connectedChannels.has(option.id as InboxChannel)));
  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    const customer = customers.find((item) => item.id === conversation.customerId);
    if (!customer) return false;
    const conversationMessages = messages.filter(message => message.conversationId === conversation.id);
    const matchesQuery = [customer.company, customer.contact, customer.role, customer.email, customer.phone, conversation.preview,
      ...customer.tags, ...conversationMessages.map(message => message.body)]
      .join(' ').toLowerCase().includes(query.trim().toLowerCase()) || messageSearchIds.includes(conversation.id);
    const matchesStatus = filter === 'all'
      || (filter === 'unread' ? conversation.unread > 0 : conversation.state === filter);
    const matchesChannel = channelFilter === 'all' || conversation.channel === channelFilter;
    return matchesQuery && matchesStatus && matchesChannel;
  }), [conversations, customers, messages, messageSearchIds, filter, channelFilter, query]);

  const activeMessages = activeConversation ? messages
    .filter((message) => message.conversationId === activeConversation.id)
    .sort((a, b) => a.time - b.time) : [];

  const selectConversation = (conversation: CommunicationConversation) => {
    setActiveId(conversation.id);
    setMobileChat(true);
    setReplyChannel(conversation.channel);
    setIsInternalNote(false);
    setAiSummary('');
    try { setDraft(window.localStorage.getItem('tradepilot.inbox.draft.' + conversation.id) || ''); } catch { setDraft(''); }
    setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, unread: 0 } : item));
    if (backendMode !== 'connected') setNotice('');
  };

  const createChannelConnection = async () => {
    if (!sessionToken || !newChannelName.trim() || !newChannelAccountId.trim() || creatingChannel) return;
    setCreatingChannel(true);
    try {
      const result = await createInboxChannelConnection(
        sessionToken, newChannelType, newChannelName.trim(), newChannelAccountId.trim(),
      );
      const channelConnections = await getInboxConnections(sessionToken);
      setConnections(channelConnections);
      setNewWebhookUrl(result.webhook_url);
      setNotice('渠道连接记录已创建。请将 Webhook 地址配置到对应平台，并确认 API 凭证已在「AI与API集成」中设置。');
    } catch (error) {
      setNotice(error instanceof Error ? '创建渠道连接失败：' + error.message : '创建渠道连接失败。');
    } finally {
      setCreatingChannel(false);
    }
  };

  const createConversation = async () => {
    if (!sessionToken || !selectedContact || creatingConversation) return;
    setCreatingConversation(true);
    try {
      const createdId = await createInboxConversation(sessionToken, selectedContact.id);
      const [rows, channelConnections] = await Promise.all([
        getInboxConversations(sessionToken), getInboxConnections(sessionToken),
      ]);
      const mapped = rows.map(mapInboxConversation);
      const customerById = new Map(mapped.map((item) => [item.customer.id, item.customer]));
      setCustomers([...customerById.values()]);
      setConversations(mapped.map((item) => item.conversation));
      setConnections(channelConnections);
      setActiveId(createdId);
      setMobileChat(true);
      setNewConversationOpen(false);
      setContactSearch('');
      setSelectedContact(null);
      setNotice('会话已创建。该联系人仍需绑定已验证的渠道身份后，才能发送平台消息。');
    } catch (error) {
      setNotice(error instanceof Error ? '创建会话失败：' + error.message : '创建会话失败，请稍后重试。');
    } finally {
      setCreatingConversation(false);
    }
  };

  const updateConversationState = async () => {
    if (!activeConversation) return;
    const nextState: CommunicationConversation['state'] = activeConversation.state === 'open'
      ? 'pending'
      : activeConversation.state === 'pending' ? 'resolved' : 'open';
    if (backendMode === 'connected' && sessionToken) {
      try {
        await updateInboxConversation(sessionToken, activeConversation.id, { status: nextState });
      } catch (error) {
        setNotice(error instanceof Error ? '更新会话状态失败：' + error.message : '更新会话状态失败。');
        return;
      }
    }
    setConversations((current) => current.map((item) => item.id === activeConversation.id
      ? { ...item, state: nextState, updatedAt: Date.now() }
      : item));
    setNotice(`会话状态已更新为「${conversationStateLabels[nextState]}」。`);
  };

  const sendReply = async () => {
    const body = draft.trim();
    if (!body || !activeConversation || isSending) return;
    if (backendMode === 'connected') {
      if (!sessionToken) { setNotice('登录会话已失效，请重新连接收件箱。'); return; }
      if (!isInternalNote && !replyOptions.length) { setNotice('该客户尚未绑定已连接的客户渠道身份，暂时无法真实发送。'); return; }
      setIsSending(true);
      setSendFailed(false);
      try {
        if (isInternalNote) {
          const result = await createInboxNote(sessionToken, activeConversation.id, body);
          if (result.note) setMessages(current => [...current, { id: result.note.id, conversationId: activeConversation.id, channel: activeConversation.channel, direction: 'system', kind: 'system', body: result.note.content, time: Date.parse(result.note.created_at) || Date.now() }]);
          setNotice('内部备注已保存，仅在 TradePilot 工作台内可见。');
        } else {
          const result = await sendInboxMessage(sessionToken, activeConversation.id, replyChannel as InboxChannel, body);
          const message = result.message;
          if (message) setMessages(current => [...current, mapInboxMessage(message)]);
          const time = message?.created_at ? Date.parse(message.created_at) : Date.now();
          setConversations(current => current.map(item => item.id === activeConversation.id ? { ...item, channel: replyChannel, preview: body, updatedAt: time, state: 'open' } : item));
          setNotice('消息已提交至 ' + communicationChannelLabels[replyChannel] + '，送达状态以平台回执为准。');
        }
        setDraft('');
        try { window.localStorage.removeItem('tradepilot.inbox.draft.' + activeConversation.id); } catch { /* ignore */ }
      } catch (error) {
        setSendFailed(true);
        setNotice(error instanceof Error ? '操作失败：' + error.message + '。草稿已保留，可检查状态后重试。' : '操作失败，草稿已保留，可稍后重试。');
      } finally { setIsSending(false); }
      return;
    }
    if (isInternalNote) { setNotice('演示模式不保存真实内部备注；请先连接真实收件箱。'); return; }
    const time = Date.now();
    const message: CommunicationMessage = { id: 'local-' + time, conversationId: activeConversation.id, channel: replyChannel, direction: 'outbound', kind: 'text', body, time, status: 'sent' };
    setMessages(current => [...current, message]);
    setConversations(current => current.map(item => item.id === activeConversation.id ? { ...item, channel: replyChannel, preview: body, updatedAt: time, state: 'open' } : item));
    setDraft('');
    setNotice('本地演示：消息已加入时间线并保存在当前浏览器，尚未发送到外部平台。');
  };

  const requestSummary = async () => {
    if (!sessionToken || !activeConversation || summaryLoading) return;
    setSummaryLoading(true);
    try { setAiSummary(await generateInboxSummary(sessionToken, activeConversation.id)); setNotice('AI 已生成会话摘要，请核对原始消息后再采取行动。'); }
    catch (error) { setNotice(error instanceof Error ? '生成摘要失败：' + error.message : 'AI 摘要暂不可用。'); }
    finally { setSummaryLoading(false); }
  };

  const translateMessage = async (message: CommunicationMessage) => {
    if (!sessionToken || message.direction !== 'inbound') return;
    try {
      const result = await translateInboxMessage(sessionToken, message.id);
      setMessages(current => current.map(item => item.id === message.id ? { ...item, translatedBody: result.translated_content } : item));
    } catch (error) { setNotice(error instanceof Error ? '翻译失败：' + error.message : '翻译服务暂不可用。'); }
  };

  const openAttachment = async (attachmentId: string) => {
    if (!sessionToken) return;
    const popup = window.open('about:blank', '_blank');
    if (!popup) { setNotice('浏览器阻止附件窗口，请允许弹出窗口后重试。'); return; }
    try { popup.location.href = await getInboxAttachmentSignedUrl(sessionToken, attachmentId); }
    catch (error) { popup.close(); setNotice(error instanceof Error ? '附件暂不可用：' + error.message : '附件暂不可用。'); }
  };

  const enableNotifications = async () => {
    if (!('Notification' in window)) { setNotice('当前浏览器不支持桌面通知。'); return; }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    setNotificationsEnabled(permission === 'granted');
    setNotice(permission === 'granted' ? '桌面消息通知已开启。' : '未获得桌面通知权限，请在浏览器设置中开启。');
  };

  sendReplyRef.current = sendReply;

  useEffect(() => {
    if (backendMode !== 'connected') return;
    const snapshot = Object.fromEntries(conversations.map(item => [item.id, item.unread]));
    if (!notificationSnapshotRef.current) { notificationSnapshotRef.current = true; previousUnreadRef.current = snapshot; return; }
    if (notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const item of conversations) if (item.id !== activeId && item.unread > (previousUnreadRef.current[item.id] ?? 0)) {
        const customer = customers.find(person => person.id === item.customerId);
        new Notification(customer?.company || '新客户消息', { body: item.preview || '收到一条新消息', tag: item.id });
      }
    }
    previousUnreadRef.current = snapshot;
  }, [conversations, customers, activeId, backendMode, notificationsEnabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector<HTMLInputElement>('.cc-list-controls input')?.focus(); }
      else if (modifier && event.key === 'Enter') { event.preventDefault(); void sendReplyRef.current(); }
      else if (event.key === 'Escape' && document.activeElement instanceof HTMLTextAreaElement) { setDraft(''); setSendFailed(false); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    try { setDraft(window.localStorage.getItem('tradepilot.inbox.draft.' + activeId) || ''); } catch { setDraft(''); }
  }, [activeId]);

  useEffect(() => {
    if (backendMode !== 'connected' || !sessionToken || query.trim().length < 2) { setMessageSearchIds([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchInboxMessages(sessionToken, query.trim()).then(ids => { if (!cancelled) setMessageSearchIds(ids); })
        .catch(error => { if (!cancelled) setNotice(error instanceof Error ? '消息搜索失败：' + error.message : '消息搜索暂不可用。'); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [backendMode, sessionToken, query]);

  if (!activeConversation || !activeCustomer) {
    return (
      <main className="cc-page" aria-label="客户沟通工作台">
        <header className="cc-page-header"><div className="cc-page-heading"><Heading>客户沟通工作台</Heading><p>统一处理跨渠道客户消息与跟进</p></div></header>
        {notice && <InlineNotification kind="warning" lowContrast title="收件箱状态" subtitle={notice} />}
        <div className="cc-empty-state" role="status">{backendMode === 'loading' ? '正在读取真实会话…' : '目前没有会话。请先连接渠道并等待客户消息，或创建 CRM 联系人的会话。'}</div>
        {backendMode === 'unavailable' && <Button kind="secondary" onClick={() => window.location.reload()}>重新连接收件箱</Button>}
      </main>
    );
  }

  return (
    <main className="cc-page" aria-label="客户沟通工作台">
      <header className="cc-page-header">
        <div className="cc-page-heading">
          <Heading>客户沟通工作台</Heading>
          <p>统一处理跨渠道客户消息与跟进</p>
        </div>
        <div className="cc-page-header-actions">
          <Button kind="secondary" size="sm" onClick={enableNotifications}>{notificationsEnabled ? '通知已开启' : '开启通知'}</Button>
          {backendMode === 'unavailable' && <Button kind="secondary" size="sm" onClick={() => window.location.reload()}>重新连接</Button>}
          <Button kind="secondary" size="sm" onClick={() => window.open('/customer-communications/window', 'tradepilot-customer-communications', 'popup=yes,width=1440,height=900,resizable=yes,scrollbars=yes')}>独立窗口</Button>
          <Button kind="secondary" size="sm" disabled={backendMode !== 'connected'} onClick={() => setChannelModalOpen(true)}>渠道接入</Button>
          <Button kind="primary" size="sm" disabled={backendMode !== 'connected'} onClick={() => setNewConversationOpen(true)}>新建会话</Button>
        </div>
      </header>

      <Modal
        open={channelModalOpen}
        modalHeading="渠道连接"
        primaryButtonText={creatingChannel ? '保存中…' : '创建连接'}
        secondaryButtonText="关闭"
        primaryButtonDisabled={!newChannelName.trim() || !newChannelAccountId.trim() || creatingChannel}
        onRequestClose={() => setChannelModalOpen(false)}
        onRequestSubmit={createChannelConnection}
      >
        <p>先在「AI与API集成」中配置渠道凭证，再登记渠道账号。创建后将 Webhook 地址填入对应平台的开发者后台。</p>
        <div className="cc-channel-connection-list">
          {connections.map((connection) => (
            <div className="cc-channel-connection-row" key={connection.id}>
              <ChannelLogo channel={connection.channel_type as CommunicationChannel} size="sm" />
              <span><strong>{connection.display_name}</strong><small>{communicationChannelLabels[connection.channel_type as CommunicationChannel]} · {connection.external_account_id || '未设置账号 ID'}</small></span>
              <Tag type={connection.connection_status === 'connected' ? 'green' : connection.connection_status === 'error' ? 'red' : 'warm-gray'}>
                {connection.connection_status === 'connected' ? '已连接' : connection.connection_status === 'error' ? '异常' : connection.connection_status === 'disabled' ? '已停用' : '待验证'}
              </Tag>
            </div>
          ))}
          {connections.length === 0 && <p className="cc-empty-state">尚未登记渠道连接</p>}
        </div>
        <div className="cc-channel-connection-form">
          <Dropdown
            id="cc-new-channel-type"
            titleText="渠道平台"
            label="选择渠道"
            size="md"
            items={[
              { id: 'whatsapp', text: 'WhatsApp' },
              { id: 'messenger', text: 'Facebook Messenger' },
              { id: 'telegram', text: 'Telegram' },
              { id: 'line', text: 'LINE' },
            ]}
            itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''}
            selectedItem={[
              { id: 'whatsapp', text: 'WhatsApp' },
              { id: 'messenger', text: 'Facebook Messenger' },
              { id: 'telegram', text: 'Telegram' },
              { id: 'line', text: 'LINE' },
            ].find((item) => item.id === newChannelType) ?? null}
            onChange={({ selectedItem }: { selectedItem?: { id: string; text: string } | null }) => {
              if (selectedItem) setNewChannelType(selectedItem.id as Exclude<InboxChannel, 'email' | 'wecom'>);
            }}
          />
          <TextInput
            id="cc-new-channel-name"
            labelText="连接名称"
            placeholder="例如：TradePilot WhatsApp Business"
            value={newChannelName}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNewChannelName(event.currentTarget.value)}
          />
          <TextInput
            id="cc-new-channel-account"
            labelText="渠道账号 ID"
            placeholder="WhatsApp Phone Number ID / Facebook Page ID / Bot ID"
            value={newChannelAccountId}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNewChannelAccountId(event.currentTarget.value)}
          />
        </div>
        {newWebhookUrl && (
          <div className="cc-webhook-url">
            <strong>Webhook URL</strong>
            <code>{newWebhookUrl}</code>
            <Button kind="ghost" size="sm" onClick={() => {
              void navigator.clipboard.writeText(newWebhookUrl).then(() => setNotice('Webhook URL 已复制。')).catch(() => setNotice('复制失败，请手动复制 Webhook URL。'));
            }}>复制地址</Button>
          </div>
        )}
      </Modal>

      <Modal
        open={newConversationOpen}
        modalHeading="新建客户会话"
        primaryButtonText={creatingConversation ? '创建中…' : '创建会话'}
        secondaryButtonText="取消"
        primaryButtonDisabled={!selectedContact || creatingConversation}
        onRequestClose={() => setNewConversationOpen(false)}
        onRequestSubmit={createConversation}
      >
        <p>从 CRM 联系人中选择客户。创建会话后，仍需有已验证的渠道身份才能发送外部消息。</p>
        <Search
          size="lg"
          labelText="搜索 CRM 联系人"
          placeholder="输入姓名、邮箱或电话（至少 2 个字符）"
          value={contactSearch}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setContactSearch(event.currentTarget.value);
            setSelectedContact(null);
          }}
        />
        {contactLoading && <p className="cc-empty-state">正在搜索联系人…</p>}
        <div className="cc-contact-search-results">
          {contactResults.map((contact) => (
            <Button
              key={contact.id}
              kind={selectedContact?.id === contact.id ? 'tertiary' : 'ghost'}
              size="lg"
              className="cc-contact-search-result"
              onClick={() => setSelectedContact(contact)}
            >
              <span><strong>{contact.display_name}</strong><small>{[contact.email, contact.phone].filter(Boolean).join(' · ')}</small></span>
              {selectedContact?.id === contact.id && <CarbonIcons.Checkmark />}
            </Button>
          ))}
          {!contactLoading && contactSearch.trim().length >= 2 && contactResults.length === 0 && <p className="cc-empty-state">没有找到匹配的 CRM 联系人</p>}
        </div>
      </Modal>

      {notice && (
        <InlineNotification
          kind={backendMode === 'connected' ? 'info' : 'warning'}
          lowContrast
          title={backendMode === 'connected' ? '真实收件箱' : '演示模式'}
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
              placeholder="搜索客户、公司、消息内容或联系方式"
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
              const customer = customers.find((item) => item.id === conversation.customerId)!;
              return (
                <Button
                  key={conversation.id}
                  kind="ghost"
                  size="lg"
                  className={'cc-conversation-row' + (conversation.id === activeId ? ' is-selected' : '')}
                  aria-current={conversation.id === activeId ? 'true' : undefined}
                  onClick={() => selectConversation(conversation)}
                >
                  <CustomerAvatar customer={customer} />
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
              <CustomerAvatar customer={activeCustomer} />
              <div>
                <Heading className="cc-chat-company-title">{activeCustomer.company}</Heading>
                <p>{activeCustomer.contact} · {activeCustomer.role}</p>
              </div>
            </div>
            <div className="cc-chat-actions">
              <IconButton kind="ghost" size="sm" className="cc-mobile-back" label="返回会话" onClick={() => setMobileChat(false)}><CarbonIcons.ArrowLeft /></IconButton>
              <Tag type={activeConversation.state === 'resolved' ? 'green' : activeConversation.state === 'pending' ? 'warm-gray' : 'blue'}>
                {conversationStateLabels[activeConversation.state]}
              </Tag>
              <Button kind="tertiary" size="sm" onClick={updateConversationState}>
                {activeConversation.state === 'open' ? '待处理' : activeConversation.state === 'pending' ? '解决' : '重开'}
              </Button>
              <Button kind="tertiary" size="sm" disabled={backendMode !== 'connected' || summaryLoading} onClick={requestSummary}>{summaryLoading ? '生成中…' : 'AI 摘要'}</Button>
              <Button kind="tertiary" size="sm" onClick={() => setProfileOpen((open) => !open)}>
                {profileOpen ? '收起客户资料' : '客户资料'}
              </Button>
            </div>
          </header>

          <div className="cc-timeline">
            {activeMessages.length === 0 && (
              <div className="cc-empty-state" role="status">还没有消息。发送第一条回复以开始沟通。</div>
            )}
            {activeMessages.map((message) => (
              <article
                key={message.id}
                className={'cc-message' + (message.direction === 'outbound' ? ' cc-message--outbound' : '') + (message.direction === 'system' ? ' cc-message--system' : '')}
              >
                <div className="cc-message-meta">
                  <time>{formatDate(message.time)}</time>
                </div>
                {message.direction !== 'system' && message.channel && <span className="cc-message-source" aria-label={'来源平台：' + communicationChannelLabels[message.channel]} title={'来源平台：' + communicationChannelLabels[message.channel]}><ChannelLogo channel={message.channel} size="sm" /></span>}
                <div className="cc-message-row">
                  {message.direction === 'inbound' && <CustomerAvatar customer={activeCustomer} />}
                  <div className="cc-message-content">
                    {message.kind === 'system' ? <div className="cc-internal-note"><strong>内部备注 · 仅团队可见</strong><p>{message.body}</p></div> : message.kind === 'email' ? (
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
                  </div>
                  {message.direction === 'outbound' && <UserAvatar name={currentUser.name} src={currentUser.avatarUrl} />}
                </div>
                {message.translatedBody && <div className="cc-message-translation"><strong>翻译</strong><p>{message.translatedBody}</p></div>}
                {message.attachments?.map(attachment => <div className="cc-attachment-action" key={attachment.id}><span>{attachment.filename}</span>{attachment.scanStatus === 'clean' ? <Button kind="ghost" size="sm" onClick={() => void openAttachment(attachment.id)}>打开附件</Button> : <Tag type="warm-gray">安全检查中</Tag>}</div>)}
                <div className="cc-message-footer">
                  {message.direction === 'outbound' && <MessageStatus status={message.status} />}
                  {message.direction !== 'system' && <Button kind="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(message.body).then(() => setNotice('消息内容已复制。')).catch(() => setNotice('复制失败，请手动选择消息内容。'))}>复制</Button>}
                  {message.direction === 'inbound' && backendMode === 'connected' && !message.translatedBody && <Button kind="ghost" size="sm" onClick={() => void translateMessage(message)}>翻译</Button>}
                </div>
              </article>
            ))}
          </div>

          <footer className="cc-composer">
            <div className="cc-composer-mode"><Button kind={isInternalNote ? 'primary' : 'secondary'} size="sm" onClick={() => setIsInternalNote(value => !value)}>{isInternalNote ? '正在写内部备注' : '切换内部备注'}</Button>{isInternalNote && <span>仅 TradePilot 内部可见，不会发送给客户</span>}</div>
            {!isInternalNote && <div className="cc-composer-channel">
              <div className="cc-reply-channel-control">
              <ChannelLogo channel={replyOptions.length ? replyChannel : activeConversation.channel} size="md" />
              <Dropdown
                id="cc-reply-channel"
                titleText="回复渠道"
                label="选择回复渠道"
                size="md"
                items={replyOptions}
                disabled={replyOptions.length === 0}
                itemToString={(item: ChannelOption | null) => item?.text ?? ''}
                selectedItem={replyOptions.find((item) => item.id === replyChannel) ?? replyOptions[0] ?? null}
                onChange={({ selectedItem }: { selectedItem?: ChannelOption | null }) => {
                  if (selectedItem) setReplyChannel(selectedItem.id);
                }}
              />
              </div>
            </div>}
            <TextArea
              id="cc-reply-draft"
              labelText="回复内容"
              hideLabel
              placeholder={isInternalNote ? '输入仅内部可见的备注…（Enter 保存，Shift + Enter 换行）' : '输入消息内容…（Enter 发送，Shift + Enter 换行）'}
              rows={3}
              value={draft}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => { const value = event.currentTarget.value; setDraft(value); if (activeConversation) { try { window.localStorage.setItem('tradepilot.inbox.draft.' + activeConversation.id, value); } catch { /* ignore */ } } }}
              onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendReply();
                }
              }}
            />
            <div className="cc-composer-actions">
              <span className="cc-demo-hint">{isInternalNote ? '内部备注 · 不会发送给客户' : backendMode === 'connected' ? (replyOptions.length ? '真实渠道发送 · 状态以平台回执为准' : '尚未绑定已连接的客户渠道身份') : '本地演示 · 不会发送真实消息'}</span>
              {sendFailed && <Button kind="secondary" size="sm" disabled={isSending} onClick={() => void sendReply()}>重试</Button>}
              <Button kind="primary" size="md" renderIcon={CarbonIcons.Send} disabled={!draft.trim() || isSending || (!isInternalNote && backendMode === 'connected' && !replyOptions.length)} onClick={sendReply}>{isSending ? '处理中…' : isInternalNote ? '保存备注' : '发送'}</Button>
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
                <CustomerAvatar customer={activeCustomer} large />
                <div><strong>{activeCustomer.contact}</strong><span>{activeCustomer.role}</span><span>{activeCustomer.company}</span></div>
              </div>
              <section className="cc-profile-section">
                <Heading className="cc-profile-section-title">基本信息</Heading>
                <dl className="cc-details">
                  <dt>地区 / 语言</dt><dd>{activeCustomer.region}</dd>
                  <dt>电子邮件</dt><dd>{activeCustomer.email}</dd>
                  <dt>电话</dt><dd>{activeCustomer.phone}</dd>
                </dl>
              </section>
              {activeCustomer.industry && <section className="cc-profile-section"><Heading className="cc-profile-section-title">客户行业</Heading><p>{activeCustomer.industry}</p></section>}
              {activeCustomer.website && <section className="cc-profile-section"><Heading className="cc-profile-section-title">企业网站</Heading><a href={activeCustomer.website} target="_blank" rel="noreferrer">{activeCustomer.website}</a></section>}
              {aiSummary && <section className="cc-profile-section"><Heading className="cc-profile-section-title">AI 沟通摘要</Heading><div className="cc-ai-summary">{aiSummary}</div></section>}
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
                  <dt>会话状态</dt><dd>{conversationStateLabels[activeConversation.state]}</dd>
                  <dt>最近沟通</dt><dd>{formatDate(activeConversation.updatedAt)}</dd>
                  <dt>负责人</dt><dd>{currentUser.name}（单用户工作区）</dd>
                </dl>
              </section>
            </div>
          </aside>
        )}
      </section>
    </main>
  );
}

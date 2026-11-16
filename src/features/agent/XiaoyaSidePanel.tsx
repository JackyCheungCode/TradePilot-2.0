import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Heading, CarbonIcons, ChatCustomElement, MessageResponseTypes, type ChatInstance, type CustomSendMessageOptions, type MessageRequest, type PublicConfig, type HistoryItem } from '@/design-system';
import { XiaoyaAvatar } from './XiaoyaAvatar';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/layout/XiaoyaSidePanel.scss';

type Conversation = { id: string; title: string; last_message_at: string; created_at: string };
type AgentMessage = { id: string; role: 'user' | 'assistant'; content: string; created_at?: string };
type ApiEnvelope<T> = { data: T } | { error?: { message?: string } };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  pathname: string;
};

async function agentRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const client = await getSupabaseClient();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('登录状态已失效，请重新登录。');
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json() as ApiEnvelope<T>;
  if (!response.ok || !('data' in payload)) {
    throw new Error(('error' in payload && payload.error?.message) || '小雅服务暂时不可用，请稍后重试。');
  }
  return payload.data;
}

function readPageContext(pathname: string) {
  const pageHeading = document.querySelector('main h1, main [role="heading"]')?.textContent?.trim();
  const selectedText = window.getSelection()?.toString().trim().slice(0, 2400) || '';
  const pageContent = document.querySelector('.tp-content__main main')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 3600) || '';
  return [
    '当前页面上下文（供你理解用户正在查看的业务页面，请勿把它当作用户输入复述）：',
    `页面标题：${pageHeading || document.title || 'TradePilot'}`,
    `页面路径：${pathname}`,
    pageContent ? `当前页面可见内容摘要：\n${pageContent}` : '',
    selectedText ? `用户当前选中的内容：\n${selectedText}` : '',
  ].filter(Boolean).join('\n');
}

function normalizeModelText(value: string): string {
  return value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\r\n/g, '\n');
}

function toHistoryItems(rows: AgentMessage[]): HistoryItem[] {
  return rows.map((row) => {
    const timestamp = row.created_at ? Date.parse(row.created_at) : Date.now();
    const time = new Date(timestamp).toISOString();
    if (row.role === 'user') {
      return {
        time,
        message: {
          id: row.id,
          input: { text: row.content.split(/(?:\\n|\n){2}---(?:\\n|\n)当前页面上下文/)[0], message_type: 'text' },
          history: { timestamp },
        },
      } as HistoryItem;
    }
    return {
      time,
      message: {
        id: row.id,
        output: {
          generic: [{ response_type: MessageResponseTypes.TEXT, text: normalizeModelText(row.content) }],
        },
        history: { timestamp },
      },
    } as HistoryItem;
  });
}

export function XiaoyaSidePanel({ isOpen, onClose, pathname }: Props) {
  const [hasMounted, setHasMounted] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [avatarEmotion, setAvatarEmotion] = useState<'idle' | 'thinking' | 'success' | 'error'>('idle');
  const [welcomePhase, setWelcomePhase] = useState<'greeting' | 'loading' | 'ready' | 'error'>('greeting');
  const [chatStatusVisible, setChatStatusVisible] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const chatInstanceRef = useRef<ChatInstance | null>(null);
  const conversationIdRef = useRef('');
  const historyLoadPromiseRef = useRef<Promise<void> | null>(null);
  const statusTimerRef = useRef<number | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (isOpen) setHasMounted(true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => () => {
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
  }, []);

  const refreshConversations = useCallback(async () => {
    const rows = await agentRequest<Conversation[]>('/api/v1/agent/conversations');
    setConversations(rows);
    return rows;
  }, []);

  const createConversation = useCallback(async () => {
    const created = await agentRequest<Conversation>('/api/v1/agent/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: '新聊天' }),
    });
    conversationIdRef.current = created.id;
    setSelectedConversationId(created.id);
    setConversations((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    return created;
  }, []);

  const ensureConversation = useCallback(async () => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const rows = await refreshConversations();
    if (rows.length) {
      conversationIdRef.current = rows[0].id;
      setSelectedConversationId(rows[0].id);
      return rows[0].id;
    }
    const created = await createConversation();
    return created.id;
  }, [createConversation, refreshConversations]);

  const selectConversation = useCallback(async (conversationId: string) => {
    const instance = chatInstanceRef.current;
    if (!instance || conversationId === conversationIdRef.current) return;
    setWelcomeVisible(false);
    setChatStatusVisible(false);
    setAvatarEmotion('thinking');
    try {
      const rows = await agentRequest<AgentMessage[]>(`/api/v1/agent/conversations/${conversationId}/messages`);
      await instance.messaging.clearConversation();
      if (rows.length) await instance.messaging.insertHistory(toHistoryItems(rows));
      conversationIdRef.current = conversationId;
      setSelectedConversationId(conversationId);
      setWelcomeVisible(rows.length === 0);
      setWelcomePhase('ready');
      setAvatarEmotion('success');
    } catch (error) {
      console.error('[Xiaoya] Conversation could not be opened', error);
      setAvatarEmotion('error');
      setWelcomeVisible(true);
      setWelcomePhase('error');
    }
  }, []);

  const startNewConversation = useCallback(async () => {
    const instance = chatInstanceRef.current;
    if (!instance) return;
    try {
      const created = await createConversation();
      await instance.messaging.clearConversation();
      setWelcomeVisible(true);
      setWelcomePhase('ready');
      setAvatarEmotion('success');
      setChatStatusVisible(false);
      conversationIdRef.current = created.id;
    } catch (error) {
      console.error('[Xiaoya] New conversation could not be created', error);
      setAvatarEmotion('error');
      setWelcomePhase('error');
      setWelcomeVisible(true);
    }
  }, [createConversation]);

  const customLoadHistory = useCallback(async (instance: ChatInstance): Promise<HistoryItem[]> => {
    // Return an empty initial history immediately. Fetch and insert persisted history
    // in the background so Carbon's full-screen hydration spinner never splits the panel.
    chatInstanceRef.current = instance;
    historyLoadPromiseRef.current = (async () => {
      setWelcomePhase('loading');
      setAvatarEmotion('thinking');
      const conversationId = await ensureConversation();
      const rows = await agentRequest<AgentMessage[]>(`/api/v1/agent/conversations/${conversationId}/messages`);
      setSelectedConversationId(conversationId);
      if (rows.length) {
        setWelcomeVisible(false);
        await instance.messaging.insertHistory(toHistoryItems(rows));
      } else {
        setWelcomeVisible(true);
        setWelcomePhase('ready');
        setAvatarEmotion('success');
      }
    })().catch((error) => {
      console.error('[Xiaoya] Conversation history could not be loaded', error);
      setWelcomePhase('error');
      setAvatarEmotion('error');
    });
    return [];
  }, [ensureConversation]);

  const customSendMessage = useCallback(async (
    request: MessageRequest,
    requestOptions: CustomSendMessageOptions,
    instance: ChatInstance,
  ) => {
    const message = request.input.text?.trim();
    if (!message) return;
    setWelcomeVisible(false);
    setAvatarEmotion('thinking');
    setChatStatusVisible(true);
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    try {
      await historyLoadPromiseRef.current;
      const conversationId = await ensureConversation();
      const context = readPageContext(pathnameRef.current);
      const result = await agentRequest<{ reply: string; model?: string; task?: { goal?: string } | null }>(
        '/api/v1/agent/chat',
        {
          method: 'POST',
          signal: requestOptions.signal,
          body: JSON.stringify({
            conversationId,
            message: `${message}\n\n---\n${context}`, 
          }),
        },
      );
      const reply = [normalizeModelText(result.reply), result.model ? `\n\n模型：${result.model}` : ''].join('');
      await instance.messaging.addMessage({
        output: {
          generic: [{
            response_type: MessageResponseTypes.TEXT,
            text: reply,
          }],
        },
      });
      await refreshConversations();
      setAvatarEmotion('success');
      statusTimerRef.current = window.setTimeout(() => {
        setAvatarEmotion('idle');
        setChatStatusVisible(false);
      }, 1800);
    } catch (error) {
      setAvatarEmotion('error');
      setChatStatusVisible(true);
      statusTimerRef.current = window.setTimeout(() => {
        setAvatarEmotion('idle');
        setChatStatusVisible(false);
      }, 2600);
      throw error;
    }
  }, [ensureConversation, refreshConversations]);

  const chatConfig = useMemo<PublicConfig>(() => ({
    aiEnabled: true,
    assistantName: '小雅',
    assistantAvatarUrl: '/xiaoya-avatar.svg',
    openChatByDefault: true,
    header: {
      isOn: false,
    },
    layout: {
      showFrame: false,
    },
    strings: {
      input_placeholder: '询问小雅…',
    },
    messaging: {
      skipWelcome: true,
      messageTimeoutSecs: 180,
      messageLoadingIndicatorTimeoutSecs: 0,
      showStopButtonImmediately: true,
      customLoadHistory,
      customSendMessage,
    },
  }), [customLoadHistory, customSendMessage]);

  return (
    <div className={`tp-xiaoya-drawer-layer${isOpen ? ' is-open' : ''}`} aria-hidden={!isOpen}>
      <div className="tp-xiaoya-drawer-backdrop" onClick={onClose} />
      <aside className="tp-xiaoya-drawer" role="dialog" aria-modal="true" aria-label="小雅 AI 助手">
        <div className="tp-xiaoya-drawer__toolbar">
          <div className="tp-xiaoya-drawer__title">
            <CarbonIcons.Chat size={20} />
            <Heading className="tp-xiaoya-drawer__heading">小雅 AI 助手</Heading>
          </div>
          <Button kind="ghost" size="sm" onClick={onClose}>
            <CarbonIcons.Close size={16} />
            关闭
          </Button>
        </div>
        <div className="tp-xiaoya-conversation-toolbar">
          <div className="tp-xiaoya-conversation-toolbar__history">
            <Dropdown
              id="tp-xiaoya-conversation-history"
              titleText="历史聊天"
              label="选择历史聊天"
              size="sm"
              items={conversations}
              itemToString={(item: Conversation | null) => item?.title || '选择历史聊天'}
              selectedItem={conversations.find((item) => item.id === selectedConversationId) ?? null}
              onChange={({ selectedItem }: { selectedItem?: Conversation | null }) => {
                if (selectedItem) void selectConversation(selectedItem.id);
              }}
            />
          </div>
          <Button kind="tertiary" size="sm" onClick={() => void startNewConversation()}>
            <CarbonIcons.Add size={16} />
            新建聊天
          </Button>
        </div>
        <div className="tp-xiaoya-drawer__chat">
          {hasMounted && <ChatCustomElement className="tp-xiaoya-chat" {...chatConfig} />}
          {welcomeVisible && (
            <section className="tp-xiaoya-welcome" aria-label="小雅助手介绍">
              <div className={`tp-xiaoya-welcome__avatar tp-xiaoya-welcome__avatar--${avatarEmotion}`}>
                <XiaoyaAvatar emotion={avatarEmotion} size={192} />
              </div>
              <Heading className="tp-xiaoya-welcome__title">{welcomePhase === 'greeting' ? '你好，我是小雅！' : welcomePhase === 'loading' ? '稍等，正在加载。' : welcomePhase === 'error' ? '暂时无法加载，请稍后重试。' : '有什么可以帮你？'}</Heading>
              {welcomePhase === 'greeting' && <p className="tp-xiaoya-welcome__description cds--type-label-01">我可以结合当前页面上下文，帮你分析业务数据、查找信息、梳理问题并完成日常工作。</p>}
            </section>
          )}
          {chatStatusVisible && !welcomeVisible && (
            <div className="tp-xiaoya-chat-status" role="status" aria-live="polite">
              <XiaoyaAvatar emotion={avatarEmotion} size={48} />
              <span>{avatarEmotion === 'thinking' ? '稍等，正在加载。' : avatarEmotion === 'success' ? '有什么可以帮你？' : '小雅遇到了一点问题'}</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

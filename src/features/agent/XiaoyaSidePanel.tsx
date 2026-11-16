import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Heading, CarbonIcons, ChatCustomElement, MessageResponseTypes, type ChatInstance, type CustomSendMessageOptions, type MessageRequest, type PublicConfig, type HistoryItem } from '@/design-system';
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

export function XiaoyaSidePanel({ isOpen, onClose, pathname }: Props) {
  const [hasMounted, setHasMounted] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [avatarEmotion, setAvatarEmotion] = useState<'idle' | 'thinking' | 'success' | 'error'>('idle');
  const conversationIdRef = useRef('');
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

  const ensureConversation = useCallback(async () => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const rows = await agentRequest<Conversation[]>('/api/v1/agent/conversations');
    if (rows.length) {
      conversationIdRef.current = rows[0].id;
      return rows[0].id;
    }
    const created = await agentRequest<Conversation>('/api/v1/agent/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: '小雅 · 页面辅助' }),
    });
    conversationIdRef.current = created.id;
    return created.id;
  }, []);

  const customLoadHistory = useCallback(async (_instance: ChatInstance): Promise<HistoryItem[]> => {
    const conversationId = await ensureConversation();
    const rows = await agentRequest<AgentMessage[]>(`/api/v1/agent/conversations/${conversationId}/messages`);
    setWelcomeVisible(rows.length === 0);
    return rows.map((row) => {
      const timestamp = row.created_at ? Date.parse(row.created_at) : Date.now();
      const time = new Date(timestamp).toISOString();
      if (row.role === 'user') {
        return {
          time,
          message: {
            id: row.id,
            input: { text: row.content.split('\n\n---\n当前页面上下文')[0], message_type: 'text' },
            history: { timestamp },
          },
        } as HistoryItem;
      }
      return {
        time,
        message: {
          id: row.id,
          output: {
            generic: [{ response_type: MessageResponseTypes.TEXT, text: row.content }],
          },
          history: { timestamp },
        },
      } as HistoryItem;
    });
  }, [ensureConversation]);

  const customSendMessage = useCallback(async (
    request: MessageRequest,
    requestOptions: CustomSendMessageOptions,
    instance: ChatInstance,
  ) => {
    const message = request.input.text?.trim();
    if (!message) return;
    const conversationId = await ensureConversation();
    const context = readPageContext(pathnameRef.current);
    setWelcomeVisible(true);
    setAvatarEmotion('thinking');
    try {
      const result = await agentRequest<{ reply: string; model?: string; task?: { goal?: string } | null }>(
        '/api/v1/agent/chat',
        {
          method: 'POST',
          signal: requestOptions.signal,
          body: JSON.stringify({
            conversationId,
            message: `${message}\\n\\n---\\n${context}`,
          }),
        },
      );
      const reply = [result.reply, result.model ? `\\n\\n模型：${result.model}` : ''].join('');
      await instance.messaging.addMessage({
        output: {
          generic: [{
            response_type: MessageResponseTypes.TEXT,
            text: reply,
          }],
        },
      });
      setAvatarEmotion('success');
      window.setTimeout(() => {
        setAvatarEmotion((current) => current === 'success' ? 'idle' : current);
        setWelcomeVisible(false);
      }, 1800);
    } catch (error) {
      setAvatarEmotion('error');
      window.setTimeout(() => {
        setAvatarEmotion((current) => current === 'error' ? 'idle' : current);
        setWelcomeVisible(false);
      }, 1800);
      throw error;
    }
  }, [ensureConversation]);

  const chatConfig = useMemo<PublicConfig>(() => ({
    aiEnabled: true,
    openChatByDefault: true,
    header: {
      isOn: false,
    },
    layout: {
      showFrame: false,
    },
    messaging: {
      skipWelcome: true,
      messageTimeoutSecs: 180,
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
            <Heading className="tp-xiaoya-drawer__heading cds--type-heading-compact-01">小雅 AI 助手</Heading>
          </div>
          <Button kind="ghost" size="sm" onClick={onClose}>
            <CarbonIcons.Close size={16} />
            关闭
          </Button>
        </div>
        {welcomeVisible && (
          <section className="tp-xiaoya-welcome" aria-label="小雅助手介绍">
            <div className={`tp-xiaoya-welcome__avatar tp-xiaoya-welcome__avatar--${avatarEmotion}`}>
              <XiaoyaAvatar emotion={avatarEmotion} size={64} />
            </div>
            <Heading className="tp-xiaoya-welcome__title cds--type-heading-compact-02">你好，我是小雅。</Heading>
            <p className="tp-xiaoya-welcome__description cds--type-label-01">我可以结合当前页面上下文，帮你分析业务数据、查找信息、梳理问题并完成日常工作。</p>
          </section>
        )}
        <div className="tp-xiaoya-drawer__chat">
          {hasMounted && <ChatCustomElement className="tp-xiaoya-chat" {...chatConfig} />}
        </div>
      </aside>
    </div>
  );
}

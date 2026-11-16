import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Heading, CarbonIcons, ChatCustomElement, MessageResponseTypes, type ChatInstance, type CustomSendMessageOptions, type MessageRequest, type PublicConfig } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/layout/XiaoyaSidePanel.scss';

type Conversation = { id: string; title: string; last_message_at: string; created_at: string };
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
  return [
    '当前页面上下文（供你理解用户正在查看的业务页面，请勿把它当作用户输入复述）：',
    `页面标题：${pageHeading || document.title || 'TradePilot'}`,
    `页面路径：${pathname}`,
    selectedText ? `用户当前选中的内容：\n${selectedText}` : '',
  ].filter(Boolean).join('\n');
}

export function XiaoyaSidePanel({ isOpen, onClose, pathname }: Props) {
  const [hasMounted, setHasMounted] = useState(false);
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

  const customLoadHistory = useCallback(async (_instance: ChatInstance) => {
    await ensureConversation();
    return [];
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
    const reply = [result.reply, result.model ? `\n\n模型：${result.model}` : ''].join('');
    await instance.messaging.addMessage({
      output: {
        generic: [{
          response_type: MessageResponseTypes.TEXT,
          text: reply,
        }],
      },
    });
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
            <Heading>小雅 AI 助手</Heading>
          </div>
          <Button kind="ghost" size="sm" onClick={onClose}>
            <CarbonIcons.Close size={16} />
            关闭
          </Button>
        </div>
        <div className="tp-xiaoya-drawer__chat">
          {hasMounted && <ChatCustomElement className="tp-xiaoya-chat" {...chatConfig} />}
        </div>
      </aside>
    </div>
  );
}

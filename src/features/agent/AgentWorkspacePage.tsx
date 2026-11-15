import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Column, Grid, InlineLoading, InlineNotification, Tag, TextArea, Tile, CarbonIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type AgentTask = {
  goal: string;
  agentKey: string;
  country: string;
  mode: 'planner' | 'internal' | 'external';
};
type Conversation = { id: string; title: string; last_message_at: string; created_at: string };
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: { task?: AgentTask | null; model?: string; error?: boolean };
};
type ApiEnvelope<T> = { data: T } | { error?: { message?: string } };

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

export function AgentWorkspacePage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [startingTask, setStartingTask] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadConversations = useCallback(async () => {
    const rows = await agentRequest<Conversation[]>('/api/v1/agent/conversations');
    setConversations(rows);
    if (!conversationId && rows.length) setConversationId(rows[0].id);
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    agentRequest<Conversation[]>('/api/v1/agent/conversations')
      .then((rows) => {
        if (!active) return;
        setConversations(rows);
        if (rows.length) setConversationId(rows[0].id);
        else {
          return agentRequest<Conversation>('/api/v1/agent/conversations', {
            method: 'POST',
            body: JSON.stringify({ title: '新聊天' }),
          }).then((created) => {
            if (!active) return;
            setConversations([created]);
            setConversationId(created.id);
          });
        }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '读取对话失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    agentRequest<ChatMessage[]>(`/api/v1/agent/conversations/${conversationId}/messages`)
      .then((rows) => { if (active) setMessages(rows); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '读取对话消息失败'); });
    return () => { active = false; };
  }, [conversationId]);

  const createConversation = async () => {
    setError('');
    try {
      const created = await agentRequest<Conversation>('/api/v1/agent/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: '新聊天' }),
      });
      setConversations((items) => [created, ...items]);
      setConversationId(created.id);
      setMessages([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法创建新对话');
    }
  };

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || sending || !conversationId) return;
    setDraft('');
    setSending(true);
    setError('');
    setNotice('');
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: message,
    };
    setMessages((items) => [...items, optimistic]);
    try {
      const result = await agentRequest<{ conversationId: string; reply: string; task: AgentTask | null; model: string }>(
        '/api/v1/agent/chat',
        { method: 'POST', body: JSON.stringify({ conversationId, message }) },
      );
      if (result.conversationId !== conversationId) setConversationId(result.conversationId);
      setMessages((items) => [...items, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.reply,
        metadata: { task: result.task, model: result.model },
      }]);
      await loadConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发送消息失败');
    } finally {
      setSending(false);
    }
  };

  const startTask = async (messageId: string, task: AgentTask) => {
    if (startingTask) return;
    setStartingTask(messageId);
    setError('');
    setNotice('');
    try {
      const result = await agentRequest<{ id: string; taskCode?: string; status: string; message?: string }>(
        '/api/v1/agent/runs',
        {
          method: 'POST',
          body: JSON.stringify({
            goal: task.goal,
            execution: {
              mode: task.mode === 'internal' ? 'internal_discovery' : 'planner',
              agentKey: task.agentKey,
              country: task.country,
              searchEngine: 'serper',
              limitPerCountry: 50,
            },
          }),
        },
      );
      setNotice(`任务已创建：${result.taskCode || result.id}。可在任务执行中心查看执行状态。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动任务失败');
    } finally {
      setStartingTask('');
    }
  };

  return (
    <main>
      <Grid fullWidth>
        <Column sm={4} md={4} lg={4}>
          <Tile>
            <Grid>
              <Column sm={4} md={4} lg={4}>
                <h2>小雅</h2>
                <p>TradePilot 智能业务助理</p>
              </Column>
              <Column sm={4} md={4} lg={4}>
                <Button kind="primary" size="sm" onClick={() => void createConversation()}>
                  <CarbonIcons.Add size={16} /> 新建对话
                </Button>
              </Column>
            </Grid>
            <p>历史对话</p>
            {loading && <InlineLoading description="正在加载对话…" />}
            {conversations.map((item) => (
              <Button
                key={item.id}
                kind={conversationId === item.id ? 'primary' : 'ghost'}
                size="sm"
                className="tp-agent__conversation"
                onClick={() => setConversationId(item.id)}
              >
                {item.title || '新聊天'}
              </Button>
            ))}
            <Button kind="ghost" size="sm" onClick={() => navigate('/recent-tasks')}>
              查看任务执行中心
            </Button>
          </Tile>
        </Column>
        <Column sm={4} md={4} lg={12}>
          <Tile>
            <h1>与小雅对话</h1>
            <p>直接描述业务目标。小雅会理解上下文、分析需求，并在需要执行任务时生成可确认的任务方案。</p>
            <Tag type="blue">智能混合对话</Tag>
            {error && <InlineNotification kind="error" title="操作失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
            {notice && <InlineNotification kind="success" title="任务已创建" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
            <div aria-live="polite">
              {messages.map((item) => (
                <Tile key={item.id}>
                  <p><strong>{item.role === 'user' ? '你' : '小雅'}</strong></p>
                  <p>{item.content}</p>
                  {item.metadata?.model && <Tag type="cool-gray">模型：{item.metadata.model}</Tag>}
                  {item.metadata?.task && (
                    <Tile>
                      <h3>任务方案</h3>
                      <p>{item.metadata.task.goal}</p>
                      <p>执行角色：{item.metadata.task.agentKey} · 目标国家：{item.metadata.task.country}</p>
                      <Button
                        kind="primary"
                        size="sm"
                        disabled={Boolean(startingTask)}
                        onClick={() => void startTask(item.id, item.metadata!.task!)}
                      >
                        {startingTask === item.id ? '正在创建任务…' : '创建并执行任务'}
                      </Button>
                    </Tile>
                  )}
                </Tile>
              ))}
              {sending && <InlineLoading description="小雅正在思考…" />}
              {!messages.length && !loading && (
                <Tile>
                  <h3>你好，我是小雅。</h3>
                  <p>你可以让我分析客户、产品、销售订单、发运和收款数据，也可以让我研究全球市场或准备业务任务。</p>
                </Tile>
              )}
            </div>
            <TextArea
              id="xiaoya-message"
              labelText="发送给小雅"
              placeholder="例如：帮我分析最近 30 天的潜在客户，并找出最值得优先跟进的客户。"
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
            />
            <Button kind="primary" disabled={!draft.trim() || sending || !conversationId} onClick={() => void sendMessage()}>
              <CarbonIcons.Send size={16} /> 发送
            </Button>
          </Tile>
        </Column>
      </Grid>
    </main>
  );
}

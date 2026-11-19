import { PageHeader } from '@/design-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button, Link, InlineNotification, Select, SelectItem, Tag, TextArea, Tile, semanticIcons, TPInlineLoading, TPSkeleton,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/layout/AgentWorkspace.scss';
import { XiaoyaAvatar } from './XiaoyaAvatar';

type AgentTask = {
  goal: string;
  agentKey: string;
  country: string;
  mode: 'planner' | 'internal' | 'external';
  channel?: 'search_engine' | 'facebook' | 'instagram';
  objectTypes?: string[];
};
type Conversation = { id: string; title: string; last_message_at: string; created_at: string };
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: { task?: AgentTask | null; model?: string; error?: boolean; toolsUsed?: Array<{ name: string; label: string; count: number }>; runId?: string; runStatus?: string; runProgress?: number };
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [startingTask, setStartingTask] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const reportedRunIdsRef = useRef<Set<string>>(new Set());

  const handleMessagesScroll = useCallback(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 96;
  }, []);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !shouldStickToBottomRef.current) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

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
      const result = await agentRequest<{ conversationId: string; messageId: string | null; reply: string; task: AgentTask | null; model: string; toolsUsed?: Array<{ name: string; label: string; count: number }> }>(
        '/api/v1/agent/chat',
        { method: 'POST', body: JSON.stringify({ conversationId, message }) },
      );
      if (result.conversationId !== conversationId) setConversationId(result.conversationId);
      setMessages((items) => [...items, {
        id: result.messageId || `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.reply,
        metadata: { task: result.task, model: result.model, toolsUsed: result.toolsUsed },
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
              channel: task.channel || 'search_engine',
              objectTypes: task.objectTypes || ['page', 'group', 'post'],
              agentKey: task.agentKey,
              country: task.country,
              searchEngine: 'serper',
              limitPerCountry: 50,
            },
          }),
        },
      );
      setMessages(items => items.map(item => item.id === messageId ? { ...item, metadata: { ...item.metadata, runId: result.id, runStatus: result.status, runProgress: 0 } } : item));
      await agentRequest('/api/v1/agent/conversations/' + conversationId + '/messages/' + messageId, { method: 'PATCH', body: JSON.stringify({ metadata: { runId: result.id, runStatus: result.status, runProgress: 0, task } }) });
      setNotice(`任务已启动：${result.taskCode || result.id}。小雅正在跟踪执行进度。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动任务失败');
    } finally {
      setStartingTask('');
    }
  };

  useEffect(() => {
    const activeRuns = messages.filter(item => item.role === 'assistant' && item.metadata?.runId && !['succeeded','failed','cancelled'].includes(item.metadata.runStatus || ''));
    if (!activeRuns.length || !conversationId) return;
    const timer = window.setInterval(() => {
      void Promise.all(activeRuns.map(async item => {
        const runId = item.metadata?.runId;
        if (!runId) return;
        try {
          const detail = await agentRequest<{ run: { status: string; result?: Record<string, unknown>; error_message?: string }; discoveryRun?: { progress?: number; message?: string; discovered_count?: number }; records?: Array<Record<string, unknown>> }>('/api/v1/agent/runs/' + runId);
          const status = detail.run.status;
          const progress = Number(detail.discoveryRun?.progress || 0);
          setMessages(rows => rows.map(row => row.id === item.id ? { ...row, metadata: { ...row.metadata, runStatus: status, runProgress: progress } } : row));
          if (['succeeded','failed','cancelled'].includes(status) && !reportedRunIdsRef.current.has(runId)) {
            reportedRunIdsRef.current.add(runId);
            try {
              await agentRequest('/api/v1/agent/conversations/' + conversationId + '/messages/' + item.id, { method:'PATCH', body:JSON.stringify({ metadata:{ ...item.metadata, runStatus:status, runProgress:progress } }) });
            } catch { /* local state still reflects the terminal status */ }
            const runResult = detail.run.result || {};
            const specialistSummary = Array.isArray(runResult.specialists)
              ? runResult.specialists.map(value => {
                  const specialist = value as Record<string, unknown>;
                  return String(specialist.label || specialist.agentKey || '专业 Agent') + '\n' + String(specialist.output || '');
                }).join('\n\n').slice(0, 3200)
              : '';
            const toolSummary = runResult.data ? JSON.stringify(runResult.data).slice(0, 2400) : '';
            const recordSummary = (detail.records || []).slice(0, 10).map(record => [String(record.name || '未命名企业'), String(record.country_code || ''), String(record.website || '')].filter(Boolean).join(' · ')).join('\n');
            const resultSummary = specialistSummary || toolSummary || recordSummary;
            const content = status === 'succeeded'
              ? ('任务已完成。\n\n' + (detail.discoveryRun?.message || '执行工作流已完成。') + '\n发现记录：' + (detail.discoveryRun?.discovered_count ?? detail.records?.length ?? 0) + ' 条。\n\n' + resultSummary + '\n\n任务编号：' + runId).slice(0, 4700)
              : '任务' + (status === 'cancelled' ? '已取消' : '执行失败') + '。\n\n' + (detail.run.error_message || detail.discoveryRun?.message || '请前往任务执行中心查看详情。');
            try {
              const saved = await agentRequest<ChatMessage>('/api/v1/agent/conversations/' + conversationId + '/messages', { method:'POST', body:JSON.stringify({ role:'assistant', content, metadata:{ runId, runStatus:status, runResult:detail.run.result || null } }) });
              setMessages(rows => [...rows, saved]);
            } catch {
              setMessages(rows => [...rows, { id:'run-result-' + runId, role:'assistant', content }]);
            }
          }
        } catch { /* transient polling failure */ }
      }));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [messages, conversationId]);

  return (
    <main className="tp-agent">
      <PageHeader className="tp-agent__page-header">
        <div>
          <h1 className="tp-agent__page-title">小雅</h1>
          <p className="tp-agent__page-description">TradePilot 智能业务助理</p>
        </div>
        <Tag type="blue">智能混合对话</Tag>
      </PageHeader>

      {error && <InlineNotification className="tp-agent__notification" kind="error" title="操作失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification className="tp-agent__notification" kind="success" title="任务已创建" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      <div className="tp-agent__workspace">
        <section className="tp-agent__history" aria-label="历史对话">
          <div className="tp-agent__history-select">
            <Select
              id="agent-conversation-select"
              labelText="历史对话"
              size="md"
              value={conversationId}
              disabled={loading || !conversations.length}
              onChange={(event) => setConversationId(event.currentTarget.value)}
            >
              <SelectItem value="" text="选择历史对话" />
              {conversations.map((item) => (
                <SelectItem key={item.id} value={item.id} text={item.title || '新聊天'} />
              ))}
            </Select>
          </div>
          <div className="tp-agent__history-actions">
            <Button kind="tertiary" size="md" onClick={() => void createConversation()}>
              <semanticIcons.add size={16} /> 新建对话
            </Button>
            <Link href="/recent-tasks" renderIcon={semanticIcons.task}>任务执行中心</Link>
          </div>
          {loading && <TPSkeleton variant="text" rows={3} className="tp-agent__history-loading" />}
        </section>

        <section className="tp-agent__chat" aria-label="小雅聊天窗口">
          <div className="tp-agent__chat-header">
            <XiaoyaAvatar emotion="idle" size={40} />
            <div>
              <h2>与小雅对话</h2>
            </div>
          </div>

          <div ref={messagesViewportRef} onScroll={handleMessagesScroll} className="tp-agent__messages" aria-live="polite">
            {loading && !messages.length && <TPSkeleton variant="conversation" rows={4} className="tp-agent__messages-loading" />}
            {!messages.length && !loading && (
              <div className="tp-agent__welcome">
                <h3>你好，我是小雅。</h3>
                <p>你可以让我分析客户、产品、销售订单、发运和收款数据，也可以让我研究全球市场或准备业务任务。</p>
                <p className="tp-agent__welcome-hint">直接输入目标开始对话。需要执行任务时，我会先向你展示任务方案。</p>
              </div>
            )}
            {messages.map((item) => (
              <article key={item.id} className={`tp-agent__message tp-agent__message--${item.role}`}>
                {item.role === 'assistant' && (
                  <div className="tp-agent__message-avatar">
                    <XiaoyaAvatar emotion="idle" size={32} />
                  </div>
                )}
                <div className="tp-agent__message-body">
                  <div className="tp-agent__message-label">{item.role === 'user' ? '你' : '小雅'}</div>
                  <div className="tp-agent__message-content">
                    <p>{item.content}</p>
                    {item.metadata?.model && <Tag type="cool-gray">模型：{item.metadata.model}</Tag>}
                    {item.metadata?.toolsUsed?.map((tool) => (
                      <Tag key={tool.name} type="green">已查询：{tool.label}（{tool.count}）</Tag>
                    ))}
                    {item.metadata?.task && (
                      <Tile className="tp-agent__task-card">
                        <div className="tp-agent__task-card-heading">
                          <semanticIcons.task size={20} />
                          <h3>任务方案</h3>
                        </div>
                        <p>{item.metadata.task.goal}</p>
                        {item.metadata.task.channel && item.metadata.task.channel !== 'search_engine' && <Tag type="purple">Apify · {item.metadata.task.channel === 'facebook' ? 'Facebook' : 'Instagram'}</Tag>}
                        {item.metadata.runId && <Tag type={item.metadata.runStatus === 'succeeded' ? 'green' : item.metadata.runStatus === 'failed' ? 'red' : 'blue'}>{item.metadata.runStatus === 'succeeded' ? '执行完成' : item.metadata.runStatus === 'failed' ? '执行失败' : item.metadata.runStatus === 'running' ? '正在执行' : item.metadata.runStatus === 'awaiting_approval' ? '等待人工审批' : '任务已排队'} · {item.metadata.runProgress || 0}%</Tag>}
                        <p className="tp-agent__task-meta">执行角色：{item.metadata.task.agentKey} · 目标国家：{item.metadata.task.country}</p>
                        {item.metadata.runId ? (
                          <Link href="/recent-tasks" renderIcon={semanticIcons.task}>已启动，查看任务中心</Link>
                        ) : (
                          <Button
                            kind="tertiary"
                            size="md"
                            disabled={Boolean(startingTask)}
                            onClick={() => void startTask(item.id, item.metadata!.task!)}
                          >
                            {startingTask === item.id ? '正在创建任务…' : '确认并执行'}
                          </Button>
                        )}
                      </Tile>
                    )}
                  </div>
                </div>
              </article>
            ))}
            {sending && (
              <div className="tp-agent__thinking">
                <XiaoyaAvatar emotion="thinking" size={32} />
                <TPInlineLoading status="active" description="小雅正在思考…" />
              </div>
            )}
          </div>

          <div className="tp-agent__composer">
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
            <div className="tp-agent__composer-footer">
              <span>Enter 发送 · Shift + Enter 换行</span>
              <Button kind="primary" disabled={!draft.trim() || sending || !conversationId} onClick={() => void sendMessage()}>
                <semanticIcons.send size={16} /> 发送
              </Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

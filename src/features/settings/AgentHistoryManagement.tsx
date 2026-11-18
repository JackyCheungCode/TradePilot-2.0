import { PageSkeleton } from '@/design-system';
import { useEffect, useMemo, useState } from 'react';
import {
  Button, Checkbox, InlineLoading, InlineNotification, Modal,
  Table, TableHead, TableRow, TableHeader, TableBody, TableCell, Tag,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type Conversation = {
  id: string;
  title: string;
  last_message_at: string;
  created_at: string;
};

type ApiEnvelope<T> = { data: T } | { error?: { message?: string } };

async function agentApi<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    throw new Error(('error' in payload && payload.error?.message) || 'AI 历史记录操作失败。');
  }
  return payload.data;
}

function formatDate(value: string): string {
  if (!value) return '—';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
    : '—';
}

export function AgentHistoryManagement() {
  const [rows, setRows] = useState<Conversation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const allSelected = rows.length > 0 && rows.every((item) => selectedIds.includes(item.id));
  const selectedCount = selectedIds.length;
  const selectedVisibleCount = useMemo(
    () => rows.filter((item) => selectedIds.includes(item.id)).length,
    [rows, selectedIds],
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await agentApi<Conversation[]>('/api/v1/agent/conversations');
      setRows(data);
      setSelectedIds((current) => current.filter((id) => data.some((item) => item.id === id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取 AI 历史记录失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((current) => checked
      ? [...new Set([...current, id])]
      : current.filter((item) => item !== id));
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds((current) => checked
      ? [...new Set([...current, ...rows.map((item) => item.id)])]
      : current.filter((id) => !rows.some((item) => item.id === id)));
  };

  const removeSelected = async () => {
    if (!selectedIds.length || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await agentApi<{ deletedCount: number; deletedIds: string[] }>(
        '/api/v1/agent/conversations/bulk-delete',
        { method: 'POST', body: JSON.stringify({ conversationIds: selectedIds }) },
      );
      const deleted = new Set(result.deletedIds || []);
      setRows((current) => current.filter((item) => !deleted.has(item.id)));
      setSelectedIds((current) => current.filter((id) => !deleted.has(id)));
      setNotice(`已移除 ${result.deletedCount} 条 AI 历史对话及其消息。`);
      setConfirmOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批量移除失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSkeleton className="tp-settings__editor" layout={[
  { type: 'group', direction: 'row', gap: 'var(--cds-spacing-05)', className: 'tp-settings__editor-title', children: [
    { type: 'group', direction: 'column', gap: 'var(--cds-spacing-02)', children: [{ type: 'text', heading: true, width: '12rem' }, { type: 'text', width: '30rem' }] },
    { type: 'placeholder', width: '7rem', height: '2.5rem' },
  ] },
  { type: 'group', direction: 'row', gap: 'var(--cds-spacing-05)', className: 'tp-settings__editor-title', children: [
    { type: 'placeholder', width: '7rem', height: '2rem' }, { type: 'placeholder', width: '9rem', height: '2.5rem' },
  ] },
  { type: 'table', columns: 5, rows: 7, className: 'tp-settings__table-wrap' },
]} />;
  return (
    <section className="tp-settings__editor">
      <div className="tp-settings__editor-title">
        <div>
          <h4>AI 历史记录管理</h4>
          <p>查看小雅的历史对话，选择需要移除的记录。移除会同时删除该对话中的消息，且无法恢复。</p>
        </div>
        <Button kind="tertiary" size="sm" onClick={() => void load()} disabled={loading || busy}>
          刷新记录
        </Button>
      </div>

      {error && <InlineNotification kind="error" title="操作失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" title="操作完成" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      <div className="tp-settings__editor-title">
        <div className="tp-settings__workspace-status">
          <Tag type="blue">共 {rows.length} 条</Tag>
          <span>已选择 {selectedCount} 条</span>
        </div>
        <Button kind="danger" size="sm" disabled={!selectedCount || busy} onClick={() => setConfirmOpen(true)}>
          移除所选记录
        </Button>
      </div>

      {loading ? <InlineLoading description="正在读取 AI 历史记录…" /> : (
        <div className="tp-settings__table-wrap">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>
                  <Checkbox
                    id="agent-history-select-all"
                    labelText="全选当前列表"
                    hideLabel
                    checked={allSelected}
                    indeterminate={selectedVisibleCount > 0 && !allSelected}
                    onChange={(_event, data) => toggleAll(data.checked)}
                  />
                </TableHeader>
                <TableHeader>对话标题</TableHeader>
                <TableHeader>创建时间</TableHeader>
                <TableHeader>最近对话</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Checkbox
                      id={`agent-history-${item.id}`}
                      labelText={`选择对话：${item.title || '新聊天'}`}
                      hideLabel
                      checked={selectedIds.includes(item.id)}
                      onChange={(_event, data) => toggleOne(item.id, data.checked)}
                    />
                  </TableCell>
                  <TableCell>{item.title || '新聊天'}</TableCell>
                  <TableCell>{formatDate(item.created_at)}</TableCell>
                  <TableCell>{formatDate(item.last_message_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!rows.length && <p className="tp-settings__empty">暂无 AI 历史对话。</p>}
        </div>
      )}

      <Modal
        open={confirmOpen}
        modalHeading="确认批量移除 AI 历史记录"
        primaryButtonText={busy ? '正在移除…' : `移除 ${selectedCount} 条记录`}
        secondaryButtonText="取消"
        danger
        primaryButtonDisabled={busy || !selectedCount}
        onRequestClose={() => !busy && setConfirmOpen(false)}
        onRequestSubmit={() => void removeSelected()}
      >
        <p>即将永久移除所选的 {selectedCount} 条对话及其全部消息。此操作无法撤销。</p>
      </Modal>
    </section>
  );
}

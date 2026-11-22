import { useEffect, useState } from 'react';
import { Button, ContainedList, ContainedListItem, InlineNotification, TPSkeleton, Select, SelectItem, Tag, TextInput, ComposedModal, ModalBody, ModalFooter, ModalHeader } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

type ExternalTool = { name: string; description?: string; risk?: string; riskPolicySource?: string; protocol?: string };
type Connection = {
  id: string; name: string; protocol: 'mcp'|'rest_api'|'webhook'; endpoint_url: string;
  auth_mode: string; capabilities: string[]; protocol_tools: ExternalTool[];
  protocol_metadata: Record<string, unknown>; status: string; last_tested_at: string|null; last_error: string|null;
};
async function connectionRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const client = await getSupabaseClient();
  const { data } = await client.auth.getSession();
  if (!data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
  const response = await fetch(path, { ...init, headers: { Authorization: 'Bearer ' + data.session.access_token, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const payload = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok || !('data' in payload)) throw new Error(payload.error?.message || '外部 Agent 请求失败。');
  return payload.data as T;
}
const protocolLabels: Record<string,string> = { mcp:'MCP', rest_api:'REST API / OpenAPI 3', webhook:'Webhook' };
function statusTag(status: string) {
  if (status === 'active') return <Tag type="green">已连接</Tag>;
  if (status === 'failed') return <Tag type="red">异常</Tag>;
  return <Tag type="cool-gray">待验证</Tag>;
}

export function ExternalAgentConnections() {
  const [connections,setConnections] = useState<Connection[]>([]);
  const [name,setName] = useState('');
  const [protocol,setProtocol] = useState<'mcp'|'rest_api'|'webhook'>('mcp');
  const [endpoint,setEndpoint] = useState('');
  const [authMode,setAuthMode] = useState('none');
  const [token,setToken] = useState('');
  const [headerName,setHeaderName] = useState('X-API-Key');
  const [headerValue,setHeaderValue] = useState('');
  const [capabilities,setCapabilities] = useState('');
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [busyId,setBusyId] = useState('');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [removeConfirm,setRemoveConfirm] = useState<Connection|null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try { setConnections(await connectionRequest<Connection[]>('/api/v1/agent/connections')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '读取外部 Agent 连接失败。'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const addConnection = async () => {
    if (!name.trim() || !endpoint.trim()) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const credentials = authMode === 'bearer' || authMode === 'webhook_secret' ? { token }
        : authMode === 'header' ? { headerName, headerValue } : undefined;
      const created = await connectionRequest<Connection>('/api/v1/agent/connections', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(), protocol, endpointUrl: endpoint.trim(), authMode,
          ...(credentials ? { credentials } : {}),
          capabilities: capabilities.split(',').map(value => value.trim()).filter(Boolean),
        }),
      });
      setConnections(rows => [created, ...rows]);
      setName(''); setEndpoint(''); setToken(''); setHeaderValue(''); setCapabilities('');
      setNotice('外部 Agent 连接已登记。请执行“发现能力”以验证端点并读取可调用工具。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建连接失败。'); }
    finally { setSaving(false); }
  };

  const discover = async (connection: Connection) => {
    setBusyId(connection.id); setError(''); setNotice('');
    try {
      const result = await connectionRequest<{ status: string; tools: ExternalTool[]; metadata: Record<string,unknown> }>('/api/v1/agent/connections/' + connection.id + '/discover', { method: 'POST', body: '{}' });
      setConnections(rows => rows.map(row => row.id === connection.id ? { ...row, status: result.status, protocol_tools: result.tools, protocol_metadata: result.metadata, last_tested_at: new Date().toISOString(), last_error: null } : row));
      setNotice(connection.name + '：已发现 ' + result.tools.length + ' 项能力。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '发现外部 Agent 能力失败。'); }
    finally { setBusyId(''); }
  };

  const remove = (connection: Connection) => setRemoveConfirm(connection);

  const confirmRemove = async () => {
    const connection = removeConfirm;
    if (!connection) return;
    setRemoveConfirm(null);
    setBusyId(connection.id); setError(''); setNotice('');
    try {
      await connectionRequest('/api/v1/agent/connections/' + connection.id, { method: 'DELETE' });
      setConnections(rows => rows.filter(row => row.id !== connection.id));
      setNotice(connection.name + ' 已从当前账户移除。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '删除连接失败。'); }
    finally { setBusyId(''); }
  };

  return <div className="tp-settings-agent">
    {error && <InlineNotification kind="error" title="连接操作失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
    {notice && <InlineNotification kind="success" title="操作完成" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
    <section className="tp-settings__editor">
      <h4>接入第三方 Agent / MCP Server</h4>
      <p>仅支持 HTTPS 公网端点。MCP 会自动发现 tools；REST API 需要提供 OpenAPI 3.x JSON 文档地址；Webhook 按已声明能力登记触发入口。</p>
      <div className="tp-settings__editor-grid">
        <TextInput id="external-agent-name" labelText="连接名称" value={name} onChange={event => setName(event.currentTarget.value)} />
        <Select id="external-agent-protocol" labelText="接入协议" value={protocol} onChange={event => setProtocol(event.currentTarget.value as typeof protocol)}>
          <SelectItem value="mcp" text="MCP Server" />
          <SelectItem value="rest_api" text="REST API / OpenAPI 3" />
          <SelectItem value="webhook" text="Webhook" />
        </Select>
        <TextInput id="external-agent-endpoint" labelText={protocol === 'rest_api' ? 'OpenAPI 3.x JSON 地址' : 'HTTPS Endpoint'} value={endpoint} onChange={event => setEndpoint(event.currentTarget.value)} placeholder="https://api.example.com/..." />
        <Select id="external-agent-auth-mode" labelText="认证方式" value={authMode} onChange={event => setAuthMode(event.currentTarget.value)}>
          <SelectItem value="none" text="无认证" />
          <SelectItem value="bearer" text="Bearer Token" />
          <SelectItem value="header" text="自定义 Header" />
          <SelectItem value="webhook_secret" text="Webhook Secret" />
        </Select>
        {(authMode === 'bearer' || authMode === 'webhook_secret') && <TextInput id="external-agent-token" labelText={authMode === 'bearer' ? 'Bearer Token' : 'Webhook Secret'} type="password" autoComplete="new-password" value={token} onChange={event => setToken(event.currentTarget.value)} />}
        {authMode === 'header' && <>
          <TextInput id="external-agent-header-name" labelText="Header 名称" value={headerName} onChange={event => setHeaderName(event.currentTarget.value)} />
          <TextInput id="external-agent-header-value" labelText="Header 值" type="password" autoComplete="new-password" value={headerValue} onChange={event => setHeaderValue(event.currentTarget.value)} />
        </>}
        <TextInput id="external-agent-capabilities" labelText="能力标签（逗号分隔，可选）" value={capabilities} onChange={event => setCapabilities(event.currentTarget.value)} placeholder="market_research, company_research" />
      </div>
      <Button kind="primary" disabled={saving || name.trim().length < 2 || !endpoint.trim() || ((authMode === 'bearer' || authMode === 'webhook_secret') && !token.trim()) || (authMode === 'header' && (!headerName.trim() || !headerValue.trim()))} onClick={() => void addConnection()}>{saving ? '正在登记…' : '登记连接'}</Button>
    </section>

    <section className="tp-settings__editor">
      <h4>已登记的外部连接 <Tag type="cool-gray">{connections.length}</Tag></h4>
      {loading ? <TPSkeleton variant="card" rows={3}/> : !connections.length ? <p>暂无外部 Agent 连接。登记后可发现其工具能力，并由小雅在任务规划时选择调用。</p> : (
        <ContainedList kind="on-page" label="外部 Agent 连接" size="md">
          {connections.map(connection => (
            <ContainedListItem key={connection.id}>
              <div>
                <strong>{connection.name}</strong>
                <p>{protocolLabels[connection.protocol]} · {connection.endpoint_url}</p>
                <div>{statusTag(connection.status)} <Tag type="cool-gray">{connection.protocol_tools?.length || 0} 项能力</Tag></div>
                {connection.last_error && <p>{connection.last_error}</p>}
                {(connection.protocol_tools || []).length > 0 && <div>
                  {(connection.protocol_tools || []).slice(0, 12).map(tool => { const effectiveRisk = tool.risk === 'blocked' ? 'blocked' : tool.risk === 'read_only' && tool.riskPolicySource === 'user' ? 'read_only' : 'approval_required'; return <p key={tool.name}><strong>{tool.name}</strong> — {tool.description || '无说明'} <Tag type={effectiveRisk === 'read_only' ? 'green' : effectiveRisk === 'blocked' ? 'red' : 'warm-gray'}>{effectiveRisk === 'read_only' ? '只读自动执行' : effectiveRisk === 'blocked' ? '禁止调用' : '执行前审批'}</Tag></p>; })}
                </div>}
                <div>
                  <Button kind="tertiary" size="sm" disabled={busyId === connection.id} onClick={() => void discover(connection)}>{busyId === connection.id ? '处理中…' : '发现能力 / 测试连接'}</Button>
                  <Button kind="tertiary" size="sm" disabled={busyId === connection.id} onClick={() => void remove(connection)}>移除连接</Button>
                </div>
              </div>
            </ContainedListItem>
          ))}
        </ContainedList>
      )}
    </section>
    <ComposedModal open={Boolean(removeConfirm)} onClose={() => setRemoveConfirm(null)} size="sm">
      <ModalHeader title="移除外部 Agent 连接？" />
      <ModalBody>
        <p>即将从当前账户移除连接 <strong>{removeConfirm?.name}</strong>。此操作会解除该连接的登记，之后需要重新登记才能使用。</p>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={() => setRemoveConfirm(null)}>取消</Button>
        <Button kind="danger" disabled={busyId === removeConfirm?.id} onClick={() => void confirmRemove()}>确认移除</Button>
      </ModalFooter>
    </ComposedModal>
  </div>;
}

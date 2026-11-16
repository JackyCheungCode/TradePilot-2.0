import { useEffect, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Modal, ModalBody, Select, SelectItem, Stack, Tag, TextInput, Tile } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import { createInboxConnection, getInboxConnections, type InboxConnection } from '@/features/inbox/api';

const channels = [
  { id: 'whatsapp', label: 'WhatsApp' }, { id: 'line', label: 'LINE' },
  { id: 'messenger', label: 'Messenger' }, { id: 'telegram', label: 'Telegram' },
];

export function MessagingChannelsSettings() {
  const [rows, setRows] = useState<InboxConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState('whatsapp');
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [createdWebhook, setCreatedWebhook] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      setRows(await getInboxConnections(session.access_token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取消息渠道连接失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('登录状态已失效，请重新登录。');
      const result = await createInboxConnection(session.access_token, {
        channelType: channel, displayName: name.trim(), externalAccountId: accountId.trim(),
      });
      setCreatedWebhook(result.webhook_url);
      setOpen(false);
      setName('');
      setAccountId('');
      setNotice('渠道连接已创建。请将 Webhook 地址配置到对应渠道平台。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建渠道连接失败。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="tp-messaging-channel-settings">
      <Stack gap={4}>
        <div className="tp-settings__content-head">
          <div><h3>消息渠道连接</h3><p>在此登记渠道账号并管理 Webhook；API 凭证请在上方对应渠道集成卡片中配置。</p></div>
          <Button kind="primary" onClick={() => setOpen(true)}>添加连接</Button>
        </div>
        {error && <InlineNotification kind="error" title="操作失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
        {notice && <InlineNotification kind="success" title="已创建" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
        {createdWebhook && <Tile><Stack gap={2}><strong>Webhook Callback URL</strong><code>{createdWebhook}</code><Button kind="ghost" size="sm" onClick={() => void navigator.clipboard?.writeText(createdWebhook)}>复制地址</Button></Stack></Tile>}
        {loading ? <InlineLoading description="正在读取渠道连接…" /> : rows.length === 0 ? <p>尚未登记渠道账号。添加连接后即可生成专属 Webhook 地址。</p> : rows.map(row => (
          <Tile key={row.id}><Stack gap={2}>
            <Stack orientation="horizontal" gap={2}>
              <strong>{row.display_name}</strong>
              <Tag type={row.connection_status === 'connected' ? 'green' : row.connection_status === 'error' ? 'red' : 'cool-gray'}>
                {row.connection_status === 'connected' ? '已验证' : row.connection_status === 'error' ? '连接错误' : '等待验证'}
              </Tag>
              <Tag type="blue">{channels.find(item => item.id === row.channel_type)?.label ?? row.channel_type}</Tag>
            </Stack>
            <p>渠道账号 ID：{row.external_account_id || '—'}</p>
            {row.webhook_url && <><code>{row.webhook_url}</code><Button kind="ghost" size="sm" onClick={() => void navigator.clipboard?.writeText(row.webhook_url || '')}>复制 Webhook</Button></>}
          </Stack></Tile>
        ))}
      </Stack>
      <Modal open={open} modalHeading="添加消息渠道连接" primaryButtonText={saving ? '正在创建…' : '创建连接'}
        primaryButtonDisabled={saving || !name.trim() || !accountId.trim()} secondaryButtonText="取消"
        onRequestSubmit={() => void create()} onRequestClose={() => setOpen(false)}>
        <ModalBody><Stack gap={4}>
          <Select id="messaging-channel-type" labelText="渠道类型" value={channel} onChange={event => setChannel(event.currentTarget.value)}>
            {channels.map(item => <SelectItem key={item.id} value={item.id} text={item.label} />)}
          </Select>
          <TextInput id="messaging-channel-name" labelText="连接名称" value={name} onChange={event => setName(event.currentTarget.value)} />
          <TextInput id="messaging-channel-account" labelText="渠道账号 ID" value={accountId} onChange={event => setAccountId(event.currentTarget.value)} />
        </Stack></ModalBody>
      </Modal>
    </section>
  );
}

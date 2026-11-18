import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, InlineLoading, InlineNotification, Select, SelectItem, TextInput, Toggle, CarbonIcons, useThemePreference,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/personal-settings.scss';

type SectionId = 'profile' | 'security' | 'appearance' | 'notifications' | 'work' | 'privacy';
type Preferences = {
  notifications: { taskCompletion: boolean; aiAnalysis: boolean; prospectDiscovery: boolean; system: boolean };
  work: { landingPage: string; pageSize: string; defaultMarket: string };
};
const defaults: Preferences = {
  notifications: { taskCompletion: true, aiAnalysis: true, prospectDiscovery: true, system: true },
  work: { landingPage: 'dashboard', pageSize: '25', defaultMarket: '' },
};
const sections: Array<{ id: SectionId; label: string; description: string; icon: React.ReactNode }> = [
  { id: 'profile', label: '个人资料', description: '头像与账户基本信息', icon: <CarbonIcons.User size={20} /> },
  { id: 'security', label: '登录与安全', description: 'Passkey、多因素认证与恢复', icon: <CarbonIcons.Security size={20} /> },
  { id: 'appearance', label: '外观与显示', description: '主题、语言、时区与格式', icon: <CarbonIcons.PaintBrush size={20} /> },
  { id: 'notifications', label: '通知偏好', description: '任务、分析与系统提醒', icon: <CarbonIcons.Notification size={20} /> },
  { id: 'work', label: '工作偏好', description: '默认页面、市场与列表密度', icon: <CarbonIcons.Workspace size={20} /> },
  { id: 'privacy', label: '隐私与账户管理', description: '个人设置导出与账户信息', icon: <CarbonIcons.Security size={20} /> },
];

function readPreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return defaults;
  const source = value as Partial<Preferences>;
  return {
    notifications: { ...defaults.notifications, ...(source.notifications ?? {}) },
    work: { ...defaults.work, ...(source.work ?? {}) },
  };
}

export function PersonalSettingsPage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const { preference, setPreference } = useThemePreference();
  const [active, setActive] = useState<SectionId>('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [preferences, setPreferences] = useState<Preferences>(defaults);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const client = await getSupabaseClient();
      const { data, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      const user = data.user;
      if (!user) throw new Error('登录状态已失效，请重新登录。');
      setUserId(user.id);
      setEmail(user.email ?? '');
      setCreatedAt(user.created_at);
      setDisplayName(String(user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? ''));
      setAvatarUrl(typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : '');
      setPreferences(readPreferences(user.user_metadata?.tradepilot_preferences));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取个人设置。');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveProfile = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const client = await getSupabaseClient();
      const { error: updateError } = await client.auth.updateUser({ data: { display_name: displayName.trim() } });
      if (updateError) throw updateError;
      setNotice('个人资料已保存。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存个人资料失败。'); }
    finally { setSaving(false); }
  };

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    setError(''); setNotice('');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
      setError('头像仅支持 JPG、PNG、WebP 或 AVIF 格式。'); return;
    }
    if (file.size > 2 * 1024 * 1024) { setError('头像文件不能超过 2 MB。'); return; }
    setUploading(true);
    try {
      const client = await getSupabaseClient();
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      const currentUser = authData.user;
      if (!currentUser || currentUser.id !== userId) throw new Error('登录状态已失效，请重新登录。');
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
      const path = currentUser.id + '/' + crypto.randomUUID() + '.' + extension;
      const { error: uploadError } = await client.storage.from('avatars').upload(path, file, {
        cacheControl: '3600', upsert: false, contentType: file.type,
      });
      if (uploadError) throw uploadError;
      const publicUrl = client.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      const previousPath = typeof currentUser.user_metadata?.avatar_path === 'string' ? currentUser.user_metadata.avatar_path : '';
      const { error: updateError } = await client.auth.updateUser({ data: { avatar_url: publicUrl, avatar_path: path } });
      if (updateError) {
        await client.storage.from('avatars').remove([path]);
        throw updateError;
      }
      setAvatarUrl(publicUrl);
      if (previousPath && previousPath.startsWith(currentUser.id + '/')) {
        await client.storage.from('avatars').remove([previousPath]);
      }
      setNotice('头像已保存，顶部账户图标已同步更新。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '头像上传失败。'); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ''; }
  };

  const savePreferences = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const client = await getSupabaseClient();
      const { error: updateError } = await client.auth.updateUser({ data: { tradepilot_preferences: preferences } });
      if (updateError) throw updateError;
      setNotice('个人偏好已保存。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存个人偏好失败。'); }
    finally { setSaving(false); }
  };

  const exportSettings = () => {
    const payload = { email, displayName, avatarUrl, themePreference: preference, preferences, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'tradepilot-personal-settings.json'; anchor.click();
    URL.revokeObjectURL(url);
    setNotice('个人设置文件已生成并下载。此文件仅包含个人资料摘要和偏好设置，不包含业务数据。');
  };

  const activeSection = sections.find((item) => item.id === active) ?? sections[0];

  return (
    <main className="tp-personal-settings">
      <header className="tp-personal-settings__header">
        <div>
          <p className="tp-personal-settings__eyebrow">TRADEPILOT / ACCOUNT</p>
          <h1>个人设置</h1>
          <p>管理个人账户、安全选项和 TradePilot 的工作体验。</p>
        </div>
      </header>
      {error && <InlineNotification kind="error" lowContrast title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" lowContrast title="设置已更新" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}
      {loading ? <InlineLoading description="正在读取个人设置…" /> : (
        <div className="tp-personal-settings__layout">
          <nav className="tp-personal-settings__nav" aria-label="个人设置目录">
            <p className="tp-personal-settings__nav-label">账户偏好</p>
            {sections.map((item) => (
              <Button key={item.id} kind="ghost" className={`tp-personal-settings__nav-item ${active === item.id ? 'is-active' : ''}`} onClick={() => { setActive(item.id); setError(''); setNotice(''); }} aria-pressed={active === item.id}>
                <span className="tp-personal-settings__nav-icon">{item.icon}</span>
                <span className="tp-personal-settings__nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
              </Button>
            ))}
          </nav>
          <section className="tp-personal-settings__panel" aria-labelledby="tp-personal-settings-title">
            <div className="tp-personal-settings__panel-heading">
              <div><h2 id="tp-personal-settings-title">{activeSection.label}</h2><p>{activeSection.description}</p></div>
            </div>

            {active === 'profile' && (
              <div className="tp-personal-settings__fields">
                <div className="tp-personal-settings__avatar-block">
                  <Button type="button" kind="ghost" className="tp-personal-settings__avatar-button" onClick={() => fileInput.current?.click()} disabled={uploading} aria-label="点击上传或更换个人头像">
                    {avatarUrl ? <img src={avatarUrl} alt="个人头像" /> : <CarbonIcons.UserAvatar size={64} />}
                    <span className="tp-personal-settings__avatar-overlay"><CarbonIcons.Camera size={20} /></span>
                  </Button>
                  <input ref={fileInput} className="tp-personal-settings__file-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void uploadAvatar(event.currentTarget.files?.[0])} />
                  <div><strong>个人头像</strong><p>点击头像即可上传或更换。支持 JPG、PNG、WebP、AVIF，最大 2 MB。</p><span>{uploading ? '正在上传头像…' : '头像保存后会同步到顶部账户图标。'}</span></div>
                </div>
                <div className="tp-personal-settings__field-grid">
                  <TextInput id="tp-profile-display-name" labelText="显示名称" value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} placeholder="输入显示名称" />
                  <TextInput id="tp-profile-email" labelText="登录邮箱" value={email} readOnly />
                </div>
                <div className="tp-personal-settings__meta"><span>账户 ID</span><code>{userId}</code><span>注册时间</span><strong>{createdAt ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium' }).format(new Date(createdAt)) : '—'}</strong></div>
                <div className="tp-personal-settings__actions"><Button onClick={() => void saveProfile()} disabled={saving || uploading}>{saving ? '正在保存…' : '保存个人资料'}</Button></div>
              </div>
            )}

            {active === 'security' && (
              <div className="tp-personal-settings__info">
                <CarbonIcons.Security size={32} />
                <h3>集中管理账户安全</h3>
                <p>Passkey、生物识别登录、多因素认证和恢复代码沿用现有安全管理功能，不重复建设或改变认证策略。</p>
                <Link href="/security" renderIcon={CarbonIcons.ArrowRight}>打开登录与安全设置</Link>
              </div>
            )}

            {active === 'appearance' && (
              <div className="tp-personal-settings__fields">
                <div className="tp-personal-settings__field">
                  <Select id="tp-personal-theme" labelText="界面主题" value={preference} onChange={(event) => setPreference(event.currentTarget.value as 'system' | 'white' | 'g10' | 'g90' | 'dark')}>
                    <SelectItem value="dark" text="深色（Carbon G100，系统默认）" />
                    <SelectItem value="g90" text="深灰色（Carbon G90）" />
                    <SelectItem value="g10" text="浅灰色（Carbon G10）" />
                    <SelectItem value="white" text="白色（Carbon White）" />
                    <SelectItem value="system" text="跟随设备系统" />
                  </Select>
                  <p className="tp-personal-settings__hint">主题选择会立即保存到当前账户，并同步到顶部主题菜单。</p>
                </div>
                <div className="tp-personal-settings__field-grid">
                  <Select id="tp-personal-language" labelText="界面语言" value="zh-TW" onChange={() => setNotice('目前界面语言固定为中文，更多语言将在后续版本开放。')}>
                    <SelectItem value="zh-TW" text="中文" />
                  </Select>
                  <Select id="tp-personal-timezone" labelText="时区" value={Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei'} onChange={() => setNotice('时区偏好选项已记录为后续接入项。')}>
                    <SelectItem value={Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei'} text={Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei'} />
                  </Select>
                </div>
              </div>
            )}

            {active === 'notifications' && (
              <div className="tp-personal-settings__fields">
                <p className="tp-personal-settings__section-intro">选择你希望在 TradePilot 中接收的提醒。偏好会保存到当前账户。</p>
                {([
                  ['taskCompletion', '任务执行完成', '潜客发现、采集及其他后台任务完成时提醒'],
                  ['aiAnalysis', 'AI 分析完成', 'AI 生成分析结果或报告时提醒'],
                  ['prospectDiscovery', '潜客发现动态', '发现新的潜在客户或重要线索时提醒'],
                  ['system', '系统通知', '账户、安全及系统维护相关通知'],
                ] as const).map(([key, label, description]) => (
                  <div className="tp-personal-settings__toggle-row" key={key}>
                    <div><strong>{label}</strong><span>{description}</span></div>
                    <Toggle id={`tp-notify-${key}`} labelText={label} labelA="关闭" labelB="开启" toggled={preferences.notifications[key]} onToggle={(checked) => setPreferences((current) => ({ ...current, notifications: { ...current.notifications, [key]: checked } }))} />
                  </div>
                ))}
                <div className="tp-personal-settings__actions"><Button onClick={() => void savePreferences()} disabled={saving}>{saving ? '正在保存…' : '保存通知偏好'}</Button></div>
              </div>
            )}

            {active === 'work' && (
              <div className="tp-personal-settings__fields">
                <div className="tp-personal-settings__field-grid">
                  <Select id="tp-work-landing" labelText="默认进入页面" value={preferences.work.landingPage} onChange={(event) => setPreferences((current) => ({ ...current, work: { ...current.work, landingPage: event.currentTarget.value } }))}>
                    <SelectItem value="dashboard" text="经营总览" /><SelectItem value="prospect-data" text="潜客数据" /><SelectItem value="leads" text="线索" /><SelectItem value="agent" text="AI 工作台" />
                  </Select>
                  <Select id="tp-work-page-size" labelText="表格默认每页条数" value={preferences.work.pageSize} onChange={(event) => setPreferences((current) => ({ ...current, work: { ...current.work, pageSize: event.currentTarget.value } }))}>
                    <SelectItem value="10" text="10 条" /><SelectItem value="25" text="25 条" /><SelectItem value="50" text="50 条" /><SelectItem value="100" text="100 条" />
                  </Select>
                  <TextInput id="tp-work-market" labelText="默认目标市场" value={preferences.work.defaultMarket} onChange={(event) => setPreferences((current) => ({ ...current, work: { ...current.work, defaultMarket: event.currentTarget.value } }))} placeholder="例如：美国、德国、日本" />
                </div>
                <p className="tp-personal-settings__hint">这些是账户级默认偏好；只有已接入个人偏好的业务页面才会自动应用。</p>
                <div className="tp-personal-settings__actions"><Button onClick={() => void savePreferences()} disabled={saving}>{saving ? '正在保存…' : '保存工作偏好'}</Button></div>
              </div>
            )}

            {active === 'privacy' && (
              <div className="tp-personal-settings__info">
                <CarbonIcons.Document size={32} />
                <h3>个人数据与账户控制</h3>
                <p>可以导出当前个人资料摘要和偏好设置。此导出不包含业务记录、客户数据或集成密钥。</p>
                <Button kind="secondary" onClick={exportSettings}>导出个人设置 <CarbonIcons.Download size={16} /></Button>
                <div className="tp-personal-settings__privacy-note"><strong>账户注销</strong><p>账户注销涉及业务数据归属与不可逆删除，目前不开放自助操作。请通过管理员支持渠道提出申请。</p></div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

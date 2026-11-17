import { useCallback, useEffect, useState } from 'react';
import {
  Button, InlineLoading, InlineNotification, Tag, TextInput, Toggle,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/security.scss';

type PasskeyRecord = {
  id: string;
  friendly_name?: string | null;
  created_at: string;
  last_used_at?: string | null;
};

type TotpFactor = {
  id: string;
  friendly_name?: string | null;
  status: 'verified' | 'unverified';
  created_at?: string;
};

type Enrollment = {
  id: string;
  qrCode: string;
  secret: string;
};

type RecoveryStatus = { total: number; remaining: number };

function formatDate(value?: string | null) {
  if (!value) return '尚未使用';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function SecuritySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [totpFactors, setTotpFactors] = useState<TotpFactor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>({ total: 0, remaining: 0 });
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const loadSecurity = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const [passkeyResult, factorResult, recoveryResult] = await Promise.all([
        client.auth.passkey.list(),
        client.auth.mfa.listFactors(),
        client.auth.mfa.recoveryCodes.getStatus(),
      ]);
      if (passkeyResult.error) throw passkeyResult.error;
      if (factorResult.error) throw factorResult.error;
      if (recoveryResult.error) throw recoveryResult.error;
      setPasskeys((passkeyResult.data ?? []) as PasskeyRecord[]);
      setTotpFactors((factorResult.data?.totp ?? []) as TotpFactor[]);
      setRecoveryStatus((recoveryResult.data ?? { total: 0, remaining: 0 }) as RecoveryStatus);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取安全设置。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSecurity(); }, [loadSecurity]);

  const addPasskey = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const client = await getSupabaseClient();
      const { data, error: passkeyError } = await client.auth.registerPasskey();
      if (passkeyError) throw passkeyError;
      setNotice('Passkey 已注册。你可以在设备的凭证管理器中查看它。');
      await loadSecurity();
      if (!data?.id) setNotice('Passkey 注册已完成。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Passkey 注册失败。');
    } finally {
      setBusy(false);
    }
  };

  const removePasskey = async (passkeyId: string) => {
    if (!window.confirm('确定删除这个 Passkey 吗？删除后，该凭证将无法再登录 TradePilot。')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const client = await getSupabaseClient();
      const { error: deleteError } = await client.auth.passkey.delete({ passkeyId });
      if (deleteError) throw deleteError;
      setNotice('Passkey 已删除。');
      await loadSecurity();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除 Passkey 失败。');
    } finally {
      setBusy(false);
    }
  };

  const startTotpEnrollment = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const client = await getSupabaseClient();
      const { data, error: enrollError } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'TradePilot 验证器',
      });
      if (enrollError) throw enrollError;
      if (!data?.totp?.qr_code || !data?.totp?.secret) {
        throw new Error('认证服务没有返回有效的 TOTP 配置信息。');
      }
      setEnrollment({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setEnrollmentCode('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法开始验证器绑定。');
    } finally {
      setBusy(false);
    }
  };

  const verifyTotpEnrollment = async () => {
    if (!enrollment || !/^\d{6,8}$/.test(enrollmentCode.trim())) {
      setError('请输入验证器当前显示的 6–8 位验证码。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
        factorId: enrollment.id,
      });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await client.auth.mfa.verify({
        factorId: enrollment.id,
        challengeId: challenge.id,
        code: enrollmentCode.trim(),
      });
      if (verifyError) throw verifyError;
      setEnrollment(null);
      setEnrollmentCode('');
      setNotice('多因子认证已启用。下次使用密码或 Passkey 登录时，需要完成第二步验证。');
      await loadSecurity();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '验证码验证失败。');
    } finally {
      setBusy(false);
    }
  };

  const disableTotp = async () => {
    const factor = totpFactors.find((item) => item.status === 'verified');
    if (!factor) return;
    setBusy(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== 'aal2' && assurance.nextLevel === 'aal2') {
        if (!/^\d{6,8}$/.test(disableCode.trim())) {
          throw new Error('请先输入验证器当前显示的验证码，以确认身份。');
        }
        const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
          factorId: factor.id,
        });
        if (challengeError) throw challengeError;
        const { error: verifyError } = await client.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challenge.id,
          code: disableCode.trim(),
        });
        if (verifyError) throw verifyError;
      }
      const { error: unenrollError } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) throw unenrollError;
      setShowDisable(false);
      setDisableCode('');
      setNotice('多因子认证已关闭。邮箱密码和已注册的 Passkey 仍可用于登录。');
      await loadSecurity();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法关闭多因子认证。');
    } finally {
      setBusy(false);
    }
  };

  const generateRecoveryCodes = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    setRecoveryCodes([]);
    try {
      const client = await getSupabaseClient();
      const hasExistingSet = recoveryStatus.total > 0;
      const result = hasExistingSet
        ? await client.auth.mfa.recoveryCodes.regenerate()
        : await client.auth.mfa.recoveryCodes.generate({ friendlyName: 'TradePilot 备用恢复代码' });
      if (result.error) throw result.error;
      setRecoveryCodes(result.data.codes);
      setNotice('恢复代码只显示这一次，请立即复制并保存在安全位置。');
      const status = await client.auth.mfa.recoveryCodes.getStatus();
      if (!status.error) setRecoveryStatus(status.data as RecoveryStatus);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法生成备用恢复代码。');
    } finally {
      setBusy(false);
    }
  };

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setNotice('恢复代码已复制。请将其保存在密码管理器等安全位置。');
    } catch {
      setError('无法访问剪贴板，请手动复制恢复代码。');
    }
  };

  const verifiedTotp = totpFactors.some((factor) => factor.status === 'verified');

  return (
    <main className="tp-security">
      <header className="tp-security__header">
        <p className="tp-security__eyebrow">TRADEPILOT / ACCOUNT SECURITY</p>
        <h1>安全与身份认证</h1>
        <p>管理 Passkey、生物识别登录方式与多因子认证。生物识别由你的设备或凭证管理器在本地完成，TradePilot 不会接收或保存指纹、人脸数据。</p>
      </header>

      {error && <InlineNotification kind="error" lowContrast title="操作未完成" subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" lowContrast title="安全设置已更新" subtitle={notice} onCloseButtonClick={() => setNotice('')} />}

      {loading ? <InlineLoading description="正在读取安全设置…" /> : (
        <>
          <section className="tp-security__section" aria-labelledby="tp-security-passkeys">
            <div className="tp-security__section-heading">
              <div>
                <h2 id="tp-security-passkeys">Passkey 生物识别登录</h2>
                <p>使用 Windows Hello、Touch ID、手机指纹或跨设备 Passkey 登录。设备可能要求指纹、面部、PIN 或安全密钥。</p>
              </div>
              <Tag type="blue">无密码登录</Tag>
            </div>
            <div className="tp-security__actions">
              <Button onClick={() => void addPasskey()} disabled={busy}>
                添加 Passkey
              </Button>
              <span className="tp-security__muted">建议至少绑定两种可用的 Passkey，避免设备遗失后无法登录。</span>
            </div>
            {passkeys.length === 0 ? (
              <div className="tp-security__empty">
                <h3>尚未绑定 Passkey</h3>
                <p>添加后，可在登录页面使用设备生物识别或设备 PIN 登录 TradePilot。</p>
              </div>
            ) : (
              <ul className="tp-security__credential-list">
                {passkeys.map((passkey) => (
                  <li key={passkey.id} className="tp-security__credential">
                    <div>
                      <strong>{passkey.friendly_name || 'Passkey 凭证'}</strong>
                      <span>注册于 {formatDate(passkey.created_at)}</span>
                      <span>最近使用 {formatDate(passkey.last_used_at)}</span>
                    </div>
                    <Button kind="danger--tertiary" size="sm" disabled={busy} onClick={() => void removePasskey(passkey.id)}>
                      删除
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tp-security__section" aria-labelledby="tp-security-mfa">
            <div className="tp-security__section-heading">
              <div>
                <h2 id="tp-security-mfa">多因子认证（MFA）</h2>
                <p>自主开启后，邮箱密码或 Passkey 登录还需要验证第二因子。目前使用标准 TOTP 验证器完成 Supabase AAL2。</p>
              </div>
              <Tag type={verifiedTotp ? 'green' : 'gray'}>{verifiedTotp ? '已启用' : '未启用'}</Tag>
            </div>
            <div className="tp-security__toggle-row">
              <div>
                <strong>启用多因子认证</strong>
                <span>默认关闭；完成验证器绑定后才会正式启用。</span>
              </div>
              <Toggle
                id="tradepilot-mfa-toggle"
                labelText="多因子认证"
                labelA="关闭"
                labelB="开启"
                toggled={verifiedTotp}
                disabled={busy || totpFactors.some((factor) => factor.status === 'unverified')}
                onToggle={(checked) => {
                  if (checked) void startTotpEnrollment();
                  else setShowDisable(true);
                }}
              />
            </div>

            {enrollment && (
              <div className="tp-security__enrollment">
                <h3>绑定身份验证器</h3>
                <p>使用 Google Authenticator、Microsoft Authenticator、1Password 或其他兼容 TOTP 的应用扫描二维码。</p>
                <img className="tp-security__qr" src={enrollment.qrCode} alt="TOTP 身份验证器绑定二维码" />
                <p className="tp-security__muted">无法扫描？手动输入密钥：</p>
                <code className="tp-security__secret">{enrollment.secret}</code>
                <TextInput
                  id="tradepilot-totp-enrollment-code"
                  labelText="输入验证器生成的验证码"
                  value={enrollmentCode}
                  onChange={(event) => setEnrollmentCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <div className="tp-security__actions">
                  <Button onClick={() => void verifyTotpEnrollment()} disabled={busy || enrollmentCode.length < 6}>验证并启用</Button>
                  <Button kind="ghost" onClick={() => { setEnrollment(null); setEnrollmentCode(''); }}>取消</Button>
                </div>
              </div>
            )}

            {showDisable && verifiedTotp && (
              <div className="tp-security__enrollment">
                <h3>关闭多因子认证</h3>
                <p>为保护账户，关闭前需要确认身份。如果当前会话尚未达到 AAL2，请输入验证器验证码。</p>
                <TextInput
                  id="tradepilot-totp-disable-code"
                  labelText="身份验证器验证码"
                  value={disableCode}
                  onChange={(event) => setDisableCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <div className="tp-security__actions">
                  <Button kind="danger" onClick={() => void disableTotp()} disabled={busy}>确认关闭 MFA</Button>
                  <Button kind="ghost" onClick={() => { setShowDisable(false); setDisableCode(''); }}>取消</Button>
                </div>
              </div>
            )}
            {verifiedTotp && (
              <div className="tp-security__factor">
                <strong>{totpFactors.find((factor) => factor.status === 'verified')?.friendly_name || '身份验证器'}</strong>
                <Tag type="green">已验证</Tag>
              </div>
            )}
            {verifiedTotp && (
              <div className="tp-security__recovery">
                <div>
                  <h3>备用恢复代码</h3>
                  <p>已生成 {recoveryStatus.total} 个恢复代码，剩余 {recoveryStatus.remaining} 个可用。每个代码只能使用一次。</p>
                </div>
                <Button kind="tertiary" size="sm" disabled={busy} onClick={() => void generateRecoveryCodes()}>
                  {recoveryStatus.total > 0 ? '重新生成恢复代码' : '生成恢复代码'}
                </Button>
                {recoveryCodes.length > 0 && (
                  <div className="tp-security__recovery-codes">
                    <p>请立即保存。离开此页面后将无法再次查看：</p>
                    <code>{recoveryCodes.join('\n')}</code>
                    <Button kind="secondary" size="sm" onClick={() => void copyRecoveryCodes()}>复制恢复代码</Button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="tp-security__section tp-security__note">
            <h2>设备与恢复建议</h2>
            <ul>
              <li>Passkey 可以保存在电脑、手机或密码管理器中；跨设备扫码登录取决于浏览器和平台支持。</li>
              <li>建议保留至少一个备用 Passkey，并确保身份验证器可以在备用设备上恢复。</li>
              <li>删除 Passkey 前，请确认还有其他可用的登录方式。</li>
              <li>Passkey 当前用于无密码登录；Supabase 原生 MFA 的第二因子使用 TOTP。不会将同一次 Passkey 验证错误标记为独立 AAL2 因子。</li>
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

import { PageSkeleton } from '@/design-system';
import { PageSkeleton } from '@/design-system';
import { useCallback, useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
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
type WebAuthnStatus = { enabled: boolean; granted: boolean; credentials: Array<{ id: string; name: string }> };
type WebAuthnAction = 'register' | 'enable' | 'disable' | 'revoke';

function getPasskeyErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Passkey 注册失败，请检查浏览器支持后重试。';
  const detail = error as Error & { originalError?: unknown; cause?: unknown; code?: string };
  const nested = detail.originalError ?? detail.cause;
  if (nested instanceof Error && nested.message && nested.message !== error.message) {
    return `${error.message}（底层原因：${nested.name}: ${nested.message}）`;
  }
  if (nested && typeof nested === 'object' && 'message' in nested) {
    const message = String((nested as { message?: unknown }).message ?? '');
    if (message && message !== error.message) return `${error.message}（底层原因：${message}）`;
  }
  return error.message;
}

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
  const [webAuthnStatus, setWebAuthnStatus] = useState<WebAuthnStatus>({ enabled: false, granted: false, credentials: [] });
  const [webAuthnAvailable, setWebAuthnAvailable] = useState(false);
  const [webAuthnStepUp, setWebAuthnStepUp] = useState<{ factorId: string; challengeId: string; action: WebAuthnAction; credentialId?: string } | null>(null);
  const [webAuthnStepUpCode, setWebAuthnStepUpCode] = useState('');
  const [pendingWebAuthnRevokeId, setPendingWebAuthnRevokeId] = useState<string | null>(null);

  const callWebAuthn = async <T,>(client: Awaited<ReturnType<typeof getSupabaseClient>>, path: string, body: Record<string, unknown> = {}): Promise<T> => {
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session?.access_token) throw new Error('登录会话已失效，请重新登录。');
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as { data?: T; error?: { message?: string } };
    if (!response.ok || payload.error || payload.data === undefined) throw new Error(payload.error?.message || 'WebAuthn 服务暂时不可用。');
    return payload.data;
  };

  const performWebAuthnAction = async (action: WebAuthnAction, client: Awaited<ReturnType<typeof getSupabaseClient>>, credentialId?: string) => {
    if (action === 'register') {
      const challenge = await callWebAuthn<{ challengeId: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>(client, '/api/v1/webauthn/registration/options');
      const credential = await startRegistration({ optionsJSON: challenge.options });
      await callWebAuthn(client, '/api/v1/webauthn/registration/verify', {
        challengeId: challenge.challengeId, response: credential, friendlyName: 'TradePilot 生物识别设备',
      });
      setNotice('生物识别凭证注册成功。请至少注册两个独立凭证（建议分布在两台设备上），再开启生物识别 MFA，避免单设备丢失导致无法登录。');
    } else if (action === 'revoke') {
      if (!credentialId) throw new Error('缺少要撤销的生物识别凭证。');
      const result = await callWebAuthn<{ revoked: boolean }>(client, '/api/v1/webauthn/credential/revoke', { credentialId });
      if (!result.revoked) throw new Error('凭证可能已撤销或不存在。');
      setPendingWebAuthnRevokeId(null);
      setNotice('生物识别凭证已撤销。');
    } else {
      await callWebAuthn(client, '/api/v1/webauthn/enable', { enabled: action === 'enable' });
      setNotice(action === 'enable' ? '生物识别 MFA 已启用。下次登录需要完成设备验证。' : '生物识别 MFA 已关闭。');
    }
    const status = await callWebAuthn<WebAuthnStatus>(client, '/api/v1/webauthn/status');
    setWebAuthnStatus(status);
    setWebAuthnAvailable(true);
    if (action === 'revoke' && status.enabled && !status.granted) {
      setNotice('凭证已撤销；当前会话授权也已失效。请重新登录，并使用另一台已注册设备完成验证。');
    }
  };

  const beginWebAuthnAction = async (action: WebAuthnAction, credentialId?: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const client = await getSupabaseClient();
      const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== 'aal2') {
        const currentStatus = await callWebAuthn<WebAuthnStatus>(client, '/api/v1/webauthn/status');
        if (currentStatus.granted) {
          await performWebAuthnAction(action, client, credentialId);
          return;
        }
        const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const factor = factors.totp.find((item) => item.status === 'verified');
        if (!factor) throw new Error('此操作需要先配置并验证 TOTP 身份验证器。');
        const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId: factor.id });
        if (challengeError) throw challengeError;
        setWebAuthnStepUp({ factorId: factor.id, challengeId: challenge.id, action, credentialId });
        setWebAuthnStepUpCode('');
        setNotice('请先输入身份验证器验证码，完成安全设置的二次确认。若当前登录会话已完成生物识别验证，则无需再次输入。');
        return;
      }
      await performWebAuthnAction(action, client, credentialId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法完成生物识别安全设置。');
    } finally { setBusy(false); }
  };

  const verifyWebAuthnStepUp = async () => {
    if (!webAuthnStepUp || !/^\d{6,8}$/.test(webAuthnStepUpCode.trim())) { setError('请输入 6–8 位身份验证器验证码。'); return; }
    setBusy(true); setError('');
    try {
      const client = await getSupabaseClient();
      const { error: verifyError } = await client.auth.mfa.verify({
        factorId: webAuthnStepUp.factorId, challengeId: webAuthnStepUp.challengeId, code: webAuthnStepUpCode.trim(),
      });
      if (verifyError) throw verifyError;
      const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== 'aal2') throw new Error('身份验证未能提升到 AAL2。');
      const action = webAuthnStepUp.action;
      setWebAuthnStepUp(null); setWebAuthnStepUpCode('');
      await performWebAuthnAction(action, client, webAuthnStepUp.credentialId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '二次验证失败。'); }
    finally { setBusy(false); }
  };
  const loadSecurity = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const [passkeyResult, factorResult] = await Promise.all([
        client.auth.passkey.list(),
        client.auth.mfa.listFactors(),
      ]);
      if (passkeyResult.error) throw passkeyResult.error;
      if (factorResult.error) throw factorResult.error;
      setPasskeys((passkeyResult.data ?? []) as PasskeyRecord[]);
      setTotpFactors((factorResult.data?.totp ?? []) as TotpFactor[]);

      // No recovery-code enrollment is a normal first-use state, not a page-load failure.
      const recoveryResult = await client.auth.mfa.recoveryCodes.getStatus();
      if (recoveryResult.error) {
        if (/has not enrolled recovery codes/i.test(recoveryResult.error.message ?? '')) {
          setRecoveryStatus({ total: 0, remaining: 0 });
        } else {
          throw recoveryResult.error;
        }
      } else {
        setRecoveryStatus((recoveryResult.data ?? { total: 0, remaining: 0 }) as RecoveryStatus);
      }
      try {
        const status = await callWebAuthn<WebAuthnStatus>(client, '/api/v1/webauthn/status');
        setWebAuthnStatus(status); setWebAuthnAvailable(true);
      } catch { setWebAuthnAvailable(false); }
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
      if (!window.isSecureContext) {
        throw new Error('Passkey 只能在 HTTPS 安全网页中注册。请使用 https://tradepilot.xg-y.workers.dev 打开 TradePilot。');
      }
      if (!('PublicKeyCredential' in window) || !navigator.credentials?.create) {
        throw new Error('当前浏览器或应用内嵌网页不支持 Passkey。请复制 TradePilot 地址，改用最新版 Google Chrome 浏览器打开后重试。');
      }
      const client = await getSupabaseClient();
      const { data, error: passkeyError } = await client.auth.registerPasskey();
      if (passkeyError) throw passkeyError;
      setNotice('Passkey 已注册。你可以在设备的凭证管理器中查看它。');
      await loadSecurity();
      if (!data?.id) setNotice('Passkey 注册已完成。');
    } catch (cause) {
      setError(getPasskeyErrorMessage(cause));
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
      const { error: refreshError } = await client.auth.refreshSession();
      if (refreshError) throw refreshError;
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

  if (loading) return <PageSkeleton variant="table" />;
  if (loading) return <PageSkeleton variant="table" />;
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

          <section className="tp-security__section" aria-labelledby="tp-security-webauthn">
            <div className="tp-security__section-heading">
              <div>
                <h2 id="tp-security-webauthn">独立 WebAuthn 生物识别第二因子</h2>
                <p>密码登录后，使用已注册设备进行独立的指纹、面部或设备 PIN 验证。凭证私钥保留在设备中，服务端只保存公钥。</p>
              </div>
              <Tag type={webAuthnStatus.enabled ? "green" : "gray"}>{webAuthnStatus.enabled ? "已启用" : "未启用"}</Tag>
            </div>
            {!webAuthnAvailable ? (
              <InlineNotification kind="warning" lowContrast title="生物识别服务尚未就绪" subtitle="服务端数据库迁移和 API 尚未完成部署，当前不能注册或启用独立 WebAuthn 第二因子。" />
            ) : (
              <>
                <div className="tp-security__toggle-row">
                  <div><strong>启用生物识别 MFA</strong><span>启用后，每次新登录都必须通过当前会话的设备验证。</span></div>
                  <Toggle id="tradepilot-webauthn-toggle" labelText="生物识别 MFA" labelA="关闭" labelB="开启" toggled={webAuthnStatus.enabled} disabled={busy || (!webAuthnStatus.enabled && webAuthnStatus.credentials.length < 2)} onToggle={(checked) => void beginWebAuthnAction(checked ? "enable" : "disable")} />
                </div>
                <div className="tp-security__actions">
                  <Button kind="tertiary" disabled={busy} onClick={() => void beginWebAuthnAction("register")}>注册生物识别设备</Button>
                </div>
                {webAuthnStatus.credentials.length > 0 ? (
                  <ul className="tp-security__passkey-list">{webAuthnStatus.credentials.map((credential) => <li key={credential.id}><div><strong>{credential.name}</strong><span>WebAuthn 生物识别凭证</span></div><div className="tp-security__actions"><Tag type="green">已注册</Tag>{pendingWebAuthnRevokeId === credential.id ? <><Button kind="danger--tertiary" size="sm" disabled={busy} onClick={() => void beginWebAuthnAction("revoke", credential.id)}>确认撤销</Button><Button kind="ghost" size="sm" onClick={() => setPendingWebAuthnRevokeId(null)}>取消</Button></> : <Button kind="danger--tertiary" size="sm" disabled={busy} onClick={() => setPendingWebAuthnRevokeId(credential.id)}>撤销</Button>}</div></li>)}</ul>
                ) : <p className="tp-security__muted">尚未注册 WebAuthn 生物识别设备。启用 MFA 前必须注册至少两个凭证（建议一台主设备、一台备用设备）。</p>}
                {webAuthnStatus.credentials.length === 1 && <InlineNotification kind="warning" lowContrast title="还需要一台备用设备" subtitle="请再注册一个凭证（建议使用另一台设备）后，才能启用生物识别 MFA。" />}
                {webAuthnStepUp && (
                  <div className="tp-security__enrollment">
                    <h3>确认身份</h3><p>此安全操作需要 TOTP 二次验证。</p>
                    <TextInput id="tradepilot-webauthn-stepup" labelText="身份验证器验证码" value={webAuthnStepUpCode} onChange={(event) => setWebAuthnStepUpCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" />
                    <div className="tp-security__actions"><Button onClick={() => void verifyWebAuthnStepUp()} disabled={busy || webAuthnStepUpCode.length < 6}>验证并继续</Button><Button kind="ghost" onClick={() => setWebAuthnStepUp(null)}>取消</Button></div>
                  </div>
                )}
              </>
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
                    <Button kind="tertiary" size="sm" onClick={() => void copyRecoveryCodes()}>复制恢复代码</Button>
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
              <li>Passkey 当前用于无密码登录；Supabase 托管版 Auth 的原生 MFA 第二因子使用 TOTP。Passkey 登录会话仍是 AAL1，不会因为设备使用了 Face ID 或指纹就自动升级为 AAL2。</li>
              <li>独立 WebAuthn 第二因子由 TradePilot Worker 验证，并按 Supabase 登录会话授予限时访问权限；Passkey 无密码登录与密码后的第二因子是两条独立流程。</li>
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

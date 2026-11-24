import { useEffect, useState, type FormEvent } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button, InlineLoading, InlineNotification, TextInput, semanticIcons,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/login.scss';

type LoginStep = 'credentials' | 'mfa' | 'webauthn';

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [clientReady, setClientReady] = useState(false);
  const [client, setClient] = useState<Awaited<ReturnType<typeof getSupabaseClient>> | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [totpFallbackActive, setTotpFallbackActive] = useState(false);
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [step, setStep] = useState<LoginStep>('credentials');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;

  const requestWebAuthn = async <T,>(supabase: NonNullable<typeof client>, path: string, body: Record<string, unknown> = {}): Promise<T> => {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session?.access_token) throw new Error('登录会话已失效，请重新登录。');
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as { data?: T; error?: { message?: string } };
    if (!response.ok || payload.error || payload.data === undefined) {
      throw new Error(payload.error?.message || '生物识别验证服务暂时不可用。');
    }
    return payload.data;
  };

  const verifyWebAuthnIfRequired = async (supabase: NonNullable<typeof client>, status?: { enabled: boolean; granted: boolean }) => {
    const biometricStatus = status ?? await requestWebAuthn<{ enabled: boolean; granted: boolean }>(supabase, '/api/v1/webauthn/status');
    if (!biometricStatus.enabled || biometricStatus.granted) {
      navigate(destination, { replace: true });
      return;
    }
    setStep('webauthn');
    if (!window.PublicKeyCredential || !navigator.credentials) {
      throw new Error('当前浏览器不支持 WebAuthn 生物识别验证；你仍可使用 TOTP 备用验证。');
    }
    const challenge = await requestWebAuthn<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>(
      supabase, '/api/v1/webauthn/authentication/options',
    );
    const assertion = await startAuthentication({ optionsJSON: challenge.options });
    await requestWebAuthn<{ verified: boolean }>(supabase, '/api/v1/webauthn/authentication/verify', {
      challengeId: challenge.challengeId,
      credentialId: assertion.id,
      response: assertion,
    });
    navigate(destination, { replace: true });
  };
  const destination = from?.pathname
    ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
    : '/prospect-discovery';

  const beginSecondFactorIfRequired = async (supabase: NonNullable<typeof client>) => {
    const biometricStatus = await requestWebAuthn<{ enabled: boolean; granted: boolean }>(supabase, '/api/v1/webauthn/status');
    if (biometricStatus.enabled) {
      await verifyWebAuthnIfRequired(supabase, biometricStatus);
      return;
    }

    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;

    if (assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal2') {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const factor = factors.totp.find((item) => item.status === 'verified');
      if (!factor) throw new Error('账户已要求二次验证，但没有找到已验证的身份验证器。请联系管理员恢复账户。');
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });
      if (challengeError) throw challengeError;
      setFactorId(factor.id);
      setChallengeId(challenge.id);
      setStep('mfa');
      return;
    }

    navigate(destination, { replace: true });
  };

  useEffect(() => {
    let alive = true;
    getSupabaseClient()
      .then(async (supabase) => {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!alive) return;
        setClient(supabase);
        setClientReady(true);
        if (data.session) await beginSecondFactorIfRequired(supabase);
      })
      .catch((cause) => {
        if (alive) {
          setError(cause instanceof Error ? cause.message : '无法连接登录服务');
          setClientReady(true);
        }
      });
    return () => { alive = false; };
  }, [destination, navigate]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client) return;
    setBusy(true);
    setError('');
    try {
      const { error: authError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      await beginSecondFactorIfRequired(client);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败，请检查邮箱和密码');
    } finally {
      setBusy(false);
    }
  };

  const signInWithPasskey = async () => {
    if (!client) return;
    setBusy(true);
    setError('');
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) {
        throw new Error('当前浏览器不支持 Passkey。请使用最新版 Chrome、Edge、Safari 或 Firefox，或改用邮箱密码登录。');
      }
      const { error: passkeyError } = await client.auth.signInWithPasskey();
      if (passkeyError) throw passkeyError;
      await beginSecondFactorIfRequired(client);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Passkey 登录失败。');
    } finally {
      setBusy(false);
    }
  };

  const startTotpFallback = async () => {
    if (!client) return;
    setBusy(true);
    setError('');
    try {
      const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const factor = factors.totp.find((item) => item.status === 'verified');
      if (!factor) throw new Error('当前账户没有已验证的 TOTP 备用因子，请使用另一台已注册的 WebAuthn 设备。');
      const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) throw challengeError;
      setFactorId(factor.id);
      setChallengeId(challenge.id);
      setVerificationCode('');
      setUseRecoveryCode(false);
      setTotpFallbackActive(true);
      setStep('mfa');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法启动 TOTP 备用验证。');
    } finally {
      setBusy(false);
    }
  };
  const verifySecondFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || !factorId || !challengeId) return;
    if (!useRecoveryCode && !/^\d{6,8}$/.test(verificationCode.trim())) {
      setError('请输入身份验证器当前显示的 6–8 位验证码。');
      return;
    }
    if (useRecoveryCode && !/^[A-Z0-9-]{12,32}$/i.test(verificationCode.trim())) {
      setError('请输入有效的备用恢复代码。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const verification = useRecoveryCode
        ? await client.auth.mfa.recoveryCodes.verify({ code: verificationCode.trim() })
        : await client.auth.mfa.verify({
            factorId,
            challengeId,
            code: verificationCode.trim(),
          });
      if (verification.error) throw verification.error;
      const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== 'aal2') throw new Error('第二因子验证未能提升当前会话安全等级。');
      if (totpFallbackActive) {
        setTotpFallbackActive(false);
        navigate(destination, { replace: true });
      } else {
        await verifyWebAuthnIfRequired(client);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '二次验证失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="tp-login">
      <section className="tp-login__surface" aria-labelledby="tp-login-title">
        <p className="tp-login__eyebrow">HARMONIA / SECURE ACCESS</p>
        <h1 id="tp-login-title">{step === 'mfa' ? '验证身份' : step === 'webauthn' ? '生物识别验证' : '登录 Harmonia'}</h1>
        <p className="tp-login__description">
          {step === 'mfa'
            ? '请输入身份验证器生成的一次性验证码。'
            : step === 'webauthn'
              ? '请使用已注册设备完成指纹、面部或设备 PIN 验证，也可以选择 TOTP 备用验证。'
              : '使用邮箱密码或已注册的 Passkey 安全登录工作区。'}
        </p>
        {!clientReady && <InlineLoading description="正在连接登录服务…" />}
        {error && <InlineNotification kind="error" title="无法完成登录" subtitle={error} onCloseButtonClick={() => setError('')} />}

        {step === 'credentials' ? (
          <>
            <Button kind="tertiary" className="tp-login__passkey" onClick={() => void signInWithPasskey()} disabled={!client || busy}>
              使用 Passkey 登录（指纹 / 面部 / PIN）
            </Button>
            <div className="tp-login__divider"><span>或使用邮箱密码</span></div>
            <form className="tp-login__form" onSubmit={signIn}>
              <TextInput
                id="tradepilot-login-email"
                labelText="邮箱"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                required
              />
              <TextInput
                id="tradepilot-login-password"
                labelText="密码"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
              />
              <Button kind="primary" type="submit" renderIcon={semanticIcons.next} disabled={!client || busy}>
                {busy ? '正在验证…' : '登录'}
              </Button>
            </form>
          </>
        ) : step === 'mfa' ? (
          <form className="tp-login__form" onSubmit={verifySecondFactor}>
            <TextInput
              id="tradepilot-login-totp"
              labelText={useRecoveryCode ? '备用恢复代码' : '身份验证器验证码'}
              value={verificationCode}
              onChange={(event) => setVerificationCode(useRecoveryCode
                ? event.currentTarget.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32)
                : event.currentTarget.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
            <Button kind="primary" type="submit" renderIcon={semanticIcons.security} disabled={!client || busy || verificationCode.length < (useRecoveryCode ? 12 : 6)}>
              {busy ? '正在验证…' : '验证并进入系统'}
            </Button>
            <Button kind="ghost" onClick={() => {
              setUseRecoveryCode((current) => !current);
              setVerificationCode('');
              setError('');
            }}>
              {useRecoveryCode ? '改用身份验证器' : '使用备用恢复代码'}
            </Button>
            <Button kind="ghost" onClick={async () => {
              await client?.auth.signOut();
              setStep('credentials');
              setVerificationCode('');
              setFactorId('');
              setChallengeId('');
            }}>
              返回登录
            </Button>
          </form>
        ) : (
          <div className="tp-login__form">
            <InlineLoading description="正在等待设备完成 WebAuthn 生物识别验证…" />
            <Button kind="tertiary" disabled={busy} onClick={() => void startTotpFallback()}>使用 TOTP 备用验证</Button>
            <Button kind="ghost" onClick={async () => {
              await client?.auth.signOut();
              setTotpFallbackActive(false);
              setStep('credentials');
              setVerificationCode('');
            }}>取消并返回登录</Button>
          </div>
        )}
        <p className="tp-login__footnote">此工作区使用管理员创建的账户，不提供公开注册。Passkey 使用设备本地验证，不会向 Harmonia 发送生物特征数据。</p>
      </section>
    </main>
  );
}

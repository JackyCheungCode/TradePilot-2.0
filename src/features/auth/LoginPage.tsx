import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button, InlineLoading, InlineNotification, TextInput,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/login.scss';

type LoginStep = 'credentials' | 'mfa';

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [clientReady, setClientReady] = useState(false);
  const [client, setClient] = useState<Awaited<ReturnType<typeof getSupabaseClient>> | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [step, setStep] = useState<LoginStep>('credentials');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  const destination = from?.pathname
    ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
    : '/prospect-discovery';

  const beginSecondFactorIfRequired = async (supabase: NonNullable<typeof client>) => {
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

  const verifySecondFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || !factorId || !challengeId) return;
    if (!/^\d{6,8}$/.test(verificationCode.trim())) {
      setError('请输入身份验证器当前显示的 6–8 位验证码。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: verifyError } = await client.auth.mfa.verify({
        factorId,
        challengeId,
        code: verificationCode.trim(),
      });
      if (verifyError) throw verifyError;
      const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== 'aal2') throw new Error('第二因子验证未能提升当前会话安全等级。');
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '二次验证失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="tp-login">
      <section className="tp-login__surface" aria-labelledby="tp-login-title">
        <p className="tp-login__eyebrow">TRADEPILOT / SECURE ACCESS</p>
        <h1 id="tp-login-title">{step === 'mfa' ? '验证身份' : '登录 TradePilot'}</h1>
        <p className="tp-login__description">
          {step === 'mfa'
            ? '账户已启用多因子认证。请输入身份验证器生成的一次性验证码。'
            : '使用邮箱密码或已注册的 Passkey 安全登录工作区。'}
        </p>
        {!clientReady && <InlineLoading description="正在连接登录服务…" />}
        {error && <InlineNotification kind="error" title="无法完成登录" subtitle={error} onCloseButtonClick={() => setError('')} />}

        {step === 'credentials' ? (
          <>
            <Button kind="secondary" className="tp-login__passkey" onClick={() => void signInWithPasskey()} disabled={!client || busy}>
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
              <Button type="submit" disabled={!client || busy}>
                {busy ? '正在验证…' : '登录'}
              </Button>
            </form>
          </>
        ) : (
          <form className="tp-login__form" onSubmit={verifySecondFactor}>
            <TextInput
              id="tradepilot-login-totp"
              labelText="身份验证器验证码"
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
            <Button type="submit" disabled={!client || busy || verificationCode.length < 6}>
              {busy ? '正在验证…' : '验证并进入系统'}
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
        )}
        <p className="tp-login__footnote">此工作区使用管理员创建的账户，不提供公开注册。Passkey 使用设备本地验证，不会向 TradePilot 发送生物特征数据。</p>
      </section>
    </main>
  );
}

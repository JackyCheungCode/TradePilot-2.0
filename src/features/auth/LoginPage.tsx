import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button, InlineLoading, InlineNotification, TextInput,
} from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';
import '@/design-system/patterns/login.scss';

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [clientReady, setClientReady] = useState(false);
  const [client, setClient] = useState<Awaited<ReturnType<typeof getSupabaseClient>> | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  const destination = from?.pathname
    ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
    : '/prospect-discovery';

  useEffect(() => {
    let alive = true;
    getSupabaseClient()
      .then(async (supabase) => {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!alive) return;
        setClient(supabase);
        setClientReady(true);
        if (data.session) navigate(destination, { replace: true });
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
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败，请检查邮箱和密码');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="tp-login">
      <section className="tp-login__surface" aria-labelledby="tp-login-title">
        <p className="tp-login__eyebrow">TRADEPILOT / SECURE ACCESS</p>
        <h1 id="tp-login-title">登录 TradePilot</h1>
        <p className="tp-login__description">使用已创建的 TradePilot 账户登录工作区。</p>
        {!clientReady && <InlineLoading description="正在连接登录服务…" />}
        {error && <InlineNotification kind="error" title="无法登录" subtitle={error} onCloseButtonClick={() => setError('')} />}
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
            {busy ? '正在登录…' : '登录'}
          </Button>
        </form>
        <p className="tp-login__footnote">此工作区使用管理员创建的账户，不提供公开注册。</p>
      </section>
    </main>
  );
}

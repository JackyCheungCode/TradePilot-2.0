import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { InlineLoading } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

/** Protect every business route while leaving /login public. */
export function RequireAuth() {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;

    getSupabaseClient()
      .then(async (client) => {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (!alive) return;
        setSession(data.session);
        setReady(true);

        const listener = client.auth.onAuthStateChange((_event, nextSession) => {
          if (alive) {
            setSession(nextSession);
            setReady(true);
          }
        });
        unsubscribe = () => listener.data.subscription.unsubscribe();
      })
      .catch(() => {
        if (alive) {
          setSession(null);
          setReady(true);
        }
      });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  if (!ready) {
    return <main className="tp-discovery tp-login__loading"><InlineLoading description="正在验证登录状态…" /></main>;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

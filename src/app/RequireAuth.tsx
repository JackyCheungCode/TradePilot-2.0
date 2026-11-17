import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { InlineLoading } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

/** Protect business routes and keep enrolled MFA factors mandatory at the UI boundary. */
export function RequireAuth() {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;

    const resolveSession = async (nextSession: Session | null) => {
      if (!alive) return;
      if (!nextSession) {
        setSession(null);
        setMfaRequired(false);
        setReady(true);
        return;
      }
      try {
        const client = await getSupabaseClient();
        const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) throw error;
        if (!alive) return;
        const needsSecondFactor = data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
        setMfaRequired(needsSecondFactor);
        setSession(needsSecondFactor ? null : nextSession);
        setReady(true);
      } catch {
        if (!alive) return;
        // Fail closed when assurance cannot be evaluated for an authenticated session.
        setMfaRequired(true);
        setSession(null);
        setReady(true);
      }
    };

    getSupabaseClient()
      .then(async (client) => {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        await resolveSession(data.session);
        const listener = client.auth.onAuthStateChange((_event, nextSession) => {
          void resolveSession(nextSession);
        });
        unsubscribe = () => listener.data.subscription.unsubscribe();
      })
      .catch(() => {
        if (alive) {
          setSession(null);
          setMfaRequired(false);
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
    return <Navigate to="/login" replace state={{ from: location, mfaRequired }} />;
  }

  return <Outlet />;
}

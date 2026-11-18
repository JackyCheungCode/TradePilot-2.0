import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { AppShellLoadingSkeleton } from '@/design-system/layout/AppShell/AppShellLoadingSkeleton';
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
        const biometricResponse = await fetch('/api/v1/webauthn/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${nextSession.access_token}`,
          },
          body: '{}',
        });
        if (!biometricResponse.ok) throw new Error('无法确认生物识别 MFA 状态。');
        const biometricPayload = await biometricResponse.json() as {
          data?: { enabled?: boolean; granted?: boolean };
        };
        if (!biometricPayload.data) throw new Error('生物识别 MFA 状态响应无效。');
        if (biometricPayload.data.enabled === true) {
          if (biometricPayload.data.granted === true) {
            setMfaRequired(false);
            setSession(nextSession);
            setReady(true);
            return;
          }
          const client = await getSupabaseClient();
          const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
          if (assuranceError) throw assuranceError;
          const biometricRequired = assurance.currentLevel !== 'aal2';
          setMfaRequired(biometricRequired);
          setSession(biometricRequired ? null : nextSession);
          setReady(true);
          return;
        }
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
    return <AppShellLoadingSkeleton />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location, mfaRequired }} />;
  }

  return <Outlet />;
}

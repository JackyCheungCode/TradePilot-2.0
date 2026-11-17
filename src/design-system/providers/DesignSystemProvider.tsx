import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';

export type ThemePreference = 'system' | 'white' | 'dark';
export type DesignSystemTheme = 'white' | 'g100';

interface DesignSystemThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: DesignSystemTheme;
  setPreference: (preference: ThemePreference) => void;
}

const DesignSystemThemeContext = createContext<DesignSystemThemeContextValue>({
  preference: 'system',
  resolvedTheme: 'white',
  setPreference: () => undefined,
});

interface DesignSystemProviderProps {
  children: ReactNode;
}

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'white' || value === 'dark';

const cacheKey = (userId: string) => 'tradepilot:theme-preference:' + userId;

function readCachedPreference(userId: string): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(cacheKey(userId));
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}

function cachePreference(userId: string, preference: ThemePreference) {
  try {
    window.localStorage.setItem(cacheKey(userId), preference);
  } catch {
    // The account API remains the source of truth when browser storage is unavailable.
  }
}

/**
 * Account-scoped Carbon theme boundary.
 * The account preference is synchronized through the authenticated Worker API;
 * local storage is only a per-account cache for a fast initial render.
 */
export function DesignSystemProvider({ children }: DesignSystemProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [session, setSession] = useState<Session | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    let alive = true;
    let activeUserId: string | null = null;
    let subscription: { unsubscribe: () => void } | undefined;

    const resolveSession = async (nextSession: Session | null) => {
      if (!alive) return;
      setSession(nextSession);
      const nextUserId = nextSession?.user.id ?? null;
      activeUserId = nextUserId;
      setUserId(nextUserId);
      if (!nextUserId || !nextSession) {
        setPreferenceState('system');
        return;
      }

      const cached = readCachedPreference(nextUserId);
      if (cached) setPreferenceState(cached);

      try {
        const response = await fetch('/api/v1/settings/theme-preference', {
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + nextSession.access_token },
        });
        if (!response.ok) return;
        const payload = await response.json() as { data?: { preference?: unknown } };
        const remote = payload.data?.preference;
        if (alive && activeUserId === nextUserId && isThemePreference(remote)) {
          setPreferenceState(remote);
          cachePreference(nextUserId, remote);
        }
      } catch {
        // Keep the account-specific cache and retry on the next authenticated session.
      }
    };

    void getSupabaseClient().then(async (client) => {
      const { data } = await client.auth.getSession();
      if (!alive) return;
      await resolveSession(data.session);
      const listener = client.auth.onAuthStateChange((_event, nextSession) => {
        void resolveSession(nextSession);
      });
      subscription = listener.data.subscription;
    }).catch(() => {
      if (alive) {
        setSession(null);
        setUserId(null);
        setPreferenceState('system');
      }
    });

    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    if (!isThemePreference(next)) return;
    setPreferenceState(next);
    if (!userId || !session) return;
    cachePreference(userId, next);
    void fetch('/api/v1/settings/theme-preference', {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ preference: next }),
    }).catch(() => {
      // Keep the local choice; the next authenticated load will reconcile with the server.
    });
  }, [session, userId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-carbon-theme', resolvedTheme);
    const metaThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (metaThemeColor) {
      const background = getComputedStyle(document.documentElement).getPropertyValue('--cds-background').trim();
      if (background) metaThemeColor.content = background;
    }
  }, [resolvedTheme]);

  const resolvedTheme: DesignSystemTheme = preference === 'dark'
    ? 'g100'
    : preference === 'white'
      ? 'white'
      : systemDark ? 'g100' : 'white';

  const value = useMemo(() => ({ preference, resolvedTheme, setPreference }), [preference, resolvedTheme, setPreference]);

  return (
    <DesignSystemThemeContext.Provider value={value}>
      <div className="tp-design-system" data-carbon-theme={resolvedTheme}>
        {children}
      </div>
    </DesignSystemThemeContext.Provider>
  );
}

export function useDesignSystemTheme(): DesignSystemTheme {
  return useContext(DesignSystemThemeContext).resolvedTheme;
}

export function useThemePreference() {
  return useContext(DesignSystemThemeContext);
}

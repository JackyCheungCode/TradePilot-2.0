import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';

export type ThemePreference = 'system' | 'white' | 'g10' | 'g90' | 'dark';
export type DesignSystemTheme = 'white' | 'g10' | 'g90' | 'g100';

interface DesignSystemThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: DesignSystemTheme;
  setPreference: (preference: ThemePreference) => void;
}

const DesignSystemThemeContext = createContext<DesignSystemThemeContextValue>({
  preference: 'white',
  resolvedTheme: 'white',
  setPreference: () => undefined,
});

interface DesignSystemProviderProps {
  children: ReactNode;
}

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'white' || value === 'g10' || value === 'g90' || value === 'dark';

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
  const [preference, setPreferenceState] = useState<ThemePreference>('white');
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [session, setSession] = useState<Session | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const preferenceChangeVersion = useRef(0);

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
      if (activeUserId !== nextUserId) setPreferenceState('white');
      activeUserId = nextUserId;
      setUserId(nextUserId);
      if (!nextUserId || !nextSession) {
        setPreferenceState('white');
        return;
      }

      const cached = readCachedPreference(nextUserId);
      if (cached) setPreferenceState(cached);
      const requestVersion = preferenceChangeVersion.current;

      try {
        const response = await fetch('/api/v1/settings/theme-preference', {
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + nextSession.access_token },
        });
        if (!response.ok) return;
        const payload = await response.json() as { data?: { preference?: unknown } };
        const remote = payload.data?.preference;
        if (alive && activeUserId === nextUserId && preferenceChangeVersion.current === requestVersion && isThemePreference(remote)) {
          setPreferenceState(remote);
          cachePreference(nextUserId, remote);
        }
      } catch {
        // Keep the account-specific cache and retry on the next authenticated session.
      }
    };

    void getSupabaseClient().then(async (client) => {
      if (!alive) return;
      const listener = client.auth.onAuthStateChange((_event, nextSession) => {
        void resolveSession(nextSession);
      });
      subscription = listener.data.subscription;
      const { data } = await client.auth.getSession();
      if (!alive) return;
      await resolveSession(data.session);
    }).catch(() => {
      if (alive) {
        setSession(null);
        setUserId(null);
        setPreferenceState('white');
      }
    });

    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    if (!isThemePreference(next)) return;
    preferenceChangeVersion.current += 1;
    setPreferenceState(next);
    void (async () => {
      let activeSession = session;
      let activeUserId = userId;
      if (!activeSession || !activeUserId) {
        const client = await getSupabaseClient();
        const { data } = await client.auth.getSession();
        activeSession = data.session;
        activeUserId = activeSession?.user.id ?? null;
        if (activeSession && activeUserId) {
          setSession(activeSession);
          setUserId(activeUserId);
        }
      }
      if (!activeUserId || !activeSession) return;
      cachePreference(activeUserId, next);
      const response = await fetch('/api/v1/settings/theme-preference', {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + activeSession.access_token,
        },
        body: JSON.stringify({ preference: next }),
      });
      if (!response.ok) throw new Error('账户主题偏好同步失败。');
    })().catch(() => {
      // Keep the immediate local choice; the next authenticated load can reconcile it.
    });
  }, [session, userId]);

  const resolvedTheme: DesignSystemTheme = preference === 'dark'
    ? 'g100'
    : preference === 'g90'
      ? 'g90'
      : preference === 'g10'
        ? 'g10'
        : preference === 'white'
          ? 'white'
          : systemDark ? 'g100' : 'white';

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-carbon-theme', resolvedTheme);
    const metaThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (metaThemeColor) {
      const background = getComputedStyle(document.documentElement).getPropertyValue('--cds-background').trim();
      if (background) metaThemeColor.content = background;
    }
  }, [resolvedTheme]);

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

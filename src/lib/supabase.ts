import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface PublicConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

let clientPromise: Promise<SupabaseClient> | undefined;

export function getSupabaseClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = fetch('/api/v1/public-config', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('无法读取应用连接配置。');
        const payload = await response.json() as { data?: PublicConfig; result?: PublicConfig } & PublicConfig;
        const config = payload.data ?? payload.result ?? payload;
        if (!config.supabaseUrl || !config.supabasePublishableKey) {
          throw new Error('Supabase 公共连接配置不完整。');
        }
        return createClient(config.supabaseUrl, config.supabasePublishableKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            experimental: { passkey: true, recoveryCodes: true },
          },
        });
      })
      .catch((error) => {
        clientPromise = undefined;
        throw error;
      });
  }
  return clientPromise;
}

import test from "node:test";
import assert from "node:assert/strict";
import { handleSettings } from "./settings.ts";

const ownerId = "123e4567-e89b-42d3-a456-426614174000";
const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon-test-key" };

function withFetch(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test("global guardrail GET is owner-scoped and uses the caller JWT for RLS", async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const restore = withFetch(async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, headers });
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: ownerId });
    return Response.json([{ config: { enabled: { keywords: true } }, config_version: 3, updated_at: "2026-11-17T00:00:00Z" }]);
  });
  try {
    const response = await handleSettings(new Request("https://worker.test/api/v1/settings/prospect-guardrails", {
      headers: { Authorization: "Bearer user-access-token" },
    }), env);
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: { config: { enabled: { keywords: boolean } }; configVersion: number } };
    assert.equal(payload.data.config.enabled.keywords, true);
    assert.equal(payload.data.configVersion, 3);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].headers.get("apikey"), env.SUPABASE_ANON_KEY);
    assert.equal(calls[1].headers.get("authorization"), "Bearer user-access-token");
    const query = new URL(calls[1].url).searchParams;
    assert.equal(query.get("owner_id"), "eq." + ownerId);
    assert.equal(query.get("scope_key"), "eq.prospect_guardrails");
  } finally { restore(); }
});

test("global guardrail PUT stores only allow-listed config under the authenticated owner", async () => {
  const storedRows: Array<Record<string, unknown>> = [];
  const storageHeaders: Headers[] = [];
  const restore = withFetch(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: ownerId });
    storageHeaders.push(new Headers(init?.headers));
    storedRows.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json([{ config_version: 1, updated_at: "2026-11-17T00:00:00Z" }]);
  });
  try {
    const response = await handleSettings(new Request("https://worker.test/api/v1/settings/prospect-guardrails", {
      method: "PUT",
      headers: { Authorization: "Bearer user-access-token", "Content-Type": "application/json" },
      body: JSON.stringify({ config: { enabled: { keywords: true }, rules: { keywords: "spam" }, unexpected: "must-not-persist", scope: "global" } }),
    }), env);
    assert.equal(response.status, 200);
    const stored = storedRows[0];
    assert.ok(stored);
    assert.equal(stored.owner_id, ownerId);
    assert.equal(stored.scope_key, "prospect_guardrails");
    const config = stored.config as Record<string, unknown>;
    assert.deepEqual(config.rules, { keywords: "spam" });
    assert.equal("unexpected" in config, false);
    assert.equal("scope" in config, false);
    assert.equal(storageHeaders[0]?.get("apikey"), env.SUPABASE_ANON_KEY);
    assert.equal(storageHeaders[0]?.get("authorization"), "Bearer user-access-token");
  } finally { restore(); }
});

test("global guardrail PUT rejects oversized configuration before storage", async () => {
  let storageCalled = false;
  const restore = withFetch(async input => {
    if (String(input).endsWith("/auth/v1/user")) return Response.json({ id: ownerId });
    storageCalled = true;
    return Response.json([]);
  });
  try {
    const response = await handleSettings(new Request("https://worker.test/api/v1/settings/prospect-guardrails", {
      method: "PUT",
      headers: { Authorization: "Bearer user-access-token", "Content-Type": "application/json" },
      body: JSON.stringify({ config: { rules: { keywords: "x".repeat(100_001) } } }),
    }), env);
    assert.equal(response.status, 413);
    assert.equal(storageCalled, false);
  } finally { restore(); }
});

test("global guardrail settings require a valid authenticated user", async () => {
  const restore = withFetch(async () => Response.json({ message: "invalid token" }, { status: 401 }));
  try {
    const response = await handleSettings(new Request("https://worker.test/api/v1/settings/prospect-guardrails"), env);
    assert.equal(response.status, 401);
  } finally { restore(); }
});


test("theme preference GET is scoped to the authenticated account and defaults to white", async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const restore = withFetch(async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, headers });
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: ownerId });
    return Response.json([]);
  });
  try {
    const response = await handleSettings(new Request("https://worker.test/api/v1/settings/theme-preference", {
      headers: { Authorization: "Bearer user-access-token" },
    }), env);
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: { preference: string } };
    assert.equal(payload.data.preference, "white");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].headers.get("apikey"), env.SUPABASE_ANON_KEY);
    assert.equal(calls[1].headers.get("authorization"), "Bearer user-access-token");
    const query = new URL(calls[1].url).searchParams;
    assert.equal(query.get("owner_id"), "eq." + ownerId);
    assert.equal(query.get("scope_key"), "eq.theme_preference");
  } finally { restore(); }
});

test("theme preference PUT persists only an allow-listed preference for the authenticated account", async () => {
  let stored: Record<string, unknown> | undefined;
  let storageHeaders: Headers | undefined;
  const restore = withFetch(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: ownerId });
    storageHeaders = new Headers(init?.headers);
    stored = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json([{ config_version: 1, updated_at: "2026-11-18T00:00:00Z" }]);
  });
  try {
    const response = await handleSettings(new Request("https://worker.test/api/v1/settings/theme-preference", {
      method: "PUT",
      headers: { Authorization: "Bearer user-access-token", "Content-Type": "application/json" },
      body: JSON.stringify({ preference: "g90", unexpected: "must-not-persist" }),
    }), env);
    assert.equal(response.status, 200);
    assert.ok(stored);
    assert.equal(stored.owner_id, ownerId);
    assert.equal(stored.scope_key, "theme_preference");
    assert.deepEqual(stored.config, { preference: "g90" });
    assert.equal("unexpected" in stored, false);
    assert.equal(storageHeaders?.get("apikey"), env.SUPABASE_ANON_KEY);
    assert.equal(storageHeaders?.get("authorization"), "Bearer user-access-token");
  } finally { restore(); }
});

test("theme preference PUT rejects unsupported values before writing", async () => {
  let storageCalled = false;
  const restore = withFetch(async input => {
    if (String(input).endsWith("/auth/v1/user")) return Response.json({ id: ownerId });
    storageCalled = true;
    return Response.json([]);
  });
  try {
    const response = await handleSettings(new Request("https://worker.test/api/v1/settings/theme-preference", {
      method: "PUT",
      headers: { Authorization: "Bearer user-access-token", "Content-Type": "application/json" },
      body: JSON.stringify({ preference: "midnight" }),
    }), env);
    assert.equal(response.status, 400);
    assert.equal(storageCalled, false);
  } finally { restore(); }
});

test("Bright Data integration test validates credentials and zone without spending a SERP request", async () => {
  const calls: string[] = [];
  const integrationEnv = { ...env, SUPABASE_SERVICE_ROLE_KEY: "service-test-key" };
  const restore = withFetch(async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: ownerId });
    if (url.endsWith("/rest/v1/rpc/tradepilot_secret_get")) {
      const args = JSON.parse(String(init?.body)) as { p_names: string[] };
      return Response.json(args.p_names.map(name => ({
        name,
        secret: name === "tradepilot_api_brightdata_zone" ? "serp-zone-test" : "api-token-test",
      })));
    }
    if (url.endsWith("/customer/balance")) return Response.json({ balance: 0, pending_balance: 0 });
    if (url.includes("/zone?zone=serp-zone-test")) return Response.json({ plan: { product: "serp" } });
    throw new Error("Unexpected request: " + url);
  });
  try {
    const response = await handleSettings(new Request("https://worker.test/api/v1/settings/integrations/test", {
      method: "POST",
      headers: { Authorization: "Bearer user-access-token", "Content-Type": "application/json" },
      body: JSON.stringify({ service: "brightdata" }),
    }), integrationEnv);
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: { ok: boolean; message: string } };
    assert.equal(payload.data.ok, true);
    assert.match(payload.data.message, /无计费验证/);
    assert.equal(calls.some(url => url.endsWith("/request")), false);
  } finally { restore(); }
});

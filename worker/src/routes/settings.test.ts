import test from "node:test";
import assert from "node:assert/strict";
import { handleSettings } from "./settings.ts";

const ownerId = "123e4567-e89b-42d3-a456-426614174000";
const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "anon-test-key" };

function withFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
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
  let stored: Record<string, unknown> | null = null;
  let storageHeaders: Headers | null = null;
  const restore = withFetch(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: ownerId });
    storageHeaders = new Headers(init?.headers);
    stored = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json([{ config_version: 1, updated_at: "2026-11-17T00:00:00Z" }]);
  });
  try {
    const response = await handleSettings(new Request("https://worker.test/api/v1/settings/prospect-guardrails", {
      method: "PUT",
      headers: { Authorization: "Bearer user-access-token", "Content-Type": "application/json" },
      body: JSON.stringify({ config: { enabled: { keywords: true }, rules: { keywords: "spam" }, unexpected: "must-not-persist", scope: "global" } }),
    }), env);
    assert.equal(response.status, 200);
    assert.equal(stored?.owner_id, ownerId);
    assert.equal(stored?.scope_key, "prospect_guardrails");
    const config = stored?.config as Record<string, unknown>;
    assert.deepEqual(config.rules, { keywords: "spam" });
    assert.equal("unexpected" in config, false);
    assert.equal("scope" in config, false);
    assert.equal(storageHeaders?.get("apikey"), env.SUPABASE_ANON_KEY);
    assert.equal(storageHeaders?.get("authorization"), "Bearer user-access-token");
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

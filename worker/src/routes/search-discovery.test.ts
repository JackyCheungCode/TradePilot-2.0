import test from "node:test";
import assert from "node:assert/strict";
import { handleSearchDiscovery } from "./search-discovery.ts";

const ownerId = "123e4567-e89b-42d3-a456-426614174000";
const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-test-key",
  LEAD_DISCOVERY_WORKFLOW: {
    create: async () => ({ id: "workflow-1" }),
    get: async (id: string) => ({ id, pause: async () => {}, resume: async () => {}, terminate: async () => {}, status: async () => ({ status: "running" }) }),
  },
};

function withFetch(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => { globalThis.fetch = original; };
}

const body = (searchEngines: string[]) => ({
  country: "BR", query: "ultrasonic cleaner", advancedQuery: '"ultrasonic cleaner" manufacturer',
  limitPerCountry: 10, searchEngines, searchTypes: ["web"], searchLanguage: "pt",
  excludeDomains: [], excludeCategories: [], businessTypes: ["manufacturer"],
});

test("search discovery accepts configured Bright Data, SerpKite and SerpApi credentials from Vault", async () => {
  const calls: string[] = [];
  const restore = withFetch(async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: ownerId });
    if (url.endsWith("/rest/v1/rpc/tradepilot_secret_get")) {
      const args = JSON.parse(String(init?.body)) as { p_names: string[] };
      return Response.json(args.p_names.map(name => ({ name, secret: "configured-test-value" })));
    }
    if (url.endsWith("/rest/v1/discovery_runs")) return Response.json([{ id: "run-1" }], { status: 201 });
    if (url.endsWith("/rest/v1/discovery_run_logs")) return new Response(null, { status: 201 });
    throw new Error("Unexpected request: " + url);
  });
  try {
    const response = await handleSearchDiscovery(new Request("https://worker.test/api/v1/search-discovery-runs", {
      method: "POST",
      headers: { Authorization: "Bearer user-access-token", "Content-Type": "application/json" },
      body: JSON.stringify(body(["brightdata", "serpkite", "serpapi"])),
    }), env);
    assert.equal(response.status, 202);
    const payload = await response.json() as { data: { providers: string[] } };
    assert.deepEqual(payload.data.providers, ["brightdata", "serpkite", "serpapi"]);
    assert.ok(calls.some(url => url.endsWith("/rest/v1/rpc/tradepilot_secret_get")));
  } finally { restore(); }
});

test("search discovery rejects one-time Serper and unconfigured QuanticData providers", async () => {
  const restore = withFetch(async input => {
    if (String(input).endsWith("/auth/v1/user")) return Response.json({ id: ownerId });
    throw new Error("Provider validation should stop before reading Vault");
  });
  try {
    for (const provider of ["serper", "quanticdata"]) {
      const response = await handleSearchDiscovery(new Request("https://worker.test/api/v1/search-discovery-runs", {
        method: "POST",
        headers: { Authorization: "Bearer user-access-token", "Content-Type": "application/json" },
        body: JSON.stringify(body([provider])),
      }), env);
      assert.equal(response.status, 400);
    }
  } finally { restore(); }
});

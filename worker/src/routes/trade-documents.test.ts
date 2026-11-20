import test from "node:test";
import assert from "node:assert/strict";
import { handleTradeDocuments } from "./trade-documents.ts";

const ownerId = "123e4567-e89b-42d3-a456-426614174000";
const documentId = "123e4567-e89b-42d3-a456-426614174099";
const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-test-key",
};

function withFetch(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => { globalThis.fetch = original; };
}

function authResponse() {
  return Response.json({ id: ownerId });
}

function serviceRole(init?: RequestInit) {
  const headers = new Headers(init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer service-test-key");
  assert.equal(headers.get("apikey"), "service-test-key");
}

test("quote creation uses the supplied owner-scoped number and persists an issued version", async () => {
  let insertedDocument: Record<string, unknown> | undefined;
  let insertedVersion: Record<string, unknown> | undefined;
  let insertedEvent: Record<string, unknown> | undefined;
  const restore = withFetch(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return authResponse();
    if (url.includes("/rest/v1/trade_document_settings?")) { serviceRole(init); return Response.json([]); }
    if (url.includes("/rest/v1/enterprise_profiles?")) { serviceRole(init); return Response.json([]); }
    if (url.includes("/rest/v1/trade_documents?select=id&owner_id=")) { serviceRole(init); return Response.json([]); }
    if (url.endsWith("/rest/v1/trade_documents") && init?.method === "POST") {
      serviceRole(init);
      insertedDocument = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json([{ ...insertedDocument, id: documentId, created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z" }]);
    }
    if (url.endsWith("/rest/v1/trade_document_versions") && init?.method === "POST") {
      serviceRole(init);
      insertedVersion = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json([]);
    }
    if (url.endsWith("/rest/v1/trade_document_events") && init?.method === "POST") {
      serviceRole(init);
      insertedEvent = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json([]);
    }
    throw new Error("Unexpected fetch: " + url + " " + String(init?.method));
  });

  try {
    const response = await handleTradeDocuments(new Request("https://worker.test/api/v1/trade/documents", {
      method: "POST",
      headers: { Authorization: "Bearer user-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        document_type: "quotation",
        document_number: "QT-2026-0001",
        title: "Buyer - Quotation",
        status: "issued",
        locale: "en",
        currency_code: "USD",
        content: { quote_status: "sent", account_id: "account-1", lines: [{ name: "Product", quantity: 1, unit_price: 5 }] },
        totals: { grand_total: 5 },
      }),
    }), env);

    assert.equal(response.status, 201);
    assert.equal(insertedDocument?.owner_id, ownerId);
    assert.equal(insertedDocument?.document_number, "QT-2026-0001");
    assert.equal(insertedDocument?.status, "issued");
    assert.ok(insertedDocument?.issued_at);
    assert.equal(insertedVersion?.version_number, 1);
    assert.equal(insertedEvent?.event_type, "issued");
  } finally {
    restore();
  }
});

test("quote revision is owner-scoped, version-checked, and writes a new immutable version", async () => {
  let patchedDocument: Record<string, unknown> | undefined;
  let insertedVersion: Record<string, unknown> | undefined;
  let insertedEvent: Record<string, unknown> | undefined;
  const oldContent = {
    quote_status: "sent",
    settings_snapshot: {},
    quote: { title: "Old title" },
    account_id: "account-1",
    contact_id: null,
    opportunity_id: null,
    account_snapshot: { account_name: "Buyer" },
    contact_snapshot: null,
    lines: [{ name: "Old product", quantity: 1, unit_price: 5 }],
    charges: [],
    internal: {},
    customer: {},
    _system: { document_policy_snapshot: { editableFields: [] } },
  };
  const existing = {
    id: documentId,
    owner_id: ownerId,
    order_id: null,
    document_type: "quotation",
    status: "issued",
    title: "Buyer - Quotation",
    content: oldContent,
    totals: { grand_total: 5 },
    template_id: null,
    locale: "en",
    currency_code: "USD",
    current_version: 1,
  };

  const restore = withFetch(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return authResponse();
    if (url.includes("/rest/v1/trade_documents?select=id,owner_id,order_id,document_type,status,content,totals")) {
      serviceRole(init);
      return Response.json([existing]);
    }
    if (url.includes("/rest/v1/trade_document_settings?")) { serviceRole(init); return Response.json([]); }
    if (url.includes("/rest/v1/trade_documents?id=eq.") && init?.method === "PATCH") {
      serviceRole(init);
      assert.match(url, /status=eq\.issued/);
      assert.match(url, /current_version=eq\.1/);
      patchedDocument = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json([{
        ...existing,
        ...patchedDocument,
        current_version: 2,
      }]);
    }
    if (url.includes("/rest/v1/trade_document_versions?select=template_snapshot")) {
      serviceRole(init);
      return Response.json([]);
    }
    if (url.endsWith("/rest/v1/trade_document_versions") && init?.method === "POST") {
      serviceRole(init);
      insertedVersion = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json([]);
    }
    if (url.endsWith("/rest/v1/trade_document_events") && init?.method === "POST") {
      serviceRole(init);
      insertedEvent = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json([]);
    }
    throw new Error("Unexpected fetch: " + url + " " + String(init?.method));
  });

  try {
    const nextContent = {
      ...oldContent,
      quote_status: "sent",
      quote: { title: "Updated title" },
      lines: [{ name: "Updated product", quantity: 2, unit_price: 7 }],
    };
    const response = await handleTradeDocuments(new Request("https://worker.test/api/v1/trade/documents/" + documentId, {
      method: "PATCH",
      headers: { Authorization: "Bearer user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated quote", status: "issued", locale: "en", content: nextContent, totals: { grand_total: 14 } }),
    }), env);

    assert.equal(response.status, 200);
    assert.equal(patchedDocument?.status, "issued");
    assert.equal(patchedDocument?.title, "Updated quote");
    assert.equal(patchedDocument?.current_version, 2);
    assert.equal(insertedVersion?.version_number, 2);
    assert.equal(insertedEvent?.event_type, "revision_issued");
  } finally {
    restore();
  }
});

test("quote detail reads versions through the owner-scoped Worker endpoint", async () => {
  const versions = [{ version_number: 2 }, { version_number: 1 }];
  const restore = withFetch(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return authResponse();
    if (url.includes("/rest/v1/trade_documents?select=*,trade_document_versions(*)")) {
      serviceRole(init);
      assert.ok(url.includes("owner_id=eq." + ownerId));
      return Response.json([{ id: documentId, owner_id: ownerId, document_type: "quotation", trade_document_versions: versions }]);
    }
    throw new Error("Unexpected fetch: " + url + " " + String(init?.method));
  });

  try {
    const response = await handleTradeDocuments(new Request("https://worker.test/api/v1/trade/documents/" + documentId, {
      headers: { Authorization: "Bearer user-token" },
    }), env);
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: { trade_document_versions: Array<{ version_number: number }> } };
    assert.deepEqual(payload.data.trade_document_versions, versions);
  } finally {
    restore();
  }
});

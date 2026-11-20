import test from "node:test";
import assert from "node:assert/strict";
import { handleInbox } from "./inbox.ts";

const ownerId = "123e4567-e89b-42d3-a456-426614174000";
const conversationId = "123e4567-e89b-42d3-a456-426614174001";
const messageId = "123e4567-e89b-42d3-a456-426614174002";
const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-test-key",
};

function withFetch(attachmentResponse: Response) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: ownerId });
    if (url.includes("/rest/v1/inbox_conversations?")) return Response.json([{ id: conversationId }]);
    if (url.includes("/rest/v1/inbox_messages?")) return Response.json([{
      id: messageId,
      conversation_id: conversationId,
      content: "Hello",
      attachments: [],
      created_at: "2026-11-20T00:00:00Z",
    }]);
    if (url.includes("/rest/v1/inbox_attachments?")) return attachmentResponse;
    if (url.includes("/rest/v1/inbox_internal_notes?")) return Response.json([]);
    throw new Error("Unexpected fetch: " + url);
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test("inbox message history remains readable while the held private-attachment migration is absent", async () => {
  const restore = withFetch(Response.json({
    code: "PGRST205",
    message: "Could not find the table 'public.inbox_attachments' in the schema cache",
  }, { status: 404 }));
  try {
    const response = await handleInbox(new Request(
      "https://worker.test/api/v1/inbox/conversations/" + conversationId + "/messages",
      { headers: { Authorization: "Bearer user-token" } },
    ), env);
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: { items: Array<{ id: string; attachments: unknown[] }> } };
    assert.equal(payload.data.items.length, 1);
    assert.equal(payload.data.items[0].id, messageId);
    assert.deepEqual(payload.data.items[0].attachments, []);
  } finally {
    restore();
  }
});

test("inbox message history does not hide attachment database errors other than a missing migration", async () => {
  const restore = withFetch(Response.json({
    code: "42501",
    message: "permission denied for table inbox_attachments",
  }, { status: 403 }));
  try {
    const response = await handleInbox(new Request(
      "https://worker.test/api/v1/inbox/conversations/" + conversationId + "/messages",
      { headers: { Authorization: "Bearer user-token" } },
    ), env);
    assert.equal(response.status, 500);
  } finally {
    restore();
  }
});

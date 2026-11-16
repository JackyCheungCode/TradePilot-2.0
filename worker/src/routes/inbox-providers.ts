export type InboxProvider = "whatsapp" | "line" | "messenger" | "telegram";

export interface InboxProviderSecrets {
  whatsappAccessToken?: string;
  whatsappPhoneNumberId?: string;
  lineChannelAccessToken?: string;
  messengerPageAccessToken?: string;
  telegramBotToken?: string;
}

export interface InboxProviderSendResult {
  externalMessageId: string | null;
  provider: InboxProvider;
}

async function providerRequest(url: string, token: string | undefined, body: unknown): Promise<Record<string, unknown>> {
  if (!token) throw new Error("CHANNEL_CREDENTIAL_MISSING");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    // Never persist provider response bodies: they may contain recipient or account data.
    throw new Error("CHANNEL_PROVIDER_HTTP_" + response.status);
  }
  return payload;
}

export async function sendInboxProviderMessage(
  channel: InboxProvider,
  recipient: string,
  content: string,
  secrets: InboxProviderSecrets,
): Promise<InboxProviderSendResult> {
  if (channel === "whatsapp") {
    if (!secrets.whatsappPhoneNumberId) throw new Error("CHANNEL_CREDENTIAL_MISSING");
    const payload = await providerRequest(
      "https://graph.facebook.com/v26.0/" + encodeURIComponent(secrets.whatsappPhoneNumberId) + "/messages",
      secrets.whatsappAccessToken,
      { messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "text", text: { preview_url: false, body: content } },
    );
    const messages = Array.isArray(payload.messages) ? payload.messages as Array<Record<string, unknown>> : [];
    return { provider: channel, externalMessageId: typeof messages[0]?.id === "string" ? messages[0].id : null };
  }
  if (channel === "line") {
    const payload = await providerRequest(
      "https://api.line.me/v2/bot/message/push",
      secrets.lineChannelAccessToken,
      { to: recipient, messages: [{ type: "text", text: content }] },
    );
    const sent = Array.isArray(payload.sentMessages) ? payload.sentMessages as Array<Record<string, unknown>> : [];
    return { provider: channel, externalMessageId: typeof sent[0]?.id === "string" ? sent[0].id : null };
  }
  if (channel === "messenger") {
    const token = secrets.messengerPageAccessToken;
    if (!token) throw new Error("CHANNEL_CREDENTIAL_MISSING");
    const payload = await providerRequest(
      "https://graph.facebook.com/v26.0/me/messages",
      token,
      { recipient: { id: recipient }, messaging_type: "RESPONSE", message: { text: content } },
    );
    return { provider: channel, externalMessageId: typeof payload.message_id === "string" ? payload.message_id : null };
  }
  if (channel === "telegram") {
    const token = secrets.telegramBotToken;
    if (!token) throw new Error("CHANNEL_CREDENTIAL_MISSING");
    const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: recipient, text: content }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number } };
    if (!response.ok || payload.ok !== true) throw new Error("CHANNEL_PROVIDER_HTTP_" + response.status);
    return { provider: channel, externalMessageId: payload.result?.message_id == null ? null : String(payload.result.message_id) };
  }
  throw new Error("CHANNEL_NOT_SUPPORTED");
}

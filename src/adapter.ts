import {
  AdapterRateLimitError,
  AuthenticationError,
  NetworkError,
  ValidationError,
} from "@chat-adapter/shared";
import type {
  Adapter,
  AdapterPostableMessage,
  Attachment,
  ChatInstance,
  FetchOptions,
  FetchResult,
  FormattedContent,
  Logger,
  RawMessage,
  ThreadInfo,
  WebhookOptions,
} from "chat";
import { ConsoleLogger, Message, NotImplementedError } from "chat";
import { ADAPTER_NAME, ADAPTER_VERSION, USER_AGENT } from "./attribution";
import { AgentPhoneFormatConverter } from "./format-converter";
import type {
  AgentPhoneAdapterConfig,
  AgentPhoneCallEndedWebhook,
  AgentPhoneMessageWebhook,
  AgentPhoneRawMessage,
  AgentPhoneReactionResponse,
  AgentPhoneReactionWebhook,
  AgentPhoneSendMessageResponse,
  AgentPhoneThreadId,
  AgentPhoneWebhookPayload,
} from "./types";

const DEFAULT_API_URL = "https://api.agentphone.ai";
const SMS_MAX_LENGTH = 1600;
const THREAD_ID_PATTERN = /^agentphone:(.+):(.+)$/;
const TIMESTAMP_MAX_AGE_SECONDS = 300;

export class AgentPhoneAdapter
  implements Adapter<AgentPhoneThreadId, AgentPhoneRawMessage>
{
  readonly name = "agentphone";

  private readonly apiKey: string;
  private readonly agentId: string;
  private readonly webhookSecret?: string;
  private readonly apiUrl: string;
  private readonly logger: Logger;
  private readonly formatConverter = new AgentPhoneFormatConverter();

  private chat: ChatInstance | null = null;
  private readonly _userName: string;

  get botUserId(): string {
    return this.agentId;
  }

  get userName(): string {
    return this._userName;
  }

  constructor(config: AgentPhoneAdapterConfig = {}) {
    const apiKey = config.apiKey ?? process.env.AGENTPHONE_API_KEY;
    if (!apiKey) {
      throw new ValidationError(
        "agentphone",
        "apiKey is required. Set AGENTPHONE_API_KEY or provide it in config."
      );
    }

    const agentId = config.agentId ?? process.env.AGENTPHONE_AGENT_ID;
    if (!agentId) {
      throw new ValidationError(
        "agentphone",
        "agentId is required. Set AGENTPHONE_AGENT_ID or provide it in config."
      );
    }

    this.apiKey = apiKey;
    this.agentId = agentId;
    this.webhookSecret =
      config.webhookSecret ?? process.env.AGENTPHONE_WEBHOOK_SECRET;
    this.apiUrl = config.apiUrl ?? DEFAULT_API_URL;
    this.logger =
      config.logger ?? new ConsoleLogger("info").child("agentphone");
    this._userName = config.userName ?? process.env.BOT_USERNAME ?? "bot";
  }

  async initialize(chat: ChatInstance): Promise<void> {
    this.chat = chat;
    this.logger.info("AgentPhone adapter initialized", {
      agentId: this.agentId,
      adapter: ADAPTER_NAME,
      version: ADAPTER_VERSION,
    });
  }

  async handleWebhook(
    request: Request,
    options?: WebhookOptions
  ): Promise<Response> {
    const rawBody = await request.text();

    if (this.webhookSecret) {
      const signature = request.headers.get("x-webhook-signature");
      const timestamp = request.headers.get("x-webhook-timestamp");

      if (!(signature && timestamp)) {
        return new Response("Missing signature headers", { status: 401 });
      }

      const now = Math.floor(Date.now() / 1000);
      if (
        Math.abs(now - Number.parseInt(timestamp, 10)) >
        TIMESTAMP_MAX_AGE_SECONDS
      ) {
        return new Response("Stale timestamp", { status: 401 });
      }

      const isValid = await this.verifySignature(
        rawBody,
        signature,
        timestamp
      );
      if (!isValid) {
        return new Response("Invalid signature", { status: 401 });
      }
    }

    let body: AgentPhoneWebhookPayload;
    try {
      body = JSON.parse(rawBody) as AgentPhoneWebhookPayload;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (!this.chat) {
      this.logger.error("Chat instance not initialized");
      return new Response("Not initialized", { status: 500 });
    }

    switch (body.event) {
      case "agent.message":
        return this.handleMessageWebhook(body, options);
      case "agent.call_ended":
        return this.handleCallEndedWebhook(body, options);
      case "agent.reaction":
        return this.handleReactionWebhook(body);
      default:
        this.logger.debug("Ignoring unknown event", {
          event: (body as { event: string }).event,
        });
        return new Response("OK", { status: 200 });
    }
  }

  private handleMessageWebhook(
    body: AgentPhoneMessageWebhook,
    options?: WebhookOptions
  ): Response {
    const { data } = body;

    if (data.direction !== "inbound") {
      return new Response("OK", { status: 200 });
    }

    const threadId = this.encodeThreadId({
      agentPhoneNumber: data.to,
      recipientNumber: data.from,
    });

    const message = this.parseMessage(data);
    this.chat!.processMessage(this, threadId, message, options);

    return new Response("OK", { status: 200 });
  }

  private handleCallEndedWebhook(
    body: AgentPhoneCallEndedWebhook,
    options?: WebhookOptions
  ): Response {
    const { data } = body;

    const isInbound = data.direction === "inbound";
    const threadId = this.encodeThreadId({
      agentPhoneNumber: isInbound ? data.to : data.from,
      recipientNumber: isInbound ? data.from : data.to,
    });

    const transcriptText = data.transcript
      .map((t) => `${t.role}: ${t.content}`)
      .join("\n");

    const summaryParts: string[] = [];
    summaryParts.push(
      `[Voice call ended — ${Math.round(data.durationSeconds)}s, ${data.direction}]`
    );
    if (data.summary) summaryParts.push(data.summary);
    if (transcriptText) summaryParts.push(`\nTranscript:\n${transcriptText}`);

    const message = new Message<AgentPhoneRawMessage>({
      id: data.callId,
      threadId,
      text: summaryParts.join("\n"),
      formatted: this.formatConverter.toAst(summaryParts.join("\n")),
      raw: data,
      isMention: isInbound,
      author: {
        fullName: isInbound ? data.from : data.to,
        userId: isInbound ? data.from : data.to,
        isBot: !isInbound,
        isMe: !isInbound,
        userName: isInbound ? data.from : data.to,
      },
      metadata: {
        dateSent: new Date(data.endedAt),
        edited: false,
      },
      attachments: [],
    });

    this.chat!.processMessage(this, threadId, message, options);
    return new Response("OK", { status: 200 });
  }

  private handleReactionWebhook(body: AgentPhoneReactionWebhook): Response {
    const { data } = body;

    if (data.direction !== "inbound") {
      return new Response("OK", { status: 200 });
    }

    this.chat!.processReaction(this, data.messageId, {
      emoji: data.reactionType,
      userId: data.fromNumber,
    });

    return new Response("OK", { status: 200 });
  }

  async postMessage(
    threadId: string,
    message: AdapterPostableMessage
  ): Promise<RawMessage<AgentPhoneRawMessage>> {
    const { recipientNumber } = this.decodeThreadId(threadId);
    const text = this.formatConverter.renderPostable(message);

    const requestBody: Record<string, unknown> = {
      agent_id: this.agentId,
      to_number: recipientNumber,
      body: text.slice(0, SMS_MAX_LENGTH),
    };

    const mediaUrls: string[] = [];
    if (typeof message === "object" && message !== null && "attachments" in message) {
      const attachments = (message as { attachments?: Attachment[] })
        .attachments;
      if (attachments) {
        for (const att of attachments) {
          if (att.url) mediaUrls.push(att.url);
        }
      }
    }

    if (mediaUrls.length === 1) {
      requestBody.media_url = mediaUrls[0];
    } else if (mediaUrls.length > 1) {
      requestBody.media_urls = mediaUrls;
    }

    const response = await this.apiFetch("/v1/messages", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      await this.handleApiError(response);
    }

    const result = (await response.json()) as AgentPhoneSendMessageResponse;

    return {
      id: result.id,
      threadId,
      raw: {
        messageId: result.id,
        conversationId: null,
        numberId: null,
        from: result.from_number,
        to: result.to_number,
        contact: null,
        message: text,
        mediaUrl: null,
        mediaUrls: result.media_urls,
        direction: "outbound",
        receivedAt: new Date().toISOString(),
      },
    };
  }

  async editMessage(): Promise<RawMessage<AgentPhoneRawMessage>> {
    throw new NotImplementedError("agentphone", "editMessage");
  }

  async deleteMessage(): Promise<void> {
    throw new NotImplementedError("agentphone", "deleteMessage");
  }

  async addReaction(
    threadId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    const response = await this.apiFetch(
      `/v1/messages/${encodeURIComponent(messageId)}/reactions`,
      {
        method: "POST",
        body: JSON.stringify({ reaction: emoji }),
      }
    );

    if (!response.ok) {
      await this.handleApiError(response);
    }

    await response.json() as AgentPhoneReactionResponse;
  }

  async removeReaction(): Promise<void> {
    throw new NotImplementedError("agentphone", "removeReaction");
  }

  parseMessage(
    raw: AgentPhoneMessageWebhook["data"]
  ): Message<AgentPhoneRawMessage> {
    const isMe = raw.direction === "outbound";

    const attachments: Attachment[] = (raw.mediaUrls ?? []).map((url) => ({
      type: inferAttachmentType(url),
      url,
    }));

    const threadId = this.encodeThreadId({
      agentPhoneNumber: isMe ? raw.from : raw.to,
      recipientNumber: isMe ? raw.to : raw.from,
    });

    return new Message<AgentPhoneRawMessage>({
      id: raw.messageId,
      threadId,
      text: raw.message,
      formatted: this.formatConverter.toAst(raw.message),
      raw,
      isMention: !isMe,
      author: {
        fullName: raw.contact?.name ?? raw.from,
        userId: raw.from,
        isBot: isMe,
        isMe,
        userName: raw.from,
      },
      metadata: {
        dateSent: new Date(raw.receivedAt),
        edited: false,
      },
      attachments,
    });
  }

  async fetchMessages(
    _threadId: string,
    _options?: FetchOptions
  ): Promise<FetchResult<AgentPhoneRawMessage>> {
    return { messages: [] };
  }

  async fetchThread(threadId: string): Promise<ThreadInfo> {
    const { recipientNumber, agentPhoneNumber } =
      this.decodeThreadId(threadId);
    return {
      id: threadId,
      channelId: `agentphone:${agentPhoneNumber}`,
      isDM: true,
      metadata: {
        recipientNumber,
        agentPhoneNumber,
      },
    };
  }

  encodeThreadId(data: AgentPhoneThreadId): string {
    return `agentphone:${data.agentPhoneNumber}:${data.recipientNumber}`;
  }

  decodeThreadId(threadId: string): AgentPhoneThreadId {
    const match = THREAD_ID_PATTERN.exec(threadId);
    const agentPhoneNumber = match?.[1];
    const recipientNumber = match?.[2];
    if (!(agentPhoneNumber && recipientNumber)) {
      throw new ValidationError(
        "agentphone",
        `Invalid thread ID format: ${threadId}. Expected agentphone:<number>:<number>`
      );
    }
    return { agentPhoneNumber, recipientNumber };
  }

  channelIdFromThreadId(threadId: string): string {
    const { agentPhoneNumber } = this.decodeThreadId(threadId);
    return `agentphone:${agentPhoneNumber}`;
  }

  async startTyping(): Promise<void> {
    // SMS/voice don't support typing indicators — no-op
  }

  renderFormatted(content: FormattedContent): string {
    return this.formatConverter.fromAst(content);
  }

  isDM(): boolean {
    return true;
  }

  async openDM(phoneNumber: string): Promise<string> {
    return this.encodeThreadId({
      agentPhoneNumber: this.agentId,
      recipientNumber: phoneNumber,
    });
  }

  // --- Private helpers ---

  private apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    headers.set("Content-Type", "application/json");
    headers.set("User-Agent", USER_AGENT);
    return fetch(`${this.apiUrl}${path}`, { ...init, headers });
  }

  private async handleApiError(response: Response): Promise<never> {
    const errorBody = await response.text();

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      throw new AdapterRateLimitError(
        "agentphone",
        retryAfter ? Number.parseInt(retryAfter, 10) : undefined
      );
    }

    const detail = parseApiError(errorBody) ?? `${response.status} ${errorBody}`;

    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(
        "agentphone",
        `Auth failed: ${detail}`
      );
    }

    throw new NetworkError(
      "agentphone",
      `API request failed: ${detail}`
    );
  }

  private async verifySignature(
    body: string,
    signature: string,
    timestamp: string
  ): Promise<boolean> {
    try {
      const secret = this.webhookSecret!;
      const signedString = `${timestamp}.${body}`;
      const encoder = new TextEncoder();

      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const mac = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(signedString)
      );

      const expected = `sha256=${arrayBufferToHex(mac)}`;

      if (expected.length !== signature.length) return false;

      const a = encoder.encode(expected);
      const b = encoder.encode(signature);
      if (a.length !== b.length) return false;

      let mismatch = 0;
      for (let i = 0; i < a.length; i++) {
        mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
      }
      return mismatch === 0;
    } catch (error) {
      this.logger.error("Signature verification failed", { error });
      return false;
    }
  }
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const hex: string[] = [];
  for (const byte of bytes) {
    hex.push(byte.toString(16).padStart(2, "0"));
  }
  return hex.join("");
}

function inferAttachmentType(url: string): Attachment["type"] {
  const lower = url.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic|svg)/.test(lower)) return "image";
  if (/\.(mp4|mov|avi|webm)/.test(lower)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac)/.test(lower)) return "audio";
  return "file";
}

function parseApiError(errorBody: string): string | undefined {
  try {
    const json = JSON.parse(errorBody) as {
      detail?: string | { msg?: string }[];
      error?: string;
      message?: string;
    };
    if (typeof json.detail === "string") return json.detail;
    if (Array.isArray(json.detail) && json.detail[0]?.msg) return json.detail[0].msg;
    if (json.error) return json.error;
    if (json.message) return json.message;
    return undefined;
  } catch {
    return undefined;
  }
}

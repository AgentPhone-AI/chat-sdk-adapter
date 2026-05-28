import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgentPhoneAdapter } from "../src/adapter";
import {
  createMockChat,
  inboundSMS,
  inboundMMS,
  inboundIMessage,
  outboundMessage,
  callEnded,
  inboundReaction,
} from "./fixtures/webhook-payloads";

const DEFAULT_CONFIG = {
  apiKey: "test-api-key",
  agentId: "agent_test123",
  webhookSecret: "whsec_test-secret",
};

describe("AgentPhoneAdapter", () => {
  describe("constructor", () => {
    it("throws when apiKey is missing", () => {
      expect(
        () => new AgentPhoneAdapter({ agentId: "a" })
      ).toThrow("apiKey is required");
    });

    it("throws when agentId is missing", () => {
      expect(
        () => new AgentPhoneAdapter({ apiKey: "k" })
      ).toThrow("agentId is required");
    });

    it("reads from env vars", () => {
      process.env.AGENTPHONE_API_KEY = "env-key";
      process.env.AGENTPHONE_AGENT_ID = "env-agent";
      const adapter = new AgentPhoneAdapter();
      expect(adapter.name).toBe("agentphone");
      expect(adapter.botUserId).toBe("env-agent");
      delete process.env.AGENTPHONE_API_KEY;
      delete process.env.AGENTPHONE_AGENT_ID;
    });

    it("uses config values over env vars", () => {
      process.env.AGENTPHONE_API_KEY = "env-key";
      process.env.AGENTPHONE_AGENT_ID = "env-agent";
      const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);
      expect(adapter.botUserId).toBe("agent_test123");
      delete process.env.AGENTPHONE_API_KEY;
      delete process.env.AGENTPHONE_AGENT_ID;
    });
  });

  describe("encodeThreadId / decodeThreadId", () => {
    const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);

    it("round-trips", () => {
      const data = {
        agentPhoneNumber: "+15559876543",
        recipientNumber: "+15551234567",
      };
      const threadId = adapter.encodeThreadId(data);
      expect(threadId).toBe("agentphone:+15559876543:+15551234567");
      expect(adapter.decodeThreadId(threadId)).toEqual(data);
    });

    it("throws on invalid format", () => {
      expect(() => adapter.decodeThreadId("bad")).toThrow(
        "Invalid thread ID format"
      );
    });
  });

  describe("channelIdFromThreadId", () => {
    const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);

    it("extracts channel ID", () => {
      expect(
        adapter.channelIdFromThreadId("agentphone:+15559876543:+15551234567")
      ).toBe("agentphone:+15559876543");
    });
  });

  describe("parseMessage", () => {
    const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);

    it("parses inbound SMS", () => {
      const msg = adapter.parseMessage(inboundSMS.data);
      expect(msg.text).toBe("Hello from SMS");
      expect(msg.author.isMe).toBe(false);
      expect(msg.isMention).toBe(true);
      expect(msg.id).toBe("msg_001");
    });

    it("parses inbound MMS with attachments", () => {
      const msg = adapter.parseMessage(inboundMMS.data);
      expect(msg.attachments).toHaveLength(1);
      expect(msg.attachments[0]?.type).toBe("image");
      expect(msg.attachments[0]?.url).toBe(
        "https://media.agentphone.ai/img.jpg"
      );
    });

    it("parses iMessage with contact name", () => {
      const msg = adapter.parseMessage(inboundIMessage.data);
      expect(msg.author.fullName).toBe("Jane Doe");
      expect(msg.author.userId).toBe("+15551234567");
    });

    it("marks outbound as isMe", () => {
      const msg = adapter.parseMessage(outboundMessage.data);
      expect(msg.author.isMe).toBe(true);
      expect(msg.author.isBot).toBe(true);
      expect(msg.isMention).toBe(false);
    });

    it("produces consistent threadIds for inbound/outbound", () => {
      const inMsg = adapter.parseMessage(inboundSMS.data);
      const outMsg = adapter.parseMessage(outboundMessage.data);
      expect(inMsg.threadId).toBe(outMsg.threadId);
    });
  });

  describe("handleWebhook", () => {
    let adapter: AgentPhoneAdapter;
    let mockChat: ReturnType<typeof createMockChat>;

    beforeEach(async () => {
      adapter = new AgentPhoneAdapter({
        ...DEFAULT_CONFIG,
        webhookSecret: undefined, // Disable signature check for simplicity
      });
      mockChat = createMockChat();
      await adapter.initialize(mockChat);
    });

    it("processes inbound SMS", async () => {
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify(inboundSMS),
        headers: { "Content-Type": "application/json" },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(200);
      expect(mockChat.processMessage).toHaveBeenCalledOnce();
    });

    it("processes inbound MMS", async () => {
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify(inboundMMS),
        headers: { "Content-Type": "application/json" },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(200);
      expect(mockChat.processMessage).toHaveBeenCalledOnce();
    });

    it("processes inbound iMessage", async () => {
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify(inboundIMessage),
        headers: { "Content-Type": "application/json" },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(200);
      expect(mockChat.processMessage).toHaveBeenCalledOnce();
    });

    it("processes voice call ended", async () => {
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify(callEnded),
        headers: { "Content-Type": "application/json" },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(200);
      expect(mockChat.processMessage).toHaveBeenCalledOnce();

      const [, , message] = (mockChat.processMessage as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(message.text).toContain("Voice call ended");
      expect(message.text).toContain("300s");
      expect(message.text).toContain("Customer asked about order status");
      expect(message.text).toContain("agent: Hello, how can I help?");
    });

    it("processes inbound reaction", async () => {
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify(inboundReaction),
        headers: { "Content-Type": "application/json" },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(200);
      expect(mockChat.processReaction).toHaveBeenCalledOnce();
      expect(mockChat.processReaction).toHaveBeenCalledWith(
        adapter,
        "msg_003",
        { emoji: "love", userId: "+15551234567" }
      );
    });

    it("ignores outbound messages", async () => {
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify(outboundMessage),
        headers: { "Content-Type": "application/json" },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(200);
      expect(mockChat.processMessage).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid JSON", async () => {
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body: "not json{",
        headers: { "Content-Type": "application/json" },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(400);
    });

    it("returns 200 for unknown events", async () => {
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify({ event: "agent.unknown", data: {} }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(200);
      expect(mockChat.processMessage).not.toHaveBeenCalled();
    });
  });

  describe("handleWebhook with signature verification", () => {
    it("rejects missing signature headers", async () => {
      const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);
      await adapter.initialize(createMockChat());

      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify(inboundSMS),
        headers: { "Content-Type": "application/json" },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("Missing signature headers");
    });

    it("rejects stale timestamps", async () => {
      const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);
      await adapter.initialize(createMockChat());

      const staleTs = String(Math.floor(Date.now() / 1000) - 600);
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify(inboundSMS),
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": "sha256=fake",
          "X-Webhook-Timestamp": staleTs,
        },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("Stale timestamp");
    });

    it("accepts valid HMAC signature", async () => {
      const secret = "whsec_test-secret";
      const adapter = new AgentPhoneAdapter({
        ...DEFAULT_CONFIG,
        webhookSecret: secret,
      });
      const mockChat = createMockChat();
      await adapter.initialize(mockChat);

      const body = JSON.stringify(inboundSMS);
      const ts = String(Math.floor(Date.now() / 1000));
      const signedString = `${ts}.${body}`;

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
      const hex = Array.from(new Uint8Array(mac))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const signature = `sha256=${hex}`;

      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": ts,
        },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(200);
      expect(mockChat.processMessage).toHaveBeenCalledOnce();
    });

    it("rejects invalid HMAC signature", async () => {
      const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);
      await adapter.initialize(createMockChat());

      const ts = String(Math.floor(Date.now() / 1000));
      const req = new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify(inboundSMS),
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": "sha256=0000000000000000000000000000000000000000000000000000000000000000",
          "X-Webhook-Timestamp": ts,
        },
      });

      const res = await adapter.handleWebhook(req);
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("Invalid signature");
    });
  });

  describe("postMessage", () => {
    it("sends SMS via API", async () => {
      const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);

      const mockResponse = {
        id: "msg_new",
        status: "sent",
        channel: "sms",
        from_number: "+15559876543",
        to_number: "+15551234567",
        media_urls: [],
        reply_to_message_id: null,
        reply_parent_unresolved: null,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const result = await adapter.postMessage(
        "agentphone:+15559876543:+15551234567",
        "Hello from the bot"
      );

      expect(result.id).toBe("msg_new");
      expect(result.threadId).toBe("agentphone:+15559876543:+15551234567");

      const fetchCall = vi.mocked(fetch).mock.calls[0]!;
      expect(fetchCall[0]).toBe("https://api.agentphone.ai/v1/messages");
      const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
      expect(body.agent_id).toBe("agent_test123");
      expect(body.to_number).toBe("+15551234567");
      expect(body.body).toBe("Hello from the bot");

      vi.restoreAllMocks();
    });

    it("throws on rate limit", async () => {
      const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Rate limited", {
          status: 429,
          headers: { "Retry-After": "30" },
        })
      );

      await expect(
        adapter.postMessage("agentphone:+1:+2", "hi")
      ).rejects.toThrow();

      vi.restoreAllMocks();
    });

    it("throws on auth error", async () => {
      const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Invalid API key" }), {
          status: 401,
        })
      );

      await expect(
        adapter.postMessage("agentphone:+1:+2", "hi")
      ).rejects.toThrow("Auth failed");

      vi.restoreAllMocks();
    });
  });

  describe("addReaction", () => {
    it("sends reaction via API", async () => {
      const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "rxn_001",
            reaction_type: "love",
            message_id: "msg_003",
            channel: "imessage",
          }),
          { status: 200 }
        )
      );

      await adapter.addReaction(
        "agentphone:+15559876543:+15551234567",
        "msg_003",
        "love"
      );

      const fetchCall = vi.mocked(fetch).mock.calls[0]!;
      expect(fetchCall[0]).toBe(
        "https://api.agentphone.ai/v1/messages/msg_003/reactions"
      );
      const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
      expect(body.reaction).toBe("love");

      vi.restoreAllMocks();
    });
  });

  describe("unsupported operations", () => {
    const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);

    it("editMessage throws NotImplementedError", async () => {
      await expect(adapter.editMessage()).rejects.toThrow();
    });

    it("deleteMessage throws NotImplementedError", async () => {
      await expect(adapter.deleteMessage()).rejects.toThrow();
    });

    it("removeReaction throws NotImplementedError", async () => {
      await expect(adapter.removeReaction()).rejects.toThrow();
    });

    it("startTyping is a no-op", async () => {
      await expect(adapter.startTyping()).resolves.toBeUndefined();
    });
  });

  describe("isDM / openDM / fetchThread", () => {
    const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);

    it("isDM returns true", () => {
      expect(adapter.isDM()).toBe(true);
    });

    it("openDM encodes thread ID", async () => {
      const threadId = await adapter.openDM("+15551234567");
      expect(threadId).toContain("+15551234567");
    });

    it("fetchThread returns thread info", async () => {
      const info = await adapter.fetchThread(
        "agentphone:+15559876543:+15551234567"
      );
      expect(info.isDM).toBe(true);
      expect(info.channelId).toBe("agentphone:+15559876543");
      expect(info.metadata).toEqual({
        recipientNumber: "+15551234567",
        agentPhoneNumber: "+15559876543",
      });
    });
  });

  describe("fetchMessages", () => {
    it("returns empty array", async () => {
      const adapter = new AgentPhoneAdapter(DEFAULT_CONFIG);
      const result = await adapter.fetchMessages("agentphone:+1:+2");
      expect(result.messages).toEqual([]);
    });
  });
});

import type { Logger } from "chat";

export interface AgentPhoneAdapterConfig {
  /** AgentPhone API key. Defaults to AGENTPHONE_API_KEY env var. */
  apiKey?: string;
  /** AgentPhone agent ID. Defaults to AGENTPHONE_AGENT_ID env var. */
  agentId?: string;
  /** Webhook signing secret for HMAC-SHA256 verification. Defaults to AGENTPHONE_WEBHOOK_SECRET env var. */
  webhookSecret?: string;
  /** Override the API base URL. Defaults to https://api.agentphone.ai */
  apiUrl?: string;
  /** Logger instance. Defaults to ConsoleLogger. */
  logger?: Logger;
  /** Override bot username. Defaults to BOT_USERNAME env var or "bot". */
  userName?: string;
}

export interface AgentPhoneThreadId {
  /** Your AgentPhone number (E.164 or email for iMessage). */
  agentPhoneNumber: string;
  /** The external participant's number/address. */
  recipientNumber: string;
}

// --- Webhook payloads (sent by AgentPhone to your app) ---

export interface AgentPhoneMessageWebhook {
  event: "agent.message";
  channel: "sms" | "mms" | "imessage";
  timestamp: string;
  agentId: string;
  data: {
    messageId: string;
    conversationId: string | null;
    numberId: string | null;
    from: string;
    to: string;
    contact: AgentPhoneContact | null;
    message: string;
    mediaUrl: string | null;
    mediaUrls: string[];
    direction: "inbound" | "outbound";
    receivedAt: string;
  };
  conversationState: Record<string, unknown> | null;
  recentHistory: AgentPhoneHistoryEntry[];
}

export interface AgentPhoneCallEndedWebhook {
  event: "agent.call_ended";
  channel: "voice";
  timestamp: string;
  agentId: string;
  data: {
    callId: string;
    numberId: string | null;
    from: string;
    to: string;
    contact: AgentPhoneContact | null;
    direction: "inbound" | "outbound" | "web";
    status: string;
    startedAt: string;
    endedAt: string;
    durationSeconds: number;
    disconnectionReason: string | null;
    transcript: AgentPhoneTranscriptEntry[];
    summary: string | null;
    userSentiment: string | null;
    callSuccessful: boolean | null;
  };
}

export interface AgentPhoneReactionWebhook {
  event: "agent.reaction";
  channel: "imessage";
  timestamp: string;
  agentId: string;
  data: {
    conversationId: string | null;
    numberId: string | null;
    reactionType: string;
    fromNumber: string;
    direction: "inbound" | "outbound";
    messageId: string;
    messageBody: string | null;
    messageMediaUrl: string | null;
    messageMediaUrls: string[];
    createdAt: string;
  };
}

export type AgentPhoneWebhookPayload =
  | AgentPhoneMessageWebhook
  | AgentPhoneCallEndedWebhook
  | AgentPhoneReactionWebhook;

export interface AgentPhoneContact {
  id: string;
  name: string | null;
  email: string | null;
  phoneNumber: string;
}

export interface AgentPhoneHistoryEntry {
  messageId: string;
  content: string;
  direction: "inbound" | "outbound";
  channel: string;
  at: string;
}

export interface AgentPhoneTranscriptEntry {
  role: "agent" | "user";
  content: string;
}

// --- API response types ---

export interface AgentPhoneSendMessageResponse {
  id: string;
  status: string;
  channel: string;
  from_number: string;
  to_number: string;
  media_urls: string[];
  reply_to_message_id: string | null;
  reply_parent_unresolved: boolean | null;
}

export interface AgentPhoneReactionResponse {
  id: string;
  reaction_type: string;
  message_id: string;
  channel: string;
}

export type AgentPhoneRawMessage =
  | AgentPhoneMessageWebhook["data"]
  | AgentPhoneCallEndedWebhook["data"];

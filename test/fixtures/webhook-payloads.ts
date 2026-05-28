import type { ChatInstance, Logger } from "chat";
import { vi } from "vitest";
import type {
  AgentPhoneCallEndedWebhook,
  AgentPhoneMessageWebhook,
  AgentPhoneReactionWebhook,
} from "../../src/types";

export const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

export function createMockChat(): ChatInstance {
  return {
    getLogger: vi.fn().mockReturnValue(mockLogger),
    getState: vi.fn(),
    getUserName: vi.fn().mockReturnValue("mybot"),
    handleIncomingMessage: vi.fn().mockResolvedValue(undefined),
    processMessage: vi.fn(),
    processReaction: vi.fn(),
    processAction: vi.fn(),
    processModalClose: vi.fn(),
    processModalSubmit: vi.fn().mockResolvedValue(undefined),
    processSlashCommand: vi.fn(),
    processAssistantThreadStarted: vi.fn(),
    processAssistantContextChanged: vi.fn(),
    processAppHomeOpened: vi.fn(),
    processMemberJoinedChannel: vi.fn(),
  } as unknown as ChatInstance;
}

export const inboundSMS: AgentPhoneMessageWebhook = {
  event: "agent.message",
  channel: "sms",
  timestamp: "2025-06-01T10:00:00Z",
  agentId: "agent_test123",
  data: {
    messageId: "msg_001",
    conversationId: "conv_abc",
    numberId: "num_xyz",
    from: "+15551234567",
    to: "+15559876543",
    contact: null,
    message: "Hello from SMS",
    mediaUrl: null,
    mediaUrls: [],
    direction: "inbound",
    receivedAt: "2025-06-01T10:00:00Z",
  },
  conversationState: null,
  recentHistory: [],
};

export const inboundMMS: AgentPhoneMessageWebhook = {
  event: "agent.message",
  channel: "mms",
  timestamp: "2025-06-01T10:01:00Z",
  agentId: "agent_test123",
  data: {
    messageId: "msg_002",
    conversationId: "conv_abc",
    numberId: "num_xyz",
    from: "+15551234567",
    to: "+15559876543",
    contact: null,
    message: "Check this out",
    mediaUrl: "https://media.agentphone.ai/img.jpg",
    mediaUrls: ["https://media.agentphone.ai/img.jpg"],
    direction: "inbound",
    receivedAt: "2025-06-01T10:01:00Z",
  },
  conversationState: null,
  recentHistory: [],
};

export const inboundIMessage: AgentPhoneMessageWebhook = {
  event: "agent.message",
  channel: "imessage",
  timestamp: "2025-06-01T10:02:00Z",
  agentId: "agent_test123",
  data: {
    messageId: "msg_003",
    conversationId: "conv_def",
    numberId: "num_xyz",
    from: "+15551234567",
    to: "+15559876543",
    contact: {
      id: "contact_abc",
      name: "Jane Doe",
      email: "jane@example.com",
      phoneNumber: "+15551234567",
    },
    message: "Hey from iMessage!",
    mediaUrl: null,
    mediaUrls: [],
    direction: "inbound",
    receivedAt: "2025-06-01T10:02:00Z",
  },
  conversationState: { orderId: "ORD-999" },
  recentHistory: [
    {
      messageId: "msg_000",
      content: "Welcome!",
      direction: "outbound",
      channel: "imessage",
      at: "2025-06-01T09:59:00Z",
    },
  ],
};

export const outboundMessage: AgentPhoneMessageWebhook = {
  event: "agent.message",
  channel: "sms",
  timestamp: "2025-06-01T10:03:00Z",
  agentId: "agent_test123",
  data: {
    messageId: "msg_004",
    conversationId: "conv_abc",
    numberId: "num_xyz",
    from: "+15559876543",
    to: "+15551234567",
    contact: null,
    message: "Thanks for reaching out!",
    mediaUrl: null,
    mediaUrls: [],
    direction: "outbound",
    receivedAt: "2025-06-01T10:03:00Z",
  },
  conversationState: null,
  recentHistory: [],
};

export const callEnded: AgentPhoneCallEndedWebhook = {
  event: "agent.call_ended",
  channel: "voice",
  timestamp: "2025-06-01T10:10:00Z",
  agentId: "agent_test123",
  data: {
    callId: "call_abc",
    numberId: "num_xyz",
    from: "+15551234567",
    to: "+15559876543",
    contact: null,
    direction: "inbound",
    status: "completed",
    startedAt: "2025-06-01T10:05:00Z",
    endedAt: "2025-06-01T10:10:00Z",
    durationSeconds: 300,
    disconnectionReason: "user_hangup",
    transcript: [
      { role: "agent", content: "Hello, how can I help?" },
      { role: "user", content: "Where is my order?" },
      { role: "agent", content: "Let me check that for you." },
    ],
    summary: "Customer asked about order status.",
    userSentiment: "Neutral",
    callSuccessful: true,
  },
};

export const inboundReaction: AgentPhoneReactionWebhook = {
  event: "agent.reaction",
  channel: "imessage",
  timestamp: "2025-06-01T10:04:00Z",
  agentId: "agent_test123",
  data: {
    conversationId: "conv_def",
    numberId: "num_xyz",
    reactionType: "love",
    fromNumber: "+15551234567",
    direction: "inbound",
    messageId: "msg_003",
    messageBody: "Hey from iMessage!",
    messageMediaUrl: null,
    messageMediaUrls: [],
    createdAt: "2025-06-01T10:04:00Z",
  },
};

# @agentphone/chat-sdk-adapter

[AgentPhone](https://agentphone.to) adapter for [Chat SDK](https://chat-sdk.dev) — the first adapter with SMS, MMS, iMessage, and voice call support.

## Features

| Feature | SMS | MMS | iMessage | Voice |
| --- | --- | --- | --- | --- |
| Send messages | Yes | Yes | Yes | — |
| Receive messages | Yes | Yes | Yes | — |
| Media attachments | — | Yes | Yes | — |
| Reactions | — | — | Yes | — |
| Call transcripts | — | — | — | Yes |
| Call summaries | — | — | — | Yes |

## Install

```bash
npm install @agentphone/chat-sdk-adapter chat
```

## Quick start

```typescript
import { Chat } from "chat";
import { createAgentPhoneAdapter } from "@agentphone/chat-sdk-adapter";

const chat = new Chat({
  adapter: createAgentPhoneAdapter({
    apiKey: process.env.AGENTPHONE_API_KEY,
    agentId: process.env.AGENTPHONE_AGENT_ID,
    webhookSecret: process.env.AGENTPHONE_WEBHOOK_SECRET,
  }),

  onNewMention: async ({ message, reply }) => {
    // Handles SMS, MMS, iMessage, and voice call transcripts
    await reply(`Got your message: ${message.text}`);
  },
});

// In your HTTP server (Express, Hono, Next.js, etc.)
app.post("/webhook/agentphone", (req) => chat.webhooks.agentphone(req));
```

## Configuration

| Option | Env var | Required | Description |
| --- | --- | --- | --- |
| `apiKey` | `AGENTPHONE_API_KEY` | Yes | Your AgentPhone API key |
| `agentId` | `AGENTPHONE_AGENT_ID` | Yes | Agent ID to send messages from |
| `webhookSecret` | `AGENTPHONE_WEBHOOK_SECRET` | No | HMAC-SHA256 webhook signing secret |
| `apiUrl` | — | No | API base URL (default: `https://api.agentphone.ai`) |
| `userName` | `BOT_USERNAME` | No | Bot display name (default: `"bot"`) |

## Webhook events

The adapter handles three webhook event types from AgentPhone:

- **`agent.message`** — Inbound SMS, MMS, or iMessage. Routed to `onNewMention`.
- **`agent.call_ended`** — Voice call completed with full transcript and summary. Routed to `onNewMention` as a message containing the transcript.
- **`agent.reaction`** — iMessage tapback reaction (love, like, laugh, etc.). Routed to `onReaction`.

## Webhook verification

All AgentPhone webhooks are signed with HMAC-SHA256. Set `webhookSecret` to enable verification. The adapter checks:

1. `X-Webhook-Signature` header matches the HMAC of `{timestamp}.{body}`
2. `X-Webhook-Timestamp` is within 5 minutes (replay protection)

## iMessage reactions

AgentPhone is the only Chat SDK adapter that supports iMessage reactions:

```typescript
// Send a tapback reaction
await adapter.addReaction(threadId, messageId, "love");
// Supported: love, like, dislike, laugh, emphasize, question
// Custom emoji also supported on newer devices: "🔥", "😂", etc.
```

## Links

- [AgentPhone docs](https://docs.agentphone.to)
- [Chat SDK docs](https://chat-sdk.dev)
- [GitHub](https://github.com/agentphone/chat-sdk-adapter)

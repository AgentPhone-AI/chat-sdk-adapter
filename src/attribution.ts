import { createRequire } from "node:module";

export const ADAPTER_NAME = "@agentphone/chat-sdk-adapter";

const pkg = createRequire(import.meta.url)("../package.json") as {
  version: string;
};
export const ADAPTER_VERSION = pkg.version;

export const ADAPTER_MARKER = "vercel-chat-sdk";
export const USER_AGENT = `${ADAPTER_NAME}/${ADAPTER_VERSION} (${ADAPTER_MARKER})`;

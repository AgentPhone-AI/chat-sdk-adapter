import { AgentPhoneAdapter } from "./adapter";
import type { AgentPhoneAdapterConfig } from "./types";

export function createAgentPhoneAdapter(
  config?: AgentPhoneAdapterConfig
): AgentPhoneAdapter {
  return new AgentPhoneAdapter(config);
}

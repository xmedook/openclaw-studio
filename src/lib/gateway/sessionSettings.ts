import type { GatewayClient } from "@/lib/gateway/GatewayClient";

type SessionSettingsPatchPayload = {
  key: string;
  model?: string | null;
  thinkingLevel?: string | null;
};

export type SyncGatewaySessionSettingsParams = {
  client: GatewayClient;
  sessionKey: string;
  model?: string | null;
  thinkingLevel?: string | null;
};

export const syncGatewaySessionSettings = async ({
  client,
  sessionKey,
  model,
  thinkingLevel,
}: SyncGatewaySessionSettingsParams) => {
  const key = sessionKey.trim();
  if (!key) {
    throw new Error("Session key is required.");
  }
  const includeModel = model !== undefined;
  const includeThinkingLevel = thinkingLevel !== undefined;
  if (!includeModel && !includeThinkingLevel) {
    throw new Error("At least one session setting must be provided.");
  }
  const payload: SessionSettingsPatchPayload = { key };
  if (includeModel) {
    payload.model = model ?? null;
  }
  if (includeThinkingLevel) {
    payload.thinkingLevel = thinkingLevel ?? null;
  }
  await client.call("sessions.patch", payload);
};

import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import { syncGatewaySessionSettings } from "@/lib/gateway/sessionSettings";

type SessionSettingField = "model" | "thinkingLevel";

type AgentSessionState = {
  agentId: string;
  sessionCreated: boolean;
};

type SessionSettingsDispatchAction =
  | {
      type: "updateAgent";
      agentId: string;
      patch: {
        model?: string | null;
        thinkingLevel?: string | null;
        sessionSettingsSynced?: boolean;
      };
    }
  | {
      type: "appendOutput";
      agentId: string;
      line: string;
    };

type SessionSettingsDispatch = (action: SessionSettingsDispatchAction) => void;

export type ApplySessionSettingMutationParams = {
  agents: AgentSessionState[];
  dispatch: SessionSettingsDispatch;
  client: GatewayClient;
  agentId: string;
  sessionKey: string;
  field: SessionSettingField;
  value: string | null;
};

const buildFallbackError = (field: SessionSettingField) =>
  field === "model" ? "Failed to set model." : "Failed to set thinking level.";

const buildErrorPrefix = (field: SessionSettingField) =>
  field === "model" ? "Model update failed" : "Thinking update failed";

export const applySessionSettingMutation = async ({
  agents,
  dispatch,
  client,
  agentId,
  sessionKey,
  field,
  value,
}: ApplySessionSettingMutationParams) => {
  dispatch({
    type: "updateAgent",
    agentId,
    patch: {
      [field]: value,
      sessionSettingsSynced: false,
    },
  });
  const agent = agents.find((entry) => entry.agentId === agentId);
  if (!agent?.sessionCreated) return;
  try {
    await syncGatewaySessionSettings({
      client,
      sessionKey,
      ...(field === "model" ? { model: value ?? null } : { thinkingLevel: value ?? null }),
    });
    dispatch({
      type: "updateAgent",
      agentId,
      patch: { sessionSettingsSynced: true },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : buildFallbackError(field);
    dispatch({
      type: "appendOutput",
      agentId,
      line: `${buildErrorPrefix(field)}: ${msg}`,
    });
  }
};

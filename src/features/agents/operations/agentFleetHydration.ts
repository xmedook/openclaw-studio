import { buildAgentMainSessionKey, isSameSessionKey } from "@/lib/gateway/GatewayClient";
import { resolveConfiguredModelKey, type GatewayModelPolicySnapshot } from "@/lib/gateway/models";
import { resolveAgentAvatarSeed, type StudioSettings } from "@/lib/studio/settings";
import {
  buildSummarySnapshotPatches,
  type SummaryPreviewSnapshot,
  type SummarySnapshotAgent,
  type SummarySnapshotPatch,
  type SummaryStatusSnapshot,
} from "@/features/agents/state/runtimeEventBridge";
import type { AgentStoreSeed } from "@/features/agents/state/store";

type GatewayClientLike = {
  call: (method: string, params: unknown) => Promise<unknown>;
};

type AgentsListResult = {
  defaultId: string;
  mainKey: string;
  scope?: string;
  agents: Array<{
    id: string;
    name?: string;
    identity?: {
      name?: string;
      theme?: string;
      emoji?: string;
      avatar?: string;
      avatarUrl?: string;
    };
  }>;
};

type SessionsListEntry = {
  key: string;
  updatedAt?: number | null;
  displayName?: string;
  origin?: { label?: string | null; provider?: string | null } | null;
  thinkingLevel?: string;
  modelProvider?: string;
  model?: string;
};

type SessionsListResult = {
  sessions?: SessionsListEntry[];
};

const resolveAgentName = (agent: AgentsListResult["agents"][number]) => {
  const fromList = typeof agent.name === "string" ? agent.name.trim() : "";
  if (fromList) return fromList;
  const fromIdentity = typeof agent.identity?.name === "string" ? agent.identity.name.trim() : "";
  if (fromIdentity) return fromIdentity;
  return agent.id;
};

const resolveAgentAvatarUrl = (agent: AgentsListResult["agents"][number]) => {
  const candidate = agent.identity?.avatarUrl ?? agent.identity?.avatar ?? null;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("data:image/")) return trimmed;
  return null;
};

const resolveDefaultModelForAgent = (
  agentId: string,
  snapshot: GatewayModelPolicySnapshot | null
): string | null => {
  const resolvedAgentId = agentId.trim();
  if (!resolvedAgentId) return null;
  const defaults = snapshot?.config?.agents?.defaults;
  const modelAliases = defaults?.models;
  const agentEntry =
    snapshot?.config?.agents?.list?.find((entry) => entry?.id?.trim() === resolvedAgentId) ??
    null;
  const agentModel = agentEntry?.model;
  let raw: string | null = null;
  if (typeof agentModel === "string") {
    raw = agentModel;
  } else if (agentModel && typeof agentModel === "object") {
    raw = agentModel.primary ?? null;
  }
  if (!raw) {
    const defaultModel = defaults?.model;
    if (typeof defaultModel === "string") {
      raw = defaultModel;
    } else if (defaultModel && typeof defaultModel === "object") {
      raw = defaultModel.primary ?? null;
    }
  }
  if (!raw) return null;
  return resolveConfiguredModelKey(raw, modelAliases);
};

export type HydrateAgentFleetResult = {
  seeds: AgentStoreSeed[];
  sessionCreatedAgentIds: string[];
  summaryPatches: SummarySnapshotPatch[];
  suggestedSelectedAgentId: string | null;
  configSnapshot: GatewayModelPolicySnapshot | null;
};

export async function hydrateAgentFleetFromGateway(params: {
  client: GatewayClientLike;
  gatewayUrl: string;
  cachedConfigSnapshot: GatewayModelPolicySnapshot | null;
  loadStudioSettings: () => Promise<StudioSettings | null>;
  isDisconnectLikeError: (err: unknown) => boolean;
  logError?: (message: string, error: unknown) => void;
}): Promise<HydrateAgentFleetResult> {
  const logError = params.logError ?? ((message, error) => console.error(message, error));

  let configSnapshot = params.cachedConfigSnapshot;
  if (!configSnapshot) {
    try {
      configSnapshot = (await params.client.call(
        "config.get",
        {}
      )) as GatewayModelPolicySnapshot;
    } catch (err) {
      if (!params.isDisconnectLikeError(err)) {
        logError("Failed to load gateway config while loading agents.", err);
      }
    }
  }

  const gatewayKey = params.gatewayUrl.trim();
  let settings: StudioSettings | null = null;
  if (gatewayKey) {
    try {
      settings = await params.loadStudioSettings();
    } catch (err) {
      logError("Failed to load studio settings while loading agents.", err);
    }
  }

  const agentsResult = (await params.client.call("agents.list", {})) as AgentsListResult;
  const mainKey = agentsResult.mainKey?.trim() || "main";

  const mainSessionKeyByAgent = new Map<string, SessionsListEntry | null>();
  await Promise.all(
    agentsResult.agents.map(async (agent) => {
      try {
        const expectedMainKey = buildAgentMainSessionKey(agent.id, mainKey);
        const sessions = (await params.client.call("sessions.list", {
          agentId: agent.id,
          includeGlobal: false,
          includeUnknown: false,
          search: expectedMainKey,
          limit: 4,
        })) as SessionsListResult;
        const entries = Array.isArray(sessions.sessions) ? sessions.sessions : [];
        const mainEntry =
          entries.find((entry) => isSameSessionKey(entry.key ?? "", expectedMainKey)) ?? null;
        mainSessionKeyByAgent.set(agent.id, mainEntry);
      } catch (err) {
        if (!params.isDisconnectLikeError(err)) {
          logError("Failed to list sessions while resolving agent session.", err);
        }
        mainSessionKeyByAgent.set(agent.id, null);
      }
    })
  );

  const seeds: AgentStoreSeed[] = agentsResult.agents.map((agent) => {
    const persistedSeed = settings && gatewayKey ? resolveAgentAvatarSeed(settings, gatewayKey, agent.id) : null;
    const avatarSeed = persistedSeed ?? agent.id;
    const avatarUrl = resolveAgentAvatarUrl(agent);
    const name = resolveAgentName(agent);
    const mainSession = mainSessionKeyByAgent.get(agent.id) ?? null;
    const modelProvider = typeof mainSession?.modelProvider === "string" ? mainSession.modelProvider.trim() : "";
    const modelId = typeof mainSession?.model === "string" ? mainSession.model.trim() : "";
    const model =
      modelProvider && modelId
        ? `${modelProvider}/${modelId}`
        : resolveDefaultModelForAgent(agent.id, configSnapshot);
    const thinkingLevel = typeof mainSession?.thinkingLevel === "string" ? mainSession.thinkingLevel : null;
    return {
      agentId: agent.id,
      name,
      sessionKey: buildAgentMainSessionKey(agent.id, mainKey),
      avatarSeed,
      avatarUrl,
      model,
      thinkingLevel,
    };
  });

  const sessionCreatedAgentIds: string[] = [];
  for (const seed of seeds) {
    const mainSession = mainSessionKeyByAgent.get(seed.agentId) ?? null;
    if (!mainSession) continue;
    sessionCreatedAgentIds.push(seed.agentId);
  }

  let summaryPatches: SummarySnapshotPatch[] = [];
  let suggestedSelectedAgentId: string | null = null;
  try {
    const activeAgents: SummarySnapshotAgent[] = [];
    for (const seed of seeds) {
      const mainSession = mainSessionKeyByAgent.get(seed.agentId) ?? null;
      if (!mainSession) continue;
      activeAgents.push({
        agentId: seed.agentId,
        sessionKey: seed.sessionKey,
        status: "idle",
      });
    }
    const sessionKeys = Array.from(
      new Set(
        activeAgents
          .map((agent) => agent.sessionKey)
          .filter((key): key is string => typeof key === "string" && key.trim().length > 0)
      )
    ).slice(0, 64);
    if (sessionKeys.length > 0) {
      const [statusSummary, previewResult] = await Promise.all([
        params.client.call("status", {}) as Promise<SummaryStatusSnapshot>,
        params.client.call("sessions.preview", {
          keys: sessionKeys,
          limit: 8,
          maxChars: 240,
        }) as Promise<SummaryPreviewSnapshot>,
      ]);
      summaryPatches = buildSummarySnapshotPatches({
        agents: activeAgents,
        statusSummary,
        previewResult,
      });

      const assistantAtByAgentId = new Map<string, number>();
      for (const entry of summaryPatches) {
        if (typeof entry.patch.lastAssistantMessageAt === "number") {
          assistantAtByAgentId.set(entry.agentId, entry.patch.lastAssistantMessageAt);
        }
      }

      let bestAgentId: string | null = seeds[0]?.agentId ?? null;
      let bestTs = bestAgentId ? (assistantAtByAgentId.get(bestAgentId) ?? 0) : 0;
      for (const seed of seeds) {
        const ts = assistantAtByAgentId.get(seed.agentId) ?? 0;
        if (ts <= bestTs) continue;
        bestTs = ts;
        bestAgentId = seed.agentId;
      }
      suggestedSelectedAgentId = bestAgentId;
    }
  } catch (err) {
    if (!params.isDisconnectLikeError(err)) {
      logError("Failed to load initial summary snapshot.", err);
    }
  }

  return {
    seeds,
    sessionCreatedAgentIds,
    summaryPatches,
    suggestedSelectedAgentId,
    configSnapshot: configSnapshot ?? null,
  };
}


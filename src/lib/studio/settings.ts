export type StudioAgentLayout = {
  position: { x: number; y: number };
  size: { width: number; height: number };
  avatarSeed?: string | null;
};

export type StudioGatewayLayout = {
  agents: Record<string, StudioAgentLayout>;
};

export type StudioGatewaySettings = {
  url: string;
  token: string;
};

export type FocusFilter = "all" | "needs-attention" | "running" | "idle";
export type StudioViewMode = "focused" | "canvas";

export type StudioFocusedPreference = {
  mode: StudioViewMode;
  selectedAgentId: string | null;
  filter: FocusFilter;
};

export type StudioSettings = {
  version: 1;
  gateway: StudioGatewaySettings | null;
  layouts: Record<string, StudioGatewayLayout>;
  focused: Record<string, StudioFocusedPreference>;
};

export type StudioSettingsPatch = {
  gateway?: StudioGatewaySettings | null;
  layouts?: Record<string, StudioGatewayLayout>;
  focused?: Record<string, Partial<StudioFocusedPreference> | null>;
};

const SETTINGS_VERSION = 1 as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");

const coerceString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const coerceNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeGatewayKey = (value: unknown) => {
  const key = coerceString(value);
  return key ? key : null;
};

const normalizeFocusFilter = (
  value: unknown,
  fallback: FocusFilter = "all"
): FocusFilter => {
  const filter = coerceString(value);
  if (
    filter === "all" ||
    filter === "needs-attention" ||
    filter === "running" ||
    filter === "idle"
  ) {
    return filter;
  }
  return fallback;
};

const normalizeViewMode = (
  value: unknown,
  fallback: StudioViewMode = "focused"
): StudioViewMode => {
  const mode = coerceString(value);
  if (mode === "focused" || mode === "canvas") {
    return mode;
  }
  return fallback;
};

const normalizeSelectedAgentId = (value: unknown, fallback: string | null = null) => {
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const defaultFocusedPreference = (): StudioFocusedPreference => ({
  mode: "focused",
  selectedAgentId: null,
  filter: "all",
});

const normalizeFocusedPreference = (
  value: unknown,
  fallback: StudioFocusedPreference = defaultFocusedPreference()
): StudioFocusedPreference => {
  if (!isRecord(value)) return fallback;
  return {
    mode: normalizeViewMode(value.mode, fallback.mode),
    selectedAgentId: normalizeSelectedAgentId(
      value.selectedAgentId,
      fallback.selectedAgentId
    ),
    filter: normalizeFocusFilter(value.filter, fallback.filter),
  };
};

const normalizeGatewaySettings = (value: unknown): StudioGatewaySettings | null => {
  if (!isRecord(value)) return null;
  const url = coerceString(value.url);
  if (!url) return null;
  const token = coerceString(value.token);
  return { url, token };
};

const normalizeAgentLayout = (value: unknown): StudioAgentLayout | null => {
  if (!isRecord(value)) return null;
  const position = value.position;
  const size = value.size;
  if (!isRecord(position) || !isRecord(size)) return null;
  const x = coerceNumber(position.x);
  const y = coerceNumber(position.y);
  const width = coerceNumber(size.width);
  const height = coerceNumber(size.height);
  if (x === null || y === null || width === null || height === null) return null;
  const avatarSeedRaw = value.avatarSeed;
  const avatarSeed =
    typeof avatarSeedRaw === "string"
      ? avatarSeedRaw
      : avatarSeedRaw === null
        ? null
        : undefined;
  return {
    position: { x, y },
    size: { width, height },
    ...(avatarSeed !== undefined ? { avatarSeed } : {}),
  };
};

const normalizeGatewayLayout = (value: unknown): StudioGatewayLayout => {
  if (!isRecord(value)) return { agents: {} };
  const agentsRaw = value.agents;
  if (!isRecord(agentsRaw)) return { agents: {} };
  const agents: Record<string, StudioAgentLayout> = {};
  for (const [agentIdRaw, agentLayout] of Object.entries(agentsRaw)) {
    const agentId = coerceString(agentIdRaw);
    if (!agentId) continue;
    const normalized = normalizeAgentLayout(agentLayout);
    if (!normalized) continue;
    agents[agentId] = normalized;
  }
  return { agents };
};

const normalizeLayouts = (value: unknown): Record<string, StudioGatewayLayout> => {
  if (!isRecord(value)) return {};
  const layouts: Record<string, StudioGatewayLayout> = {};
  for (const [gatewayKeyRaw, layoutRaw] of Object.entries(value)) {
    const gatewayKey = normalizeGatewayKey(gatewayKeyRaw);
    if (!gatewayKey) continue;
    layouts[gatewayKey] = normalizeGatewayLayout(layoutRaw);
  }
  return layouts;
};

const normalizeFocused = (value: unknown): Record<string, StudioFocusedPreference> => {
  if (!isRecord(value)) return {};
  const focused: Record<string, StudioFocusedPreference> = {};
  for (const [gatewayKeyRaw, focusedRaw] of Object.entries(value)) {
    const gatewayKey = normalizeGatewayKey(gatewayKeyRaw);
    if (!gatewayKey) continue;
    focused[gatewayKey] = normalizeFocusedPreference(focusedRaw);
  }
  return focused;
};

export const defaultStudioSettings = (): StudioSettings => ({
  version: SETTINGS_VERSION,
  gateway: null,
  layouts: {},
  focused: {},
});

export const normalizeStudioSettings = (raw: unknown): StudioSettings => {
  if (!isRecord(raw)) return defaultStudioSettings();
  const gateway = normalizeGatewaySettings(raw.gateway);
  const layouts = normalizeLayouts(raw.layouts);
  const focused = normalizeFocused(raw.focused);
  return {
    version: SETTINGS_VERSION,
    gateway,
    layouts,
    focused,
  };
};

export const mergeStudioSettings = (
  current: StudioSettings,
  patch: StudioSettingsPatch
): StudioSettings => {
  const nextGateway =
    patch.gateway === undefined ? current.gateway : normalizeGatewaySettings(patch.gateway);
  const nextLayouts = { ...current.layouts };
  const nextFocused = { ...current.focused };
  if (patch.layouts) {
    const normalizedLayouts = normalizeLayouts(patch.layouts);
    for (const [key, value] of Object.entries(normalizedLayouts)) {
      const existing = nextLayouts[key]?.agents ?? {};
      nextLayouts[key] = { agents: { ...existing, ...value.agents } };
    }
  }
  if (patch.focused) {
    for (const [keyRaw, value] of Object.entries(patch.focused)) {
      const key = normalizeGatewayKey(keyRaw);
      if (!key) continue;
      if (value === null) {
        delete nextFocused[key];
        continue;
      }
      const fallback = nextFocused[key] ?? defaultFocusedPreference();
      nextFocused[key] = normalizeFocusedPreference(value, fallback);
    }
  }
  return {
    version: SETTINGS_VERSION,
    gateway: nextGateway ?? null,
    layouts: nextLayouts,
    focused: nextFocused,
  };
};

export const resolveGatewayLayout = (
  settings: StudioSettings,
  gatewayUrl: string
): StudioGatewayLayout | null => {
  const key = normalizeGatewayKey(gatewayUrl);
  if (!key) return null;
  return settings.layouts[key] ?? null;
};

export const resolveFocusedPreference = (
  settings: StudioSettings,
  gatewayUrl: string
): StudioFocusedPreference | null => {
  const key = normalizeGatewayKey(gatewayUrl);
  if (!key) return null;
  return settings.focused[key] ?? null;
};

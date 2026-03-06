"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import type { GatewayStatus } from "@/lib/gateway/gateway-status";
import { fetchJson } from "@/lib/http";
import {
  defaultStudioInstallContext,
  type StudioInstallContext,
} from "@/lib/studio/install-context";
import {
  defaultStudioSettings,
  type StudioGatewaySettings,
  type StudioSettings,
  type StudioSettingsPatch,
} from "@/lib/studio/settings";
import type { StudioSettingsResponse } from "@/lib/studio/coordinator";

const DEFAULT_UPSTREAM_GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL || "ws://localhost:18789";

const removedGatewayClient: GatewayClient = {
  call: async () => {
    throw new Error("Browser gateway transport has been removed. Use Studio domain APIs.");
  },
  onEvent: () => () => {},
  onGap: () => () => {},
};

const normalizeLocalGatewayDefaults = (value: unknown): StudioGatewaySettings | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as { url?: unknown; token?: unknown };
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  if (!url) return null;
  return { url, token };
};

const formatGatewayError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Unknown gateway error.";
};

type RuntimeSummaryEnvelope = {
  summary?: {
    status?: unknown;
    reason?: unknown;
  } | null;
  error?: unknown;
};

const mapRuntimeStatusToGatewayStatus = (value: unknown): GatewayStatus => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "connected") return "connected";
  if (normalized === "connecting") return "connecting";
  if (normalized === "reconnecting") return "reconnecting";
  if (normalized === "error") return "error";
  return "disconnected";
};

type TestConnectionResponse = {
  ok?: unknown;
  error?: unknown;
};

type StudioSettingsCoordinatorLike = {
  loadSettings: () => Promise<StudioSettings | null>;
  loadSettingsEnvelope?: () => Promise<StudioSettingsResponse>;
  flushPending: () => Promise<void>;
};

type StudioGatewaySettingsState = {
  client: GatewayClient;
  status: GatewayStatus;
  statusReason: string | null;
  gatewayUrl: string;
  draftGatewayUrl: string;
  token: string;
  localGatewayDefaults: StudioGatewaySettings | null;
  localGatewayDefaultsHasToken: boolean;
  hasStoredToken: boolean;
  hasUnsavedChanges: boolean;
  installContext: StudioInstallContext;
  domainApiModeEnabled: boolean;
  error: string | null;
  testResult:
    | {
        kind: "success" | "error";
        message: string;
      }
    | null;
  saving: boolean;
  testing: boolean;
  saveSettings: () => Promise<boolean>;
  testConnection: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  useLocalGatewayDefaults: () => void;
  setGatewayUrl: (value: string) => void;
  setToken: (value: string) => void;
  applyRuntimeStatusEvent: (event: { status?: unknown; reason?: unknown } | null) => void;
  clearError: () => void;
};

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const fetchRuntimeSummaryEnvelope = async (): Promise<RuntimeSummaryEnvelope> => {
  const response = await fetch("/api/runtime/summary", {
    cache: "no-store",
  });
  const text = await response.text();
  let data: RuntimeSummaryEnvelope = {};
  if (text) {
    try {
      data = JSON.parse(text) as RuntimeSummaryEnvelope;
    } catch {
      data = {};
    }
  }
  if (!response.ok && !readString(data.error)) {
    throw new Error(`Request failed with status ${response.status}.`);
  }
  return data;
};

export const useStudioGatewaySettings = (
  settingsCoordinator: StudioSettingsCoordinatorLike
): StudioGatewaySettingsState => {
  const [gatewayUrl, setGatewayUrlState] = useState(DEFAULT_UPSTREAM_GATEWAY_URL);
  const [draftGatewayUrl, setDraftGatewayUrlState] = useState(DEFAULT_UPSTREAM_GATEWAY_URL);
  const [token, setTokenState] = useState("");
  const [localGatewayDefaults, setLocalGatewayDefaults] = useState<StudioGatewaySettings | null>(
    null
  );
  const [localGatewayDefaultsHasToken, setLocalGatewayDefaultsHasToken] = useState(false);
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [installContext, setInstallContext] = useState<StudioInstallContext>(
    defaultStudioInstallContext()
  );
  const domainApiModeEnabled = true;
  const [status, setStatus] = useState<GatewayStatus>("disconnected");
  const [statusReason, setStatusReason] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const manualDisconnectRef = useRef(false);
  const didAutoConnectRef = useRef(false);
  const error = actionError ?? connectionError;

  const clearError = useCallback(() => {
    setActionError(null);
    setConnectionError(null);
    setTestResult(null);
  }, []);

  const applyRuntimeSummary = useCallback((summary: RuntimeSummaryEnvelope) => {
    const nextStatus = mapRuntimeStatusToGatewayStatus(summary?.summary?.status);
    const nextReason = readString(summary?.summary?.reason);
    const nextError = readString(summary?.error);
    setStatus(nextStatus);
    setStatusReason(nextReason || null);
    if (nextStatus === "error") {
      setConnectionError(nextReason || nextError || "Gateway connection failed.");
      return;
    }
    if (nextStatus === "disconnected" && nextError) {
      setConnectionError(nextError);
      return;
    }
    setConnectionError(null);
  }, []);

  const applyRuntimeStatusEvent = useCallback(
    (event: { status?: unknown; reason?: unknown } | null) => {
      const nextStatus = mapRuntimeStatusToGatewayStatus(event?.status);
      const nextReason = readString(event?.reason);
      setStatus(nextStatus);
      setStatusReason(nextReason || null);
      if (nextStatus === "error") {
        setConnectionError(nextReason || "Gateway connection failed.");
        return;
      }
      if (nextStatus === "connected") {
        setConnectionError(null);
        return;
      }
      if (nextStatus === "connecting" || nextStatus === "reconnecting") {
        setConnectionError(null);
        return;
      }
      if (nextStatus === "disconnected" && manualDisconnectRef.current) {
        setConnectionError(null);
        return;
      }
      if (nextStatus === "disconnected" && !nextReason) {
        setConnectionError(null);
      }
    },
    []
  );

  const refreshRuntimeStatus = useCallback(async () => {
    const summary = await fetchRuntimeSummaryEnvelope();
    applyRuntimeSummary(summary);
    return summary;
  }, [applyRuntimeSummary]);

  const applySettingsEnvelope = useCallback(
    (
      envelope: StudioSettingsResponse,
      options: {
        resetDraft: boolean;
      } = { resetDraft: true }
    ) => {
      const settings = envelope.settings ?? null;
      const gateway = settings?.gateway ?? null;
      const nextUrl = gateway?.url?.trim() ? gateway.url : DEFAULT_UPSTREAM_GATEWAY_URL;
      setGatewayUrlState(nextUrl);
      setHasStoredToken(Boolean(envelope.gatewayMeta?.hasStoredToken));
      setLocalGatewayDefaults(normalizeLocalGatewayDefaults(envelope.localGatewayDefaults));
      setLocalGatewayDefaultsHasToken(Boolean(envelope.localGatewayDefaultsMeta?.hasToken));
      setInstallContext(envelope.installContext ?? defaultStudioInstallContext());
      if (options.resetDraft) {
        setDraftGatewayUrlState(nextUrl);
        setTokenState("");
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const envelope =
          typeof settingsCoordinator.loadSettingsEnvelope === "function"
            ? await settingsCoordinator.loadSettingsEnvelope()
            : {
                settings: (await settingsCoordinator.loadSettings()) ?? defaultStudioSettings(),
                localGatewayDefaults: null,
              };
        if (cancelled) return;
        applySettingsEnvelope(envelope);
      } catch (nextError) {
        if (!cancelled) {
          setActionError(formatGatewayError(nextError));
        }
      } finally {
        if (!cancelled) {
          setSettingsLoaded(true);
        }
      }
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [applySettingsEnvelope, settingsCoordinator]);

  const saveSettings = useCallback(async () => {
    const trimmedGatewayUrl = draftGatewayUrl.trim();
    const trimmedToken = token.trim();
    const canUseExistingToken = hasStoredToken || localGatewayDefaultsHasToken;
    if (!trimmedGatewayUrl) {
      setActionError("Gateway URL is required.");
      setTestResult(null);
      return false;
    }
    if (!trimmedToken && !canUseExistingToken) {
      setActionError("Gateway token is required. Enter one or keep the stored token.");
      setTestResult(null);
      return false;
    }
    setSaving(true);
    setActionError(null);
    setTestResult(null);
    setStatus("connecting");
    setStatusReason(null);
    setConnectionError(null);
    manualDisconnectRef.current = true;
    didAutoConnectRef.current = true;
    try {
      await settingsCoordinator.flushPending();
      const patch: StudioSettingsPatch = {
        gateway: trimmedToken
          ? { url: trimmedGatewayUrl, token: trimmedToken }
          : { url: trimmedGatewayUrl },
      };
      const envelope = await fetchJson<StudioSettingsResponse>("/api/studio", {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      manualDisconnectRef.current = false;
      applySettingsEnvelope(envelope);
      await refreshRuntimeStatus();
      return true;
    } catch (nextError) {
      manualDisconnectRef.current = false;
      const message = formatGatewayError(nextError);
      setStatus("error");
      setStatusReason(message);
      setActionError(message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    applySettingsEnvelope,
    draftGatewayUrl,
    hasStoredToken,
    localGatewayDefaultsHasToken,
    refreshRuntimeStatus,
    settingsCoordinator,
    token,
  ]);

  const testConnection = useCallback(async () => {
    const trimmedGatewayUrl = draftGatewayUrl.trim();
    if (!trimmedGatewayUrl) {
      setActionError("Gateway URL is required.");
      setTestResult(null);
      return false;
    }
    setTesting(true);
    setActionError(null);
    setTestResult(null);
    try {
      const response = await fetchJson<TestConnectionResponse>("/api/studio/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway: {
            url: trimmedGatewayUrl,
            token: token.trim(),
          },
          useStoredToken: token.trim().length === 0,
        }),
      });
      if (response.ok !== true) {
        const message = readString(response.error) || "Connection test failed.";
        setActionError(message);
        setTestResult({ kind: "error", message });
        return false;
      }
      setTestResult({
        kind: "success",
        message: "Connection test succeeded. Save settings to use this upstream.",
      });
      return true;
    } catch (nextError) {
      const message = formatGatewayError(nextError);
      setActionError(message);
      setTestResult({ kind: "error", message });
      return false;
    } finally {
      setTesting(false);
    }
  }, [draftGatewayUrl, token]);

  const disconnect = useCallback(async () => {
    manualDisconnectRef.current = true;
    setActionError(null);
    setTestResult(null);
    setStatus("disconnected");
    setStatusReason(null);
    setConnectionError(null);
    try {
      const summary = await fetchJson<RuntimeSummaryEnvelope>("/api/runtime/disconnect", {
        method: "POST",
      });
      applyRuntimeSummary(summary);
    } catch (nextError) {
      const message = formatGatewayError(nextError);
      setStatus("error");
      setStatusReason(message);
      setActionError(message);
    }
  }, [applyRuntimeSummary]);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (manualDisconnectRef.current) return;
    if (didAutoConnectRef.current) return;
    if (status !== "disconnected") return;
    if (!gatewayUrl.trim()) return;
    didAutoConnectRef.current = true;
    setStatus("connecting");
    setStatusReason(null);
    setConnectionError(null);
    void refreshRuntimeStatus().catch((nextError) => {
      const message = formatGatewayError(nextError);
      setStatus("error");
      setStatusReason(message);
      setConnectionError(message);
    });
  }, [gatewayUrl, refreshRuntimeStatus, settingsLoaded, status]);

  const setGatewayUrl = useCallback(
    (value: string) => {
      setDraftGatewayUrlState(value);
      setActionError(null);
      setTestResult(null);
    },
    []
  );

  const setToken = useCallback(
    (value: string) => {
      setTokenState(value);
      setActionError(null);
      setTestResult(null);
    },
    []
  );

  const useLocalGatewayDefaults = useCallback(() => {
    if (!localGatewayDefaults) return;
    setDraftGatewayUrlState(localGatewayDefaults.url);
    setTokenState("");
    setActionError(null);
    setTestResult(null);
  }, [localGatewayDefaults]);

  const hasUnsavedChanges = useMemo(() => {
    return draftGatewayUrl.trim() !== gatewayUrl.trim() || token.trim().length > 0;
  }, [draftGatewayUrl, gatewayUrl, token]);

  return useMemo(
    () => ({
      client: removedGatewayClient,
      status,
      statusReason,
      gatewayUrl,
      draftGatewayUrl,
      token,
      localGatewayDefaults,
      localGatewayDefaultsHasToken,
      hasStoredToken,
      hasUnsavedChanges,
      installContext,
      domainApiModeEnabled,
      error,
      testResult,
      saving,
      testing,
      saveSettings,
      testConnection,
      disconnect,
      useLocalGatewayDefaults,
      setGatewayUrl,
      setToken,
      applyRuntimeStatusEvent,
      clearError,
    }),
    [
      applyRuntimeStatusEvent,
      clearError,
      disconnect,
      draftGatewayUrl,
      domainApiModeEnabled,
      error,
      gatewayUrl,
      hasStoredToken,
      hasUnsavedChanges,
      installContext,
      localGatewayDefaults,
      localGatewayDefaultsHasToken,
      saveSettings,
      saving,
      setGatewayUrl,
      setToken,
      status,
      statusReason,
      testConnection,
      testResult,
      testing,
      token,
      useLocalGatewayDefaults,
    ]
  );
};

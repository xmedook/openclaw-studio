"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { AgentState } from "@/features/agents/state/store";
import { useAgentFilesEditor } from "@/features/agents/state/useAgentFilesEditor";
import { formatCronPayload, formatCronSchedule, type CronJobSummary } from "@/lib/cron/types";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import type { AgentHeartbeatSummary } from "@/lib/gateway/agentConfig";
import {
  AGENT_FILE_META,
  AGENT_FILE_NAMES,
  AGENT_FILE_PLACEHOLDERS,
  type AgentFileName,
} from "@/lib/agents/agentFiles";

const AgentInspectHeader = ({
  label,
  title,
  onClose,
  closeTestId,
  closeDisabled,
}: {
  label: string;
  title: string;
  onClose: () => void;
  closeTestId: string;
  closeDisabled?: boolean;
}) => {
  return (
    <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
      <div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
        <div className="console-title text-2xl leading-none text-foreground">{title}</div>
      </div>
      <button
        className="rounded-md border border-border/80 bg-card/70 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-border hover:bg-muted/65"
        type="button"
        data-testid={closeTestId}
        disabled={closeDisabled}
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
};

type AgentSettingsPanelProps = {
  agent: AgentState;
  onClose: () => void;
  onRename: (value: string) => Promise<boolean>;
  onNewSession: () => Promise<void> | void;
  onDelete: () => void;
  canDelete?: boolean;
  onToolCallingToggle: (enabled: boolean) => void;
  onThinkingTracesToggle: (enabled: boolean) => void;
  cronJobs: CronJobSummary[];
  cronLoading: boolean;
  cronError: string | null;
  cronRunBusyJobId: string | null;
  cronDeleteBusyJobId: string | null;
  onRunCronJob: (jobId: string) => Promise<void> | void;
  onDeleteCronJob: (jobId: string) => Promise<void> | void;
  heartbeats?: AgentHeartbeatSummary[];
  heartbeatLoading?: boolean;
  heartbeatError?: string | null;
  heartbeatRunBusyId?: string | null;
  heartbeatDeleteBusyId?: string | null;
  onRunHeartbeat?: (heartbeatId: string) => Promise<void> | void;
  onDeleteHeartbeat?: (heartbeatId: string) => Promise<void> | void;
};

const formatHeartbeatSchedule = (heartbeat: AgentHeartbeatSummary) =>
  `Every ${heartbeat.heartbeat.every}`;

const formatHeartbeatTarget = (heartbeat: AgentHeartbeatSummary) =>
  `Target: ${heartbeat.heartbeat.target}`;

const formatHeartbeatSource = (heartbeat: AgentHeartbeatSummary) =>
  heartbeat.source === "override" ? "Override" : "Inherited";

export const AgentSettingsPanel = ({
  agent,
  onClose,
  onRename,
  onNewSession,
  onDelete,
  canDelete = true,
  onToolCallingToggle,
  onThinkingTracesToggle,
  cronJobs,
  cronLoading,
  cronError,
  cronRunBusyJobId,
  cronDeleteBusyJobId,
  onRunCronJob,
  onDeleteCronJob,
  heartbeats = [],
  heartbeatLoading = false,
  heartbeatError = null,
  heartbeatRunBusyId = null,
  heartbeatDeleteBusyId = null,
  onRunHeartbeat = () => {},
  onDeleteHeartbeat = () => {},
}: AgentSettingsPanelProps) => {
  const [nameDraft, setNameDraft] = useState(agent.name);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);

  useEffect(() => {
    setNameDraft(agent.name);
    setRenameError(null);
  }, [agent.agentId, agent.name]);

  const handleRename = async () => {
    const next = nameDraft.trim();
    if (!next) {
      setRenameError("Agent name is required.");
      return;
    }
    if (next === agent.name) {
      setRenameError(null);
      return;
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      const ok = await onRename(next);
      if (!ok) {
        setRenameError("Failed to rename agent.");
        return;
      }
      setNameDraft(next);
    } finally {
      setRenameSaving(false);
    }
  };

  const handleNewSession = async () => {
    setSessionBusy(true);
    try {
      await onNewSession();
    } finally {
      setSessionBusy(false);
    }
  };

  return (
    <div
      className="agent-inspect-panel"
      data-testid="agent-settings-panel"
      style={{ position: "relative", left: "auto", top: "auto", width: "100%", height: "100%" }}
    >
      <AgentInspectHeader
        label="Agent settings"
        title={agent.name}
        onClose={onClose}
        closeTestId="agent-settings-close"
      />

      <div className="flex flex-col gap-4 p-4">
        <section
          className="rounded-md border border-border/80 bg-card/70 p-4"
          data-testid="agent-settings-identity"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Identity
          </div>
          <label className="mt-3 flex flex-col gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>Agent name</span>
            <input
              aria-label="Agent name"
              className="h-10 rounded-md border border-border bg-card/75 px-3 text-xs font-semibold text-foreground outline-none"
              value={nameDraft}
              disabled={renameSaving}
              onChange={(event) => setNameDraft(event.target.value)}
            />
          </label>
          {renameError ? (
            <div className="mt-3 rounded-md border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
              {renameError}
            </div>
          ) : null}
          <div className="mt-3 flex justify-end">
            <button
              className="rounded-md border border-transparent bg-primary/90 px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              type="button"
              onClick={() => {
                void handleRename();
              }}
              disabled={renameSaving}
            >
              {renameSaving ? "Saving..." : "Update Name"}
            </button>
          </div>
        </section>

        <section
          className="rounded-md border border-border/80 bg-card/70 p-4"
          data-testid="agent-settings-display"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Display
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-md border border-border/80 bg-card/75 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Show tool calls</span>
              <input
                aria-label="Show tool calls"
                type="checkbox"
                className="h-4 w-4 rounded border-input text-foreground"
                checked={agent.toolCallingEnabled}
                onChange={(event) => onToolCallingToggle(event.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border/80 bg-card/75 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Show thinking</span>
              <input
                aria-label="Show thinking"
                type="checkbox"
                className="h-4 w-4 rounded border-input text-foreground"
                checked={agent.showThinkingTraces}
                onChange={(event) => onThinkingTracesToggle(event.target.checked)}
              />
            </label>
          </div>
        </section>

        <section
          className="rounded-md border border-border/80 bg-card/70 p-4"
          data-testid="agent-settings-session"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Session
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            Start this agent in a fresh session and clear the visible transcript in Studio.
          </div>
          <button
            className="mt-3 w-full rounded-md border border-border/80 bg-card/75 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-border hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-70"
            type="button"
            onClick={() => {
              void handleNewSession();
            }}
            disabled={sessionBusy}
          >
            {sessionBusy ? "Starting..." : "New session"}
          </button>
        </section>

        <section
          className="rounded-md border border-border/80 bg-card/70 p-4"
          data-testid="agent-settings-cron"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Cron jobs
          </div>
          {cronLoading ? (
            <div className="mt-3 text-[11px] text-muted-foreground">Loading cron jobs...</div>
          ) : null}
          {!cronLoading && cronError ? (
            <div className="mt-3 rounded-md border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
              {cronError}
            </div>
          ) : null}
          {!cronLoading && !cronError && cronJobs.length === 0 ? (
            <div className="mt-3 text-[11px] text-muted-foreground">
              No cron jobs for this agent.
            </div>
          ) : null}
          {!cronLoading && !cronError && cronJobs.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {cronJobs.map((job) => {
                const runBusy = cronRunBusyJobId === job.id;
                const deleteBusy = cronDeleteBusyJobId === job.id;
                const busy = runBusy || deleteBusy;
                return (
                  <div
                    key={job.id}
                    className="group/cron flex items-start justify-between gap-2 rounded-md border border-border/80 bg-card/75 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
                        {job.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatCronSchedule(job.schedule)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatCronPayload(job.payload)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition group-focus-within/cron:opacity-100 group-hover/cron:opacity-100">
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/80 bg-card/70 text-muted-foreground transition hover:border-border hover:bg-muted/65 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        aria-label={`Run cron job ${job.name} now`}
                        onClick={() => {
                          void onRunCronJob(job.id);
                        }}
                        disabled={busy}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-destructive/40 bg-transparent text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        aria-label={`Delete cron job ${job.name}`}
                        onClick={() => {
                          void onDeleteCronJob(job.id);
                        }}
                        disabled={busy}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        <section
          className="rounded-md border border-border/80 bg-card/70 p-4"
          data-testid="agent-settings-heartbeat"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Heartbeats
          </div>
          {heartbeatLoading ? (
            <div className="mt-3 text-[11px] text-muted-foreground">Loading heartbeats...</div>
          ) : null}
          {!heartbeatLoading && heartbeatError ? (
            <div className="mt-3 rounded-md border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
              {heartbeatError}
            </div>
          ) : null}
          {!heartbeatLoading && !heartbeatError && heartbeats.length === 0 ? (
            <div className="mt-3 text-[11px] text-muted-foreground">
              No heartbeats for this agent.
            </div>
          ) : null}
          {!heartbeatLoading && !heartbeatError && heartbeats.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {heartbeats.map((heartbeat) => {
                const runBusy = heartbeatRunBusyId === heartbeat.id;
                const deleteBusy = heartbeatDeleteBusyId === heartbeat.id;
                const busy = runBusy || deleteBusy;
                const deleteAllowed = heartbeat.source === "override";
                return (
                  <div
                    key={heartbeat.id}
                    className="group/heartbeat flex items-start justify-between gap-2 rounded-md border border-border/80 bg-card/75 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
                        {heartbeat.agentId}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatHeartbeatSchedule(heartbeat)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatHeartbeatTarget(heartbeat)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatHeartbeatSource(heartbeat)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition group-focus-within/heartbeat:opacity-100 group-hover/heartbeat:opacity-100">
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/80 bg-card/70 text-muted-foreground transition hover:border-border hover:bg-muted/65 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        aria-label={`Run heartbeat for ${heartbeat.agentId} now`}
                        onClick={() => {
                          void onRunHeartbeat(heartbeat.id);
                        }}
                        disabled={busy}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-destructive/40 bg-transparent text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        aria-label={`Delete heartbeat for ${heartbeat.agentId}`}
                        onClick={() => {
                          void onDeleteHeartbeat(heartbeat.id);
                        }}
                        disabled={busy || !deleteAllowed}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        {canDelete ? (
          <section className="rounded-md border border-destructive/30 bg-destructive/4 p-4">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-destructive">
              Delete agent
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">
              Removes the agent from the gateway config and deletes its cron jobs.
            </div>
            <button
              className="mt-3 w-full rounded-md border border-destructive/50 bg-transparent px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-destructive shadow-sm transition hover:bg-destructive/10"
              type="button"
              onClick={onDelete}
            >
              Delete agent
            </button>
          </section>
        ) : (
          <section className="rounded-md border border-border/80 bg-card/70 p-4">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              System agent
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">
              The main agent is reserved and cannot be deleted.
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

type AgentBrainPanelProps = {
  client: GatewayClient;
  agents: AgentState[];
  selectedAgentId: string | null;
  onClose: () => void;
};

export const AgentBrainPanel = ({
  client,
  agents,
  selectedAgentId,
  onClose,
}: AgentBrainPanelProps) => {
  const selectedAgent = useMemo(
    () =>
      selectedAgentId
        ? agents.find((entry) => entry.agentId === selectedAgentId) ?? null
        : null,
    [agents, selectedAgentId]
  );

  const {
    agentFiles,
    agentFileTab,
    agentFilesLoading,
    agentFilesSaving,
    agentFilesDirty,
    agentFilesError,
    setAgentFileContent,
    handleAgentFileTabChange,
    saveAgentFiles,
  } = useAgentFilesEditor({ client, agentId: selectedAgent?.agentId ?? null });
  const [previewMode, setPreviewMode] = useState(true);

  const handleTabChange = useCallback(
    async (nextTab: AgentFileName) => {
      await handleAgentFileTabChange(nextTab);
    },
    [handleAgentFileTabChange]
  );

  const handleClose = useCallback(async () => {
    if (agentFilesSaving) return;
    if (agentFilesDirty) {
      const saved = await saveAgentFiles();
      if (!saved) return;
    }
    onClose();
  }, [agentFilesDirty, agentFilesSaving, onClose, saveAgentFiles]);

  return (
    <div
      className="agent-inspect-panel flex min-h-0 flex-col overflow-hidden"
      data-testid="agent-brain-panel"
      style={{ position: "relative", left: "auto", top: "auto", width: "100%", height: "100%" }}
    >
      <AgentInspectHeader
        label="Brain files"
        title={selectedAgent?.name ?? "No agent selected"}
        onClose={() => {
          void handleClose();
        }}
        closeTestId="agent-brain-close"
        closeDisabled={agentFilesSaving}
      />

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <section className="flex min-h-0 flex-1 flex-col" data-testid="agent-brain-files">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {AGENT_FILE_META[agentFileTab].hint}
            </div>
          </div>
          {agentFilesError ? (
            <div className="mt-3 rounded-md border border-destructive bg-destructive px-3 py-2 text-xs text-destructive-foreground">
              {agentFilesError}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-end gap-2">
            {AGENT_FILE_NAMES.map((name) => {
              const active = name === agentFileTab;
              const label = AGENT_FILE_META[name].title.replace(".md", "");
              return (
                <button
                  key={name}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                    active
                      ? "border-border bg-background text-foreground shadow-sm"
                      : "border-transparent bg-muted/60 text-muted-foreground hover:border-border/80 hover:bg-muted"
                  }`}
                  onClick={() => {
                    void handleTabChange(name);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-end gap-1">
            <button
              type="button"
              className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                previewMode
                  ? "border-border bg-background text-foreground"
                  : "border-border/70 bg-card/60 text-muted-foreground hover:bg-muted/70"
              }`}
              onClick={() => setPreviewMode(true)}
            >
              Preview
            </button>
            <button
              type="button"
              className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                previewMode
                  ? "border-border/70 bg-card/60 text-muted-foreground hover:bg-muted/70"
                  : "border-border bg-background text-foreground"
              }`}
              onClick={() => setPreviewMode(false)}
            >
              Edit
            </button>
          </div>

          <div className="mt-3 min-h-0 flex-1 rounded-md bg-muted/30 p-2">
            {previewMode ? (
              <div className="agent-markdown h-full overflow-y-auto rounded-md border border-border/80 bg-background/80 px-3 py-2 text-xs text-foreground">
                {agentFiles[agentFileTab].content.trim().length === 0 ? (
                  <p className="text-muted-foreground">
                    {AGENT_FILE_PLACEHOLDERS[agentFileTab]}
                  </p>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {agentFiles[agentFileTab].content}
                  </ReactMarkdown>
                )}
              </div>
            ) : (
              <textarea
                className="h-full min-h-0 w-full resize-none overflow-y-auto rounded-md border border-border/80 bg-background/80 px-3 py-2 font-mono text-xs text-foreground outline-none"
                value={agentFiles[agentFileTab].content}
                placeholder={
                  agentFiles[agentFileTab].content.trim().length === 0
                    ? AGENT_FILE_PLACEHOLDERS[agentFileTab]
                    : undefined
                }
                disabled={agentFilesLoading || agentFilesSaving}
                onChange={(event) => {
                  setAgentFileContent(event.target.value);
                }}
              />
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">All changes saved</div>
          </div>
        </section>
      </div>
    </div>
  );
};

import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import { ThemeToggle } from "@/components/theme-toggle";

type HeaderBarProps = {
  workspaceLabel: string;
  workspacePath: string | null;
  hasAnyTiles: boolean;
  status: GatewayStatus;
  showArchived: boolean;
  onToggleArchived: () => void;
  onNewAgent: () => void;
  canCreateAgent: boolean;
  onWorkspaceSettings: () => void;
  onCreateDiscordChannel: () => void;
  canCreateDiscordChannel: boolean;
  onCleanupArchived: () => void;
  canCleanupArchived: boolean;
};

const statusDotStyles: Record<GatewayStatus, string> = {
  disconnected: "bg-muted",
  connecting: "bg-secondary",
  connected: "bg-primary",
};

const statusLabel: Record<GatewayStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting",
  connected: "Connected",
};

export const HeaderBar = ({
  workspaceLabel,
  workspacePath,
  hasAnyTiles,
  status,
  showArchived,
  onToggleArchived,
  onNewAgent,
  canCreateAgent,
  onWorkspaceSettings,
  onCreateDiscordChannel,
  canCreateDiscordChannel,
  onCleanupArchived,
  canCleanupArchived,
}: HeaderBarProps) => {
  const hasActions = canCleanupArchived || canCreateDiscordChannel;
  return (
    <div className="glass-panel px-6 py-4">
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Workspace
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {workspaceLabel}
            </p>
            {workspacePath ? (
              <p className="truncate text-xs text-muted-foreground">{workspacePath}</p>
            ) : null}
          </div>
          {hasAnyTiles ? (
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <input
                className="h-4 w-4 rounded border border-input text-primary"
                type="checkbox"
                checked={showArchived}
                onChange={onToggleArchived}
              />
              Show archived
            </label>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1 text-xs font-semibold uppercase text-muted-foreground">
            <span
              className={`h-2 w-2 rounded-full ${statusDotStyles[status]}`}
              aria-hidden="true"
            />
            {statusLabel[status]}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:border-ring"
              type="button"
              onClick={onWorkspaceSettings}
              data-testid="workspace-settings-toggle"
            >
              Workspace Settings
            </button>
            <button
              className="rounded-lg border border-transparent bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
              type="button"
              onClick={onNewAgent}
              disabled={!canCreateAgent}
            >
              New Agent
            </button>
            {hasActions ? (
              <details className="relative">
                <summary className="flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-semibold text-foreground transition hover:border-ring [&::-webkit-details-marker]:hidden">
                  Actions
                  <span className="text-xs font-semibold text-muted-foreground">v</span>
                </summary>
                <div className="absolute right-0 mt-2 w-56 rounded-lg border border-border bg-popover p-2 text-sm shadow-md">
                  <button
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    onClick={(event) => {
                      onCleanupArchived();
                      const details = event.currentTarget.closest(
                        "details"
                      ) as HTMLDetailsElement | null;
                      if (details) details.open = false;
                    }}
                    disabled={!canCleanupArchived}
                  >
                    Clean Archived Agents
                  </button>
                  {canCreateDiscordChannel ? (
                    <button
                      className="mt-1 flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition hover:bg-muted"
                      type="button"
                      onClick={(event) => {
                        onCreateDiscordChannel();
                        const details = event.currentTarget.closest(
                          "details"
                        ) as HTMLDetailsElement | null;
                        if (details) details.open = false;
                      }}
                    >
                      Create Discord Channel
                    </button>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

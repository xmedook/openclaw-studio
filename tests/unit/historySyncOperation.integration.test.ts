import { describe, expect, it, vi } from "vitest";

import {
  executeHistorySyncCommands,
  type HistorySyncCommand,
} from "@/features/agents/operations/historySyncOperation";
import type { AgentState } from "@/features/agents/state/store";

describe("historySyncOperation integration", () => {
  it("executes dispatch and metric commands and suppresses disconnect-like errors", () => {
    const dispatch = vi.fn();
    const logMetric = vi.fn();
    const logError = vi.fn();
    const commands: HistorySyncCommand[] = [
      {
        kind: "dispatchUpdateAgent",
        agentId: "agent-1",
        patch: { historyLoadedAt: 1234 } as Partial<AgentState>,
      },
      {
        kind: "logMetric",
        metric: "history_sync_test_metric",
        meta: { agentId: "agent-1", requestId: "req-1", runId: "run-1" },
      },
      {
        kind: "logError",
        message: "Disconnected",
        error: new Error("socket disconnected"),
      },
      {
        kind: "logError",
        message: "Unexpected failure",
        error: new Error("boom"),
      },
      { kind: "noop", reason: "missing-agent" },
    ];

    executeHistorySyncCommands({
      commands,
      dispatch,
      logMetric,
      isDisconnectLikeError: (error) =>
        error instanceof Error && error.message.toLowerCase().includes("disconnected"),
      logError,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "updateAgent",
      agentId: "agent-1",
      patch: { historyLoadedAt: 1234 },
    });
    expect(logMetric).toHaveBeenCalledTimes(1);
    expect(logMetric).toHaveBeenCalledWith("history_sync_test_metric", {
      agentId: "agent-1",
      requestId: "req-1",
      runId: "run-1",
    });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("Unexpected failure", expect.any(Error));
  });
});

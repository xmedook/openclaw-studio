import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { AgentState } from "@/features/agents/state/store";
import { AgentChatPanel } from "@/features/agents/components/AgentChatPanel";
import type { GatewayModelChoice } from "@/lib/gateway/models";

const createAgent = (): AgentState => ({
  agentId: "agent-1",
  name: "Agent One",
  sessionKey: "agent:agent-1:studio:test-session",
  status: "idle",
  sessionCreated: true,
  awaitingUserInput: false,
  hasUnseenActivity: false,
  outputLines: [],
  lastResult: null,
  lastDiff: null,
  runId: null,
  runStartedAt: null,
  streamText: null,
  thinkingTrace: null,
  latestOverride: null,
  latestOverrideKind: null,
  lastAssistantMessageAt: null,
  lastActivityAt: null,
  latestPreview: null,
  lastUserMessage: null,
  draft: "",
  sessionSettingsSynced: true,
  historyLoadedAt: null,
  historyFetchLimit: null,
  historyFetchedCount: null,
  historyMaybeTruncated: false,
  toolCallingEnabled: true,
  showThinkingTraces: true,
  model: null,
  thinkingLevel: null,
  avatarSeed: "seed-1",
  avatarUrl: null,
});

describe("AgentChatPanel markdown rendering", () => {
  const models: GatewayModelChoice[] = [{ provider: "openai", id: "gpt-5", name: "gpt-5" }];

  afterEach(() => {
    cleanup();
  });

  it("renders assistant markdown separately from tool detail cards", () => {
    render(
      createElement(AgentChatPanel, {
        agent: {
          ...createAgent(),
          outputLines: [
            "> summarize rendering changes",
            "Here is the output:\n- keep assistant markdown\n- keep tool boundaries\n\n```ts\nconst answer = 42;\n```",
            "[[tool-result]] shell (call-2)\nok\n```text\ndone\n```",
          ],
        },
        isSelected: true,
        canSend: true,
        models,
        stopBusy: false,
        onLoadMoreHistory: vi.fn(),
        onOpenSettings: vi.fn(),
        onModelChange: vi.fn(),
        onThinkingChange: vi.fn(),
        onDraftChange: vi.fn(),
        onSend: vi.fn(),
        onStopRun: vi.fn(),
        onAvatarShuffle: vi.fn(),
      })
    );

    const assistantListItem = screen.getByText("keep assistant markdown");
    expect(assistantListItem).toBeInTheDocument();
    expect(screen.getByText("keep tool boundaries")).toBeInTheDocument();
    expect(screen.getByText("const answer = 42;")).toBeInTheDocument();
    expect(assistantListItem.closest("details")).toBeNull();

    expect(screen.queryByText(/^Output$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Extract output")).not.toBeInTheDocument();

    const toolSummary = screen.getByText("SHELL · ok");
    const toolDetails = toolSummary.closest("details");
    expect(toolDetails).toBeTruthy();
    expect(within(toolDetails as HTMLElement).getByText("done")).toBeInTheDocument();
  });
});

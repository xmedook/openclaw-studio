import { describe, expect, it } from "vitest";

import {
  agentCanvasReducer,
  getAttentionForAgent,
  getFilteredAgents,
  initialAgentCanvasState,
  type AgentSeed,
} from "@/features/canvas/state/store";
import { MIN_TILE_SIZE } from "@/lib/canvasTileDefaults";

describe("agent canvas store", () => {
  it("hydrates agent tiles with defaults and selection", () => {
    const seed: AgentSeed = {
      agentId: "agent-1",
      name: "Agent One",
      sessionKey: "agent:agent-1:main",
      position: { x: 10, y: 20 },
      size: { width: 120, height: 80 },
    };
    const next = agentCanvasReducer(initialAgentCanvasState, {
      type: "hydrateAgents",
      agents: [seed],
    });
    expect(next.loading).toBe(false);
    expect(next.selectedAgentId).toBe("agent-1");
    expect(next.agents).toHaveLength(1);
    expect(next.agents[0].status).toBe("idle");
    expect(next.agents[0].outputLines).toEqual([]);
    expect(next.agents[0].size.width).toBeGreaterThanOrEqual(MIN_TILE_SIZE.width);
    expect(next.agents[0].size.height).toBeGreaterThanOrEqual(MIN_TILE_SIZE.height);
  });

  it("clamps tile size updates", () => {
    const seed: AgentSeed = {
      agentId: "agent-1",
      name: "Agent One",
      sessionKey: "agent:agent-1:main",
      position: { x: 0, y: 0 },
      size: { width: MIN_TILE_SIZE.width, height: MIN_TILE_SIZE.height },
    };
    const hydrated = agentCanvasReducer(initialAgentCanvasState, {
      type: "hydrateAgents",
      agents: [seed],
    });
    const next = agentCanvasReducer(hydrated, {
      type: "updateAgent",
      agentId: "agent-1",
      patch: { size: { width: 10, height: 10 } },
    });
    expect(next.agents[0].size.width).toBeGreaterThanOrEqual(MIN_TILE_SIZE.width);
    expect(next.agents[0].size.height).toBeGreaterThanOrEqual(MIN_TILE_SIZE.height);
  });

  it("tracks_unseen_activity_for_non_selected_agents", () => {
    const seeds: AgentSeed[] = [
      {
        agentId: "agent-1",
        name: "Agent One",
        sessionKey: "agent:agent-1:main",
        position: { x: 0, y: 0 },
        size: { width: 320, height: 320 },
      },
      {
        agentId: "agent-2",
        name: "Agent Two",
        sessionKey: "agent:agent-2:main",
        position: { x: 340, y: 0 },
        size: { width: 320, height: 320 },
      },
    ];
    const hydrated = agentCanvasReducer(initialAgentCanvasState, {
      type: "hydrateAgents",
      agents: seeds,
    });
    const withActivity = agentCanvasReducer(hydrated, {
      type: "markActivity",
      agentId: "agent-2",
      at: 1700000000000,
    });
    const second = withActivity.agents.find((agent) => agent.agentId === "agent-2");
    expect(second?.hasUnseenActivity).toBe(true);
    expect(second?.lastActivityAt).toBe(1700000000000);
    expect(getAttentionForAgent(second!, withActivity.selectedAgentId)).toBe(
      "needs-attention"
    );

    const selected = agentCanvasReducer(withActivity, {
      type: "selectAgent",
      agentId: "agent-2",
    });
    const cleared = selected.agents.find((agent) => agent.agentId === "agent-2");
    expect(cleared?.hasUnseenActivity).toBe(false);
  });

  it("filters_agents_by_attention_and_status", () => {
    const seeds: AgentSeed[] = [
      {
        agentId: "agent-1",
        name: "Agent One",
        sessionKey: "agent:agent-1:main",
        position: { x: 0, y: 0 },
        size: { width: 320, height: 320 },
      },
      {
        agentId: "agent-2",
        name: "Agent Two",
        sessionKey: "agent:agent-2:main",
        position: { x: 340, y: 0 },
        size: { width: 320, height: 320 },
      },
      {
        agentId: "agent-3",
        name: "Agent Three",
        sessionKey: "agent:agent-3:main",
        position: { x: 680, y: 0 },
        size: { width: 320, height: 320 },
      },
    ];
    let state = agentCanvasReducer(initialAgentCanvasState, {
      type: "hydrateAgents",
      agents: seeds,
    });
    state = agentCanvasReducer(state, {
      type: "updateAgent",
      agentId: "agent-1",
      patch: { awaitingUserInput: true },
    });
    state = agentCanvasReducer(state, {
      type: "updateAgent",
      agentId: "agent-2",
      patch: { status: "running" },
    });
    state = agentCanvasReducer(state, {
      type: "updateAgent",
      agentId: "agent-3",
      patch: { status: "error" },
    });
    state = agentCanvasReducer(state, {
      type: "markActivity",
      agentId: "agent-2",
      at: 1700000000001,
    });

    expect(getFilteredAgents(state, "all").map((agent) => agent.agentId)).toEqual([
      "agent-1",
      "agent-2",
      "agent-3",
    ]);
    expect(
      getFilteredAgents(state, "needs-attention").map((agent) => agent.agentId)
    ).toEqual(["agent-1", "agent-2", "agent-3"]);
    expect(getFilteredAgents(state, "running").map((agent) => agent.agentId)).toEqual([
      "agent-2",
    ]);
    expect(getFilteredAgents(state, "idle").map((agent) => agent.agentId)).toEqual([
      "agent-1",
    ]);
  });

  it("clears_unseen_indicator_on_focus", () => {
    const seeds: AgentSeed[] = [
      {
        agentId: "agent-1",
        name: "Agent One",
        sessionKey: "agent:agent-1:main",
        position: { x: 0, y: 0 },
        size: { width: 320, height: 320 },
      },
      {
        agentId: "agent-2",
        name: "Agent Two",
        sessionKey: "agent:agent-2:main",
        position: { x: 320, y: 0 },
        size: { width: 320, height: 320 },
      },
    ];
    let state = agentCanvasReducer(initialAgentCanvasState, {
      type: "hydrateAgents",
      agents: seeds,
    });
    state = agentCanvasReducer(state, {
      type: "markActivity",
      agentId: "agent-2",
      at: 1700000000100,
    });

    const before = state.agents.find((agent) => agent.agentId === "agent-2");
    expect(before?.hasUnseenActivity).toBe(true);
    expect(getAttentionForAgent(before!, state.selectedAgentId)).toBe(
      "needs-attention"
    );

    state = agentCanvasReducer(state, {
      type: "selectAgent",
      agentId: "agent-2",
    });
    const after = state.agents.find((agent) => agent.agentId === "agent-2");
    expect(after?.hasUnseenActivity).toBe(false);
    expect(getAttentionForAgent(after!, state.selectedAgentId)).toBe("normal");
  });
});

import { describe, expect, it, vi } from "vitest";

import { applySessionSettingMutation } from "@/features/agents/state/sessionSettingsMutations";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";

describe("session settings mutations helper", () => {
  it("applies optimistic update before remote sync", async () => {
    const dispatch = vi.fn();
    const client = {
      call: vi.fn(async () => ({ ok: true })),
    } as unknown as GatewayClient;

    await applySessionSettingMutation({
      agents: [{ agentId: "agent-1", sessionCreated: true }],
      dispatch,
      client,
      agentId: "agent-1",
      sessionKey: "agent:1:studio:abc",
      field: "model",
      value: "openai/gpt-5",
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "updateAgent",
      agentId: "agent-1",
      patch: { model: "openai/gpt-5", sessionSettingsSynced: false },
    });
  });

  it("does not sync when session has not been created", async () => {
    const dispatch = vi.fn();
    const client = {
      call: vi.fn(async () => ({ ok: true })),
    } as unknown as GatewayClient;

    await applySessionSettingMutation({
      agents: [{ agentId: "agent-1", sessionCreated: false }],
      dispatch,
      client,
      agentId: "agent-1",
      sessionKey: "agent:1:studio:abc",
      field: "model",
      value: "openai/gpt-5",
    });

    expect(client.call).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("marks session settings synced after successful remote sync", async () => {
    const dispatch = vi.fn();
    const client = {
      call: vi.fn(async () => ({ ok: true })),
    } as unknown as GatewayClient;

    await applySessionSettingMutation({
      agents: [{ agentId: "agent-1", sessionCreated: true }],
      dispatch,
      client,
      agentId: "agent-1",
      sessionKey: "agent:1:studio:abc",
      field: "thinkingLevel",
      value: "medium",
    });

    expect(client.call).toHaveBeenCalledWith("sessions.patch", {
      key: "agent:1:studio:abc",
      thinkingLevel: "medium",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "updateAgent",
      agentId: "agent-1",
      patch: { sessionSettingsSynced: true },
    });
  });

  it("appends actionable error output when sync fails", async () => {
    const dispatch = vi.fn();
    const client = {
      call: vi.fn(async () => {
        throw new Error("network timeout");
      }),
    } as unknown as GatewayClient;

    await applySessionSettingMutation({
      agents: [{ agentId: "agent-1", sessionCreated: true }],
      dispatch,
      client,
      agentId: "agent-1",
      sessionKey: "agent:1:studio:abc",
      field: "model",
      value: "openai/gpt-5",
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "appendOutput",
      agentId: "agent-1",
      line: "Model update failed: network timeout",
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  readAgentList,
  writeAgentList,
  type AgentEntry,
} from "@/lib/clawdbot/config";

describe("clawdbot config agent list helpers", () => {
  it("reads an empty list when agents.list is missing", () => {
    expect(readAgentList({})).toEqual([]);
  });

  it("preserves extra fields like heartbeat when writing list", () => {
    const list: AgentEntry[] = [
      {
        id: "agent-1",
        name: "Agent One",
        workspace: "/tmp/agent-1",
        heartbeat: { every: "30m", target: "last" },
      },
    ];
    const config: Record<string, unknown> = {};

    writeAgentList(config, list);

    expect(readAgentList(config)).toEqual(list);
  });
});

describe("clawdbot config boundaries", () => {
  it("does not expose legacy mutation wrapper", async () => {
    const mod = await import("@/lib/clawdbot/config");
    expect("updateClawdbotConfig" in mod).toBe(false);
  });
});

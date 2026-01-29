import { afterEach, describe, expect, it } from "vitest";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  readAgentList,
  updateClawdbotConfig,
  writeAgentList,
  type AgentEntry,
} from "@/lib/clawdbot/config";

let tempDir: string | null = null;
let previousConfigPath: string | undefined;

const createTempConfig = (config: Record<string, unknown>) => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawdbot-config-"));
  const filePath = path.join(tempDir, "moltbot.json");
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf8");
  previousConfigPath = process.env.MOLTBOT_CONFIG_PATH;
  process.env.MOLTBOT_CONFIG_PATH = filePath;
  return { filePath };
};

const cleanup = () => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
  if (previousConfigPath === undefined) {
    delete process.env.MOLTBOT_CONFIG_PATH;
  } else {
    process.env.MOLTBOT_CONFIG_PATH = previousConfigPath;
  }
  previousConfigPath = undefined;
};

afterEach(cleanup);

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

describe("updateClawdbotConfig", () => {
  it("saves when updater reports changes", () => {
    const { filePath } = createTempConfig({ agents: { list: [] } });

    const result = updateClawdbotConfig((config) => {
      config.agents = { list: [{ id: "agent-1" }] };
      return true;
    });

    expect(result.warnings).toEqual([]);
    const saved = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    expect(saved.agents).toEqual({ list: [{ id: "agent-1" }] });
  });

  it("skips save when updater reports no changes", () => {
    const initial = { agents: { list: [{ id: "agent-1" }] } };
    const { filePath } = createTempConfig(initial);
    const before = fs.readFileSync(filePath, "utf8");

    const result = updateClawdbotConfig(() => false);

    expect(result.warnings).toEqual([]);
    const after = fs.readFileSync(filePath, "utf8");
    expect(after).toBe(before);
  });

  it("returns warning when updater throws non-error", () => {
    createTempConfig({ agents: { list: [] } });

    const result = updateClawdbotConfig(() => {
      throw "nope";
    });

    expect(result.warnings).toEqual([
      "Agent config not updated: Failed to update clawdbot.json.",
    ]);
  });
});

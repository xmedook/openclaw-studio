import { describe, expect, it } from "vitest";

import { buildAgentInstruction } from "@/lib/projects/message";

describe("buildAgentInstruction", () => {
  it("includes workspace path without worktree hints", () => {
    const message = buildAgentInstruction({
      workspacePath: "/tmp/workspace",
      message: "Ship it",
    });

    expect(message).toContain("Workspace path: /tmp/workspace");
    expect(message).not.toContain("git worktree");
    expect(message).toContain("Ship it");
  });
});

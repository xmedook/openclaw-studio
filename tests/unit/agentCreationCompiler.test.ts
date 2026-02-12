import { describe, expect, it } from "vitest";
import {
  compileGuidedAgentCreation,
  createDefaultGuidedDraft,
} from "@/features/agents/creation/compiler";

const createValidDraft = () => {
  const draft = createDefaultGuidedDraft();
  return {
    ...draft,
    primaryOutcome: "Ship polished release notes every week.",
    successCriteria: ["Draft is ready in under 10 minutes.", "No factual errors.", "Includes clear next steps."],
    nonGoals: ["Do not post publicly.", "Do not auto-merge PRs.", "Do not message customers."],
    exampleTasks: ["Summarize merged PRs from this week.", "Draft release note highlights."],
    failureMode: "Publishing inaccurate public updates.",
    tone: "Direct and structured.",
    userProfile: "Product engineer who prefers concise summaries.",
    toolNotes: "Use git history and markdown formatting conventions.",
    memoryNotes: "Remember recurring formatting preferences.",
    heartbeatEnabled: true,
    heartbeatChecklist: ["Check stale release notes.", "Confirm source links.", "Report only blockers."],
  };
};

describe("compileGuidedAgentCreation", () => {
  it("reports required field errors for incomplete drafts", () => {
    const result = compileGuidedAgentCreation({
      name: "Agent",
      draft: createDefaultGuidedDraft(),
    });
    expect(result.validation.errors).toContain("Primary outcome is required.");
    expect(result.validation.errors).toContain("Add at least 3 success criteria.");
    expect(result.validation.errors).toContain("Add at least 3 non-goals.");
    expect(result.validation.errors).toContain("Add at least 2 example tasks.");
    expect(result.validation.errors).toContain("Failure mode is required.");
  });

  it("compiles deterministic files and per-agent overrides", () => {
    const draft = createValidDraft();
    const result = compileGuidedAgentCreation({
      name: "Release Agent",
      draft,
    });
    expect(result.validation.errors).toEqual([]);
    expect(result.files["AGENTS.md"]).toContain("# Mission");
    expect(result.files["SOUL.md"]).toContain("# Voice");
    expect(result.files["IDENTITY.md"]).toContain("Release Agent");
    expect(result.agentOverrides.sandbox).toEqual({
      mode: "non-main",
      workspaceAccess: "ro",
    });
    expect(result.agentOverrides.tools?.profile).toBe("coding");
    expect(result.agentOverrides.tools?.allow).toBeUndefined();
    expect(result.agentOverrides.tools?.alsoAllow).toContain("group:runtime");
    expect(result.agentOverrides.tools?.deny).not.toContain("group:runtime");
    expect(result.execApprovals).toEqual({
      security: "allowlist",
      ask: "always",
      allowlist: [],
    });
  });

  it("uses additive alsoAllow and deny for runtime control toggles", () => {
    const disabledExecDraft = createValidDraft();
    disabledExecDraft.controls.allowExec = false;

    const disabledResult = compileGuidedAgentCreation({
      name: "No Exec Agent",
      draft: disabledExecDraft,
    });

    expect(disabledResult.agentOverrides.tools?.allow).toBeUndefined();
    expect(disabledResult.agentOverrides.tools?.alsoAllow).toEqual([]);
    expect(disabledResult.agentOverrides.tools?.deny).toContain("group:runtime");
    expect(disabledResult.execApprovals).toBeNull();

    const enabledExecDraft = createValidDraft();
    enabledExecDraft.controls.toolsAllow = ["group:web", "group:web", " group:runtime "];
    enabledExecDraft.controls.toolsDeny = ["group:runtime", "group:fs", "group:fs"];

    const enabledResult = compileGuidedAgentCreation({
      name: "Exec Agent",
      draft: enabledExecDraft,
    });

    expect(enabledResult.agentOverrides.tools?.allow).toBeUndefined();
    expect(enabledResult.agentOverrides.tools?.alsoAllow).toEqual(["group:web", "group:runtime"]);
    expect(enabledResult.agentOverrides.tools?.deny).toEqual(["group:fs"]);
  });

  it("blocks contradictory control selections", () => {
    const draft = createValidDraft();
    draft.controls.execAutonomy = "auto";
    draft.controls.approvalSecurity = "deny";
    draft.controls.fileEditAutonomy = "auto-edit";
    draft.controls.workspaceAccess = "none";
    draft.controls.allowExec = false;

    const result = compileGuidedAgentCreation({
      name: "Contradictory Agent",
      draft,
    });

    expect(result.validation.errors).toContain(
      "Auto exec cannot be enabled when approval security is set to deny."
    );
    expect(result.validation.errors).toContain(
      "Auto file edits require sandbox workspace access ro or rw."
    );
    expect(result.validation.errors).toContain("Auto exec requires runtime tools to be enabled.");
  });
});

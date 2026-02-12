import type { AgentFileName } from "@/lib/agents/agentFiles";
import type {
  GuidedAgentCreationCompileResult,
  GuidedAgentCreationDraft,
} from "@/features/agents/creation/types";

const normalizeLineList = (values: string[]): string[] => {
  const next = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return Array.from(new Set(next));
};

const renderList = (values: string[], marker: "-" | "1"): string => {
  if (marker === "1") {
    return values.map((value, index) => `${index + 1}. ${value}`).join("\n");
  }
  return values.map((value) => `- ${value}`).join("\n");
};

const firstNonEmpty = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const defaultHeartbeatChecklist = [
  "Check for open blockers tied to my goal.",
  "List one next action if attention is required.",
  "If nothing needs attention, reply HEARTBEAT_OK.",
];

export const createDefaultGuidedDraft = (): GuidedAgentCreationDraft => ({
  primaryOutcome: "",
  successCriteria: ["", "", ""],
  nonGoals: ["", "", ""],
  exampleTasks: ["", ""],
  failureMode: "",
  tone: "",
  userProfile: "",
  toolNotes: "",
  memoryNotes: "",
  heartbeatEnabled: false,
  heartbeatChecklist: [...defaultHeartbeatChecklist],
  controls: {
    allowExec: true,
    execAutonomy: "ask-first",
    fileEditAutonomy: "propose-only",
    sandboxMode: "non-main",
    workspaceAccess: "ro",
    toolsProfile: "coding",
    toolsAllow: [],
    toolsDeny: [],
    approvalSecurity: "allowlist",
    approvalAsk: "always",
    approvalAllowlist: [],
  },
});

export const compileGuidedAgentCreation = (params: {
  name: string;
  draft: GuidedAgentCreationDraft;
}): GuidedAgentCreationCompileResult => {
  const name = params.name.trim();
  const primaryOutcome = params.draft.primaryOutcome.trim();
  const successCriteria = normalizeLineList(params.draft.successCriteria);
  const nonGoals = normalizeLineList(params.draft.nonGoals);
  const exampleTasks = normalizeLineList(params.draft.exampleTasks);
  const failureMode = params.draft.failureMode.trim();
  const tone = params.draft.tone.trim();
  const userProfile = params.draft.userProfile.trim();
  const toolNotes = params.draft.toolNotes.trim();
  const memoryNotes = params.draft.memoryNotes.trim();
  const heartbeatChecklist = normalizeLineList(params.draft.heartbeatChecklist);

  const toolsAllow = normalizeLineList(params.draft.controls.toolsAllow);
  const toolsDeny = normalizeLineList(params.draft.controls.toolsDeny);
  const approvalAllowlist = normalizeLineList(params.draft.controls.approvalAllowlist).map(
    (pattern) => ({ pattern })
  );

  const ensureToolAlsoAllow = new Set(toolsAllow);
  const ensureToolDeny = new Set(toolsDeny);
  if (params.draft.controls.allowExec) {
    ensureToolAlsoAllow.add("group:runtime");
    ensureToolDeny.delete("group:runtime");
  } else {
    ensureToolDeny.add("group:runtime");
    ensureToolAlsoAllow.delete("group:runtime");
  }

  const normalizedAlsoAllow = Array.from(ensureToolAlsoAllow);
  const normalizedDeny = Array.from(ensureToolDeny).filter(
    (entry) => !ensureToolAlsoAllow.has(entry)
  );

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!name) errors.push("Agent name is required.");
  if (!primaryOutcome) errors.push("Primary outcome is required.");
  if (successCriteria.length < 3) errors.push("Add at least 3 success criteria.");
  if (nonGoals.length < 3) errors.push("Add at least 3 non-goals.");
  if (exampleTasks.length < 2) errors.push("Add at least 2 example tasks.");
  if (!failureMode) errors.push("Failure mode is required.");

  if (params.draft.controls.execAutonomy === "auto" && params.draft.controls.approvalSecurity === "deny") {
    errors.push("Auto exec cannot be enabled when approval security is set to deny.");
  }
  if (
    params.draft.controls.fileEditAutonomy === "auto-edit" &&
    params.draft.controls.workspaceAccess === "none"
  ) {
    errors.push("Auto file edits require sandbox workspace access ro or rw.");
  }
  if (params.draft.controls.execAutonomy === "auto" && !params.draft.controls.allowExec) {
    errors.push("Auto exec requires runtime tools to be enabled.");
  }

  if (!tone) {
    warnings.push("Tone is empty; SOUL.md will use a neutral default voice.");
  }
  if (!userProfile) {
    warnings.push("User profile is empty; USER.md will use a minimal default.");
  }
  if (params.draft.controls.approvalSecurity === "allowlist" && approvalAllowlist.length === 0) {
    warnings.push("Approval security is allowlist with no patterns yet.");
  }

  const uncertaintyRule =
    params.draft.controls.execAutonomy === "auto"
      ? "When uncertain, take the best bounded action and explain your assumptions."
      : "When uncertain, ask for confirmation before taking action.";
  const fileEditRule =
    params.draft.controls.fileEditAutonomy === "auto-edit"
      ? "You may apply file edits directly within the configured workspace bounds."
      : "Propose file edits first and wait for explicit confirmation before applying.";

  const files: Partial<Record<AgentFileName, string>> = {
    "AGENTS.md": [
      "# Mission",
      firstNonEmpty(primaryOutcome, "Define a clear outcome for this agent."),
      "",
      "## Success Criteria",
      successCriteria.length > 0
        ? renderList(successCriteria, "1")
        : "1. Add success criteria during setup.",
      "",
      "## Non-Goals",
      nonGoals.length > 0 ? renderList(nonGoals, "-") : "- Define non-goals during setup.",
      "",
      "## Example Tasks",
      exampleTasks.length > 0 ? renderList(exampleTasks, "-") : "- Add two realistic tasks.",
      "",
      "## Operating Rules",
      `- ${uncertaintyRule}`,
      `- ${fileEditRule}`,
      `- Avoid this failure mode: ${firstNonEmpty(failureMode, "Undefined risky behavior.")}`,
    ].join("\n"),
    "SOUL.md": [
      "# Voice",
      firstNonEmpty(
        tone,
        "Be concise, direct, and transparent about assumptions and risk."
      ),
      "",
      "# Boundaries",
      `- Do not optimize for outcomes that conflict with: ${firstNonEmpty(
        nonGoals[0] ?? "",
        "the non-goals in AGENTS.md"
      )}.`,
      `- Protect against: ${firstNonEmpty(failureMode, "irreversible mistakes")}.`,
    ].join("\n"),
    "IDENTITY.md": [
      "# Identity",
      `- Name: ${firstNonEmpty(name, "New Agent")}`,
      `- Role: ${firstNonEmpty(primaryOutcome, "Assistant")}`,
    ].join("\n"),
    "USER.md": [
      "# User",
      firstNonEmpty(
        userProfile,
        "The user values clear tradeoffs, practical progress, and direct communication."
      ),
    ].join("\n"),
    "TOOLS.md": [
      "# Tool Notes",
      firstNonEmpty(toolNotes, "No custom tool notes yet."),
      "",
      "These notes are guidance only and do not grant tool permissions.",
    ].join("\n"),
    "HEARTBEAT.md": params.draft.heartbeatEnabled
      ? ["# Heartbeat Checklist", renderList(heartbeatChecklist, "-")].join("\n\n")
      : "# Heartbeat\nHeartbeats are disabled for this agent by default.",
    "MEMORY.md": [
      "# Memory Seeds",
      firstNonEmpty(memoryNotes, "No durable memory seeds have been provided yet."),
    ].join("\n"),
  };

  const summary = [
    `Sandbox: ${params.draft.controls.sandboxMode}`,
    `Workspace access: ${params.draft.controls.workspaceAccess}`,
    `Tools profile: ${params.draft.controls.toolsProfile}`,
    params.draft.controls.allowExec
      ? `Exec approvals: ${params.draft.controls.approvalSecurity} / ${params.draft.controls.approvalAsk}`
      : "Exec tools: disabled (group:runtime denied)",
    `Uncertainty behavior: ${
      params.draft.controls.execAutonomy === "auto" ? "act with bounds" : "ask first"
    }`,
  ];

  return {
    files,
    agentOverrides: {
      sandbox: {
        mode: params.draft.controls.sandboxMode,
        workspaceAccess: params.draft.controls.workspaceAccess,
      },
      tools: {
        profile: params.draft.controls.toolsProfile,
        alsoAllow: normalizedAlsoAllow,
        deny: normalizedDeny,
      },
    },
    execApprovals: params.draft.controls.allowExec
      ? {
          security: params.draft.controls.approvalSecurity,
          ask: params.draft.controls.approvalAsk,
          allowlist: approvalAllowlist,
        }
      : null,
    validation: {
      errors,
      warnings,
    },
    summary,
  };
};

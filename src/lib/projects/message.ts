export type AgentInstructionParams = {
  workspacePath: string;
  message: string;
};

export const buildAgentInstruction = ({
  workspacePath,
  message,
}: AgentInstructionParams): string => {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  const workspace = workspacePath?.trim();
  if (!workspace) return trimmed;
  return `Workspace path: ${workspace}. Operate within this repository. You may also read/write your agent workspace files (AGENTS.md, SOUL.md, IDENTITY.md, USER.md, HEARTBEAT.md, TOOLS.md, MEMORY.md). Use MEMORY.md or memory/*.md directly for durable memory; do not rely on memory_search.\n\n${trimmed}`;
};

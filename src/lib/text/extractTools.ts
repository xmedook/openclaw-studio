import { extractText } from "@/lib/text/extractText";

const TOOL_CALL_PREFIX = "[[tool]]";
const TOOL_RESULT_PREFIX = "[[tool-result]]";

type ToolCallRecord = {
  id?: string;
  name?: string;
  arguments?: unknown;
};

type ToolResultRecord = {
  toolCallId?: string;
  toolName?: string;
  details?: Record<string, unknown> | null;
  isError?: boolean;
  text?: string | null;
};

const formatJson = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to stringify tool args.";
    console.warn(message);
    return String(value);
  }
};

const formatToolResultMeta = (details?: Record<string, unknown> | null, isError?: boolean) => {
  const parts: string[] = [];
  if (details && typeof details === "object") {
    const status = details.status;
    if (typeof status === "string" && status.trim()) {
      parts.push(status.trim());
    }
    const exitCode = details.exitCode;
    if (typeof exitCode === "number") {
      parts.push(`exit ${exitCode}`);
    }
    const durationMs = details.durationMs;
    if (typeof durationMs === "number") {
      parts.push(`${durationMs}ms`);
    }
    const cwd = details.cwd;
    if (typeof cwd === "string" && cwd.trim()) {
      parts.push(cwd.trim());
    }
  }
  if (isError) {
    parts.push("error");
  }
  return parts.length ? parts.join(" · ") : "";
};

export const extractToolCalls = (message: unknown): ToolCallRecord[] => {
  if (!message || typeof message !== "object") return [];
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  const calls: ToolCallRecord[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "toolCall") continue;
    calls.push({
      id: typeof record.id === "string" ? record.id : undefined,
      name: typeof record.name === "string" ? record.name : undefined,
      arguments: record.arguments,
    });
  }
  return calls;
};

export const extractToolResult = (message: unknown): ToolResultRecord | null => {
  if (!message || typeof message !== "object") return null;
  const record = message as Record<string, unknown>;
  const role = typeof record.role === "string" ? record.role : "";
  if (role !== "toolResult" && role !== "tool") return null;
  const details =
    record.details && typeof record.details === "object"
      ? (record.details as Record<string, unknown>)
      : null;
  return {
    toolCallId: typeof record.toolCallId === "string" ? record.toolCallId : undefined,
    toolName: typeof record.toolName === "string" ? record.toolName : undefined,
    details,
    isError: typeof record.isError === "boolean" ? record.isError : undefined,
    text: extractText(record),
  };
};

export const formatToolCallMarkdown = (call: ToolCallRecord): string => {
  const name = call.name?.trim() || "tool";
  const suffix = call.id ? ` (${call.id})` : "";
  const args = formatJson(call.arguments).trim();
  if (!args) {
    return `${TOOL_CALL_PREFIX} ${name}${suffix}`;
  }
  return `${TOOL_CALL_PREFIX} ${name}${suffix}\n\`\`\`json\n${args}\n\`\`\``;
};

export const formatToolResultMarkdown = (result: ToolResultRecord): string => {
  const name = result.toolName?.trim() || "tool";
  const suffix = result.toolCallId ? ` (${result.toolCallId})` : "";
  const meta = formatToolResultMeta(result.details, result.isError);
  const header = `${name}${suffix}`;
  const bodyParts: string[] = [];
  if (meta) {
    bodyParts.push(meta);
  }
  const output = result.text?.trim();
  if (output) {
    bodyParts.push(`\`\`\`text\n${output}\n\`\`\``);
  }
  return bodyParts.length === 0
    ? `${TOOL_RESULT_PREFIX} ${header}`
    : `${TOOL_RESULT_PREFIX} ${header}\n${bodyParts.join("\n")}`;
};

export const extractToolLines = (message: unknown): string[] => {
  const lines: string[] = [];
  for (const call of extractToolCalls(message)) {
    lines.push(formatToolCallMarkdown(call));
  }
  const result = extractToolResult(message);
  if (result) {
    lines.push(formatToolResultMarkdown(result));
  }
  return lines;
};

export const isToolMarkdown = (line: string): boolean =>
  line.startsWith(TOOL_CALL_PREFIX) || line.startsWith(TOOL_RESULT_PREFIX);

export const parseToolMarkdown = (
  line: string
): { kind: "call" | "result"; label: string; body: string } => {
  const kind = line.startsWith(TOOL_RESULT_PREFIX) ? "result" : "call";
  const prefix = kind === "result" ? TOOL_RESULT_PREFIX : TOOL_CALL_PREFIX;
  const content = line.slice(prefix.length).trimStart();
  const [labelLine, ...rest] = content.split(/\r?\n/);
  return {
    kind,
    label: labelLine?.trim() || (kind === "result" ? "Tool result" : "Tool call"),
    body: rest.join("\n").trim(),
  };
};

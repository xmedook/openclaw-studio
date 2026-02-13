const MEDIA_LINE_RE = /^\s*MEDIA:\s*(.+?)\s*$/;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const isImagePath = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
};

const toMediaUrl = (path: string): string => {
  return `/api/gateway/media?path=${encodeURIComponent(path)}`;
};

/**
 * Rewrites tool-style media lines like:
 *   MEDIA: /home/ubuntu/.openclaw/workspace-agent/foo.png
 * into markdown image links so the chat UI can render them inline.
 *
 * - Skips replacements inside fenced code blocks.
 */
export const rewriteMediaLinesToMarkdown = (text: string): string => {
  if (!text) return text;

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    const match = line.match(MEDIA_LINE_RE);
    if (!match) {
      out.push(line);
      continue;
    }

    const path = (match[1] ?? "").trim();
    if (!path) {
      out.push(line);
      continue;
    }

    const url = toMediaUrl(path);

    if (isImagePath(path)) {
      // Include the original path in a code span for easy copy/debugging.
      out.push(`![](${url})`);
      out.push("");
      out.push(`\`MEDIA: ${path}\``);
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
};

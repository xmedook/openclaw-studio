import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveUserPath } from "@/lib/clawdbot/paths";

export type PathAutocompleteEntry = {
  name: string;
  fullPath: string;
  displayPath: string;
  isDirectory: boolean;
};

export type PathAutocompleteResult = {
  query: string;
  directory: string;
  entries: PathAutocompleteEntry[];
};

export const ensureDir = (dirPath: string) => {
  if (fs.existsSync(dirPath)) {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`${dirPath} exists and is not a directory.`);
    }
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
};

export const assertIsFile = (filePath: string, label?: string) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label ?? filePath} does not exist.`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`${label ?? filePath} exists but is not a file.`);
  }
};

export const assertIsDir = (dirPath: string, label?: string) => {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`${label ?? dirPath} does not exist.`);
  }
  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`${label ?? dirPath} exists but is not a directory.`);
  }
};

export const ensureFile = (filePath: string, contents: string) => {
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error(`${filePath} exists but is not a file.`);
    }
    return;
  }
  fs.writeFileSync(filePath, contents, "utf8");
};

export const deleteFileIfExists = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return;
  }
  fs.rmSync(filePath);
};

export const deleteDirRecursiveIfExists = (dirPath: string): { deleted: boolean } => {
  if (!fs.existsSync(dirPath)) {
    return { deleted: false };
  }
  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${dirPath}`);
  }
  fs.rmSync(dirPath, { recursive: true, force: false });
  return { deleted: true };
};

const GITIGNORE_LINES = [".env", ".env.*", "!.env.example"];

export const ensureGitRepo = (dir: string): { warnings: string[] } => {
  ensureDir(dir);

  const gitDir = path.join(dir, ".git");
  if (!fs.existsSync(gitDir)) {
    const result = spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) {
      const stderr = result.stderr?.trim();
      throw new Error(stderr ? `git init failed in ${dir}: ${stderr}` : `git init failed in ${dir}.`);
    }
  }

  const gitignorePath = path.join(dir, ".gitignore");
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : "";
  const existingLines = existing.split(/\r?\n/);
  const missing = GITIGNORE_LINES.filter((line) => !existingLines.includes(line));
  if (missing.length > 0) {
    let next = existing;
    if (next.length > 0 && !next.endsWith("\n")) {
      next += "\n";
    }
    next += `${missing.join("\n")}\n`;
    fs.writeFileSync(gitignorePath, next, "utf8");
  }

  return { warnings: [] };
};

type PathAutocompleteOptions = {
  query: string;
  maxResults?: number;
  homedir?: () => string;
};

const normalizeQuery = (query: string): string => {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Query is required.");
  }
  if (trimmed === "~") {
    return "~/";
  }
  if (trimmed.startsWith("~")) {
    return trimmed;
  }
  const withoutLeading = trimmed.replace(/^[\\/]+/, "");
  return `~/${withoutLeading}`;
};

const isWithinHome = (target: string, home: string): boolean => {
  const relative = path.relative(home, target);
  if (!relative) return true;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
};

export const listPathAutocompleteEntries = ({
  query,
  maxResults = 10,
  homedir = os.homedir,
}: PathAutocompleteOptions): PathAutocompleteResult => {
  const normalized = normalizeQuery(query);
  const resolvedHome = path.resolve(homedir());
  const resolvedQuery = resolveUserPath(normalized, homedir);
  if (!isWithinHome(resolvedQuery, resolvedHome)) {
    throw new Error("Path must stay within the home directory.");
  }

  const endsWithSlash = normalized.endsWith("/") || normalized.endsWith(path.sep);
  const directoryPath = endsWithSlash ? resolvedQuery : path.dirname(resolvedQuery);
  const prefix = endsWithSlash ? "" : path.basename(resolvedQuery);

  if (!isWithinHome(directoryPath, resolvedHome)) {
    throw new Error("Path must stay within the home directory.");
  }
  if (!fs.existsSync(directoryPath)) {
    throw new Error(`Directory does not exist: ${directoryPath}`);
  }
  const stat = fs.statSync(directoryPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${directoryPath}`);
  }

  const limit = Number.isFinite(maxResults) && maxResults > 0 ? Math.floor(maxResults) : 10;

  const entries = fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => entry.name.startsWith(prefix))
    .map((entry) => {
      const fullPath = path.join(directoryPath, entry.name);
      const relative = path.relative(resolvedHome, fullPath);
      const normalizedRelative = relative.split(path.sep).join("/");
      const displayBase = `~/${normalizedRelative}`;
      return {
        name: entry.name,
        fullPath,
        displayPath: entry.isDirectory() ? `${displayBase}/` : displayBase,
        isDirectory: entry.isDirectory(),
      } satisfies PathAutocompleteEntry;
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);

  return { query: normalized, directory: directoryPath, entries };
};

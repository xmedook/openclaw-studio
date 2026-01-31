import { NextResponse } from "next/server";

import fs from "node:fs";
import path from "node:path";

import { logger } from "@/lib/logger";
import { resolveUserPath } from "@/lib/clawdbot/paths";
import { loadClawdbotConfig } from "@/lib/clawdbot/config";
import { resolveDefaultAgentId } from "@/lib/clawdbot/resolveDefaultAgent";
import {
  resolveWorkspaceSelection,
  saveWorkspaceSettings,
} from "@/lib/studio/workspaceSettings.server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const selection = resolveWorkspaceSelection();
    let defaultAgentId = "main";
    const warnings = [...selection.warnings];
    try {
      const { config } = loadClawdbotConfig();
      defaultAgentId = resolveDefaultAgentId(config);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load OpenClaw config.";
      warnings.push(message);
    }
    return NextResponse.json({
      workspacePath: selection.workspacePath,
      workspaceName: selection.workspaceName,
      defaultAgentId,
      warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load workspace settings.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      workspacePath?: string;
      workspaceName?: string;
    };
    const workspacePath =
      typeof body?.workspacePath === "string" ? body.workspacePath.trim() : "";
    const workspaceName =
      typeof body?.workspaceName === "string" ? body.workspaceName.trim() : "";
    if (!workspacePath) {
      return NextResponse.json({ error: "Workspace path is required." }, { status: 400 });
    }
    if (
      !path.isAbsolute(workspacePath) &&
      workspacePath !== "~" &&
      !workspacePath.startsWith("~/")
    ) {
      return NextResponse.json(
        { error: "Workspace path must be an absolute path." },
        { status: 400 }
      );
    }

    const resolvedPath = resolveUserPath(workspacePath);
    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        { error: `Workspace path does not exist: ${resolvedPath}` },
        { status: 404 }
      );
    }
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return NextResponse.json(
        { error: `Workspace path is not a directory: ${resolvedPath}` },
        { status: 400 }
      );
    }

    saveWorkspaceSettings({
      workspacePath: resolvedPath,
      workspaceName: workspaceName || undefined,
    });

    let defaultAgentId = "main";
    const warnings: string[] = [];
    try {
      const { config } = loadClawdbotConfig();
      defaultAgentId = resolveDefaultAgentId(config);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load OpenClaw config.";
      warnings.push(message);
    }

    if (!fs.existsSync(path.join(resolvedPath, ".git"))) {
      warnings.push("No .git directory found for this workspace path.");
    }

    if (warnings.length > 0) {
      logger.warn(`Workspace settings saved with warnings: ${warnings.join(" ")}`);
    }

    return NextResponse.json({
      workspacePath: resolvedPath,
      workspaceName: workspaceName || path.basename(resolvedPath),
      defaultAgentId,
      warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save workspace settings.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { randomUUID } from "node:crypto";
import fs from "node:fs";

import { logger } from "@/lib/logger";
import type {
  ProjectTile,
  ProjectTileCreatePayload,
  ProjectTileCreateResult,
  ProjectTileRole,
} from "@/lib/projects/types";
import { resolveProjectFromParams } from "@/lib/projects/resolve.server";
import { loadClawdbotConfig } from "@/lib/clawdbot/config";
import { resolveDefaultAgentId } from "@/lib/clawdbot/resolveDefaultAgent";
import { provisionWorkspaceFiles } from "@/lib/projects/workspaceFiles.server";
import { addTileToProject, saveStore } from "../../store";
import { buildSessionKey } from "@/lib/projects/sessionKey";
import { resolveWorkspaceSelection } from "@/lib/studio/workspaceSettings.server";

export const runtime = "nodejs";

const ROLE_VALUES: ProjectTileRole[] = ["coding", "research", "marketing"];

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const body = (await request.json()) as ProjectTileCreatePayload;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const role = body?.role;
    if (!name) {
      return NextResponse.json({ error: "Tile name is required." }, { status: 400 });
    }
    if (!role || !ROLE_VALUES.includes(role)) {
      return NextResponse.json({ error: "Tile role is invalid." }, { status: 400 });
    }

    const resolved = await resolveProjectFromParams(context.params);
    if (!resolved.ok) {
      return resolved.response;
    }
    const { store, projectId: resolvedProjectId, project } = resolved;

    const selection = resolveWorkspaceSelection();
    const workspacePath = selection.workspacePath?.trim() ?? "";
    if (!workspacePath) {
      return NextResponse.json(
        { error: "Workspace path is required before creating a tile." },
        { status: 400 }
      );
    }
    if (!fs.existsSync(workspacePath)) {
      return NextResponse.json(
        { error: `Workspace path does not exist: ${workspacePath}` },
        { status: 404 }
      );
    }
    const stat = fs.statSync(workspacePath);
    if (!stat.isDirectory()) {
      return NextResponse.json(
        { error: `Workspace path is not a directory: ${workspacePath}` },
        { status: 400 }
      );
    }

    let agentId = "main";
    const warnings: string[] = [];
    try {
      const { config } = loadClawdbotConfig();
      agentId = resolveDefaultAgentId(config);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load OpenClaw config.";
      warnings.push(message);
    }

    const tileId = randomUUID();
    const sessionKey = buildSessionKey(agentId, tileId);
    const offset = project.tiles.length * 36;
    const { warnings: workspaceWarnings } = provisionWorkspaceFiles(workspacePath);
    const tile: ProjectTile = {
      id: tileId,
      name,
      agentId,
      role,
      sessionKey,
      workspacePath,
      archivedAt: null,
      model: "openai-codex/gpt-5.2-codex",
      thinkingLevel: null,
      avatarSeed: tileId,
      position: { x: 80 + offset, y: 200 + offset },
      size: { width: 420, height: 520 },
    };

    const nextStore = addTileToProject(store, resolvedProjectId, tile);
    saveStore(nextStore);

    warnings.push(...workspaceWarnings);
    if (warnings.length > 0) {
      logger.warn(`Tile created with warnings: ${warnings.join(" ")}`);
    }

    const result: ProjectTileCreateResult = {
      store: nextStore,
      tile,
      warnings,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create tile.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

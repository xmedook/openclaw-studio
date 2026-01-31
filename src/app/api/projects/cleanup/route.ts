import { NextResponse } from "next/server";

import fs from "node:fs";
import { logger } from "@/lib/logger";
import type {
  ProjectCleanupPreviewResult,
  ProjectCleanupRequest,
  ProjectCleanupResult,
} from "@/lib/projects/types";
import { loadStore, removeTilesFromStore, saveStore } from "@/app/api/projects/store";
import { selectArchivedTilesForCleanup } from "@/lib/projects/cleanup";
import { deleteDirIfExists, resolveAgentStateDir } from "@/lib/projects/fs.server";
import { loadClawdbotConfig, updateClawdbotConfig } from "@/lib/clawdbot/config";
import { resolveDefaultAgentId } from "@/lib/clawdbot/resolveDefaultAgent";

export const runtime = "nodejs";

export async function GET() {
  try {
    const store = loadStore();
    const { candidates } = selectArchivedTilesForCleanup(store);
    const items = candidates.map(({ project, tile }) => {
      if (!tile.archivedAt) {
        throw new Error(`Archived tile is missing archivedAt: ${tile.id}`);
      }
      const workspacePath = tile.workspacePath?.trim() ?? "";
      const workspaceExists = workspacePath ? fs.existsSync(workspacePath) : false;
      const agentStatePath = resolveAgentStateDir(tile.agentId);
      const agentStateExists = fs.existsSync(agentStatePath);
      return {
        projectId: project.id,
        projectName: project.name,
        tileId: tile.id,
        tileName: tile.name,
        agentId: tile.agentId,
        workspacePath,
        archivedAt: tile.archivedAt,
        workspaceExists,
        agentStateExists,
      };
    });
    const result: ProjectCleanupPreviewResult = { items };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to preview cleanup.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ProjectCleanupRequest;
    const store = loadStore();
    if (body?.tileIds !== undefined && !Array.isArray(body.tileIds)) {
      return NextResponse.json(
        { error: "Tile ids must be an array of strings." },
        { status: 400 }
      );
    }
    const { candidates, errors } = selectArchivedTilesForCleanup(store, body?.tileIds);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
    }
    if (candidates.length === 0) {
      const result: ProjectCleanupResult = { store, warnings: [] };
      return NextResponse.json(result);
    }

    const warnings: string[] = [];
    const removals: Array<{ projectId: string; tileId: string }> = [];
    const agentIds: string[] = [];
    let defaultAgentId = "main";
    try {
      const { config } = loadClawdbotConfig();
      defaultAgentId = resolveDefaultAgentId(config);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load OpenClaw config.";
      warnings.push(message);
    }

    for (const { project, tile } of candidates) {
      const agentId = tile.agentId?.trim() ?? "";
      if (agentId && agentId !== defaultAgentId) {
        deleteDirIfExists(
          resolveAgentStateDir(agentId),
          "Agent state",
          warnings
        );
        agentIds.push(agentId);
      }
      removals.push({ projectId: project.id, tileId: tile.id });
    }

    const { warnings: configWarnings } = updateClawdbotConfig((config) => {
      let changed = false;
      for (const agentId of agentIds) {
        const agents = (config.agents ?? {}) as Record<string, unknown>;
        const list = Array.isArray(agents.list) ? agents.list : [];
        const next = list.filter((entry) => {
          if (!entry || typeof entry !== "object") return false;
          const id = (entry as Record<string, unknown>).id;
          return id !== agentId;
        });
        if (next.length !== list.length) {
          agents.list = next;
          config.agents = agents;
          changed = true;
        }
      }
      return changed;
    });
    warnings.push(...configWarnings);

    const now = Date.now();
    const { store: nextStore } = removeTilesFromStore(store, removals, now);
    saveStore(nextStore);

    const result: ProjectCleanupResult = { store: nextStore, warnings };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to clean archived agents.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

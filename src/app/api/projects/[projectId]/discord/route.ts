import { NextResponse } from "next/server";

import fs from "node:fs";

import { logger } from "@/lib/logger";
import { createDiscordChannelForAgent } from "@/lib/discord/discordChannel";
import { resolveProjectFromParams } from "@/lib/projects/resolve.server";
import { resolveWorkspaceSelection } from "@/lib/studio/workspaceSettings.server";

export const runtime = "nodejs";

type DiscordChannelRequest = {
  guildId?: string;
  agentId: string;
  agentName: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const body = (await request.json()) as DiscordChannelRequest;
    const guildId = typeof body?.guildId === "string" ? body.guildId.trim() : undefined;
    const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
    const agentName = typeof body?.agentName === "string" ? body.agentName.trim() : "";
    if (!agentId || !agentName) {
      return NextResponse.json(
        { error: "Agent id and name are required." },
        { status: 400 }
      );
    }

    const resolved = await resolveProjectFromParams(context.params);
    if (!resolved.ok) {
      return resolved.response;
    }

    const selection = resolveWorkspaceSelection();
    const workspaceDir = selection.workspacePath?.trim() ?? "";
    if (!workspaceDir) {
      return NextResponse.json(
        { error: "Workspace path is not configured." },
        { status: 400 }
      );
    }
    if (!fs.existsSync(workspaceDir)) {
      return NextResponse.json(
        { error: `Workspace path does not exist: ${workspaceDir}` },
        { status: 404 }
      );
    }
    const stat = fs.statSync(workspaceDir);
    if (!stat.isDirectory()) {
      return NextResponse.json(
        { error: `Workspace path is not a directory: ${workspaceDir}` },
        { status: 400 }
      );
    }
    const result = await createDiscordChannelForAgent({
      agentId,
      agentName,
      guildId: guildId || undefined,
      workspaceDir,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create Discord channel.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

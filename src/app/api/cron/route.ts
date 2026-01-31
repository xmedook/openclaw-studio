import { NextResponse } from "next/server";

import fs from "node:fs";
import path from "node:path";

import { resolveStateDir } from "@/lib/clawdbot/paths";
import { logger } from "@/lib/logger";
import type { CronJobsResult, CronJobSummary, CronPayload, CronSchedule } from "@/lib/projects/types";

export const runtime = "nodejs";

type RawCronStore = {
  jobs?: unknown;
};

const coerceString = (value: unknown) => (typeof value === "string" ? value : "");
const coerceNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const coerceBoolean = (value: unknown) => (typeof value === "boolean" ? value : null);

const coerceSchedule = (value: unknown): CronSchedule | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const kind = coerceString(record.kind);
  if (kind === "every") {
    const everyMs = coerceNumber(record.everyMs);
    if (everyMs === null) return null;
    const anchorMs = coerceNumber(record.anchorMs ?? null) ?? undefined;
    return anchorMs ? { kind, everyMs, anchorMs } : { kind, everyMs };
  }
  if (kind === "cron") {
    const expr = coerceString(record.expr);
    if (!expr) return null;
    const tz = coerceString(record.tz);
    return tz ? { kind, expr, tz } : { kind, expr };
  }
  if (kind === "at") {
    const atMs = coerceNumber(record.atMs);
    if (atMs === null) return null;
    return { kind, atMs };
  }
  return null;
};

const coercePayload = (value: unknown): CronPayload | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const kind = coerceString(record.kind);
  if (kind === "systemEvent") {
    const text = coerceString(record.text);
    if (!text) return null;
    return { kind, text };
  }
  if (kind === "agentTurn") {
    const message = coerceString(record.message);
    if (!message) return null;
    return { kind, message };
  }
  return null;
};

const coerceJob = (value: unknown): CronJobSummary | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = coerceString(record.id);
  const name = coerceString(record.name);
  const enabled = coerceBoolean(record.enabled);
  const updatedAtMs = coerceNumber(record.updatedAtMs);
  const schedule = coerceSchedule(record.schedule);
  const payload = coercePayload(record.payload);
  if (!id || !name || enabled === null || updatedAtMs === null || !schedule || !payload) {
    return null;
  }
  const agentId = coerceString(record.agentId);
  const sessionTarget = coerceString(record.sessionTarget);
  return {
    id,
    name,
    enabled,
    updatedAtMs,
    schedule,
    payload,
    ...(agentId ? { agentId } : {}),
    ...(sessionTarget ? { sessionTarget } : {}),
  };
};

export async function GET() {
  try {
    const cronPath = path.join(resolveStateDir(), "cron", "jobs.json");
    if (!fs.existsSync(cronPath)) {
      const result: CronJobsResult = { jobs: [] };
      return NextResponse.json(result);
    }
    const raw = fs.readFileSync(cronPath, "utf8");
    const parsed = JSON.parse(raw) as RawCronStore;
    const jobs = Array.isArray(parsed?.jobs)
      ? parsed.jobs.map(coerceJob).filter((job): job is CronJobSummary => Boolean(job))
      : [];
    const result: CronJobsResult = { jobs };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load cron jobs.";
    logger.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

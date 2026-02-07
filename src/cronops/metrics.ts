import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export type CronUsageEvent = {
  proposalId?: string;
  jobId?: string;
  startTime: string;
  endTime: string;
  tokensUsed?: number;
  model?: string;
  estimatedCostUsd?: number;
  exitStatus?: string;
};

export function resolveCronMetricsDir(env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = resolveStateDir(env, os.homedir);
  return path.join(stateDir, "cronops", "metrics");
}

export function resolveCronUsagePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveCronMetricsDir(env), "usage.ndjson");
}

function formatNdjsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export async function appendCronUsageEvent(params: {
  event: CronUsageEvent;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const filePath = resolveCronUsagePath(params.env);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const handle = await fs.promises.open(filePath, "a", 0o600);
  try {
    await handle.writeFile(formatNdjsonLine(params.event), { encoding: "utf-8" });
  } finally {
    await handle.close();
  }
}

export async function readCronUsageEvents(params: {
  env?: NodeJS.ProcessEnv;
}): Promise<CronUsageEvent[]> {
  const filePath = resolveCronUsagePath(params.env);
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const lines = raw.split("\n").filter((line) => line.trim());
    const events: CronUsageEvent[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as CronUsageEvent;
        if (parsed && typeof parsed === "object") {
          events.push(parsed);
        }
      } catch {
        continue;
      }
    }
    return events;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      return [];
    }
    return [];
  }
}

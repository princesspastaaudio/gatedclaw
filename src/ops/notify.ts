import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { resolveDefaultTelegramAccountId } from "../telegram/accounts.js";
import { sendMessageTelegram } from "../telegram/send.js";
import { VERSION } from "../version.js";

export type RunRecord = {
  runId: string;
  job: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  counts?: Record<string, number>;
  tokenUsage?: { input: number; output: number; total: number };
  costEstimateUsd?: number;
  provenance: { runId: string; agent: string; version: string };
};

export const OPS_RUNS_PATH = path.join("ops", "runs.ndjson");

export function resolveOpsRunsPath(): string {
  return path.join(resolveStateDir(), OPS_RUNS_PATH);
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function appendRunRecord(record: RunRecord): Promise<void> {
  const filePath = resolveOpsRunsPath();
  await ensureDir(filePath);
  await fs.promises.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

export async function notifyOperators(message: string): Promise<void> {
  const cfg = loadConfig();
  const chatIds = (cfg.gating?.adminChats ?? []).map((chatId) => String(chatId));
  if (chatIds.length === 0) {
    return;
  }
  const accountId = resolveDefaultTelegramAccountId(cfg);
  for (const chatId of chatIds) {
    await sendMessageTelegram(chatId, message, { accountId });
  }
}

export function buildRunRecord(params: {
  runId: string;
  job: string;
  startedAt: string;
  finishedAt: string;
  counts?: Record<string, number>;
  tokenUsage?: { input: number; output: number; total: number };
  costEstimateUsd?: number;
}): RunRecord {
  const durationMs = new Date(params.finishedAt).getTime() - new Date(params.startedAt).getTime();
  return {
    runId: params.runId,
    job: params.job,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    durationMs: Math.max(0, durationMs),
    counts: params.counts,
    tokenUsage: params.tokenUsage,
    costEstimateUsd: params.costEstimateUsd,
    provenance: {
      runId: params.runId,
      agent: params.job,
      version: VERSION,
    },
  };
}

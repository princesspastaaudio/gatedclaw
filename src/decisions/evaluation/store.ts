import fs from "node:fs";
import path from "node:path";
import type { DecisionAccuracyMetric, DecisionOutcome } from "./types.js";
import { resolveStateDir } from "../../config/paths.js";
import { readNdjsonFile } from "../ndjson.js";

export const DECISION_OUTCOMES_PATH = path.join("decisions", "outcomes.ndjson");
export const DECISION_OUTCOMES_INDEX_PATH = path.join("decisions", "outcomes.index.json");
export const DECISION_ACCURACY_PATH = path.join("decisions", "accuracy.ndjson");

export function resolveDecisionOutcomesPath(): string {
  return path.join(resolveStateDir(), DECISION_OUTCOMES_PATH);
}

export function resolveDecisionOutcomesIndexPath(): string {
  return path.join(resolveStateDir(), DECISION_OUTCOMES_INDEX_PATH);
}

export function resolveDecisionAccuracyPath(): string {
  return path.join(resolveStateDir(), DECISION_ACCURACY_PATH);
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
}

function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpPath, content, "utf8");
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

async function appendNdjsonAtomic(filePath: string, lines: string[]): Promise<void> {
  if (lines.length === 0) {
    return;
  }
  await ensureDir(filePath);
  const existing = fs.existsSync(filePath) ? await fs.promises.readFile(filePath, "utf8") : "";
  const payload = `${existing}${lines.join("\n")}\n`;
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  await fs.promises.writeFile(tmpPath, payload, "utf8");
  await fs.promises.rename(tmpPath, filePath);
}

export function buildOutcomeIndexKey(decisionId: string, horizon: string): string {
  return `${decisionId}::${horizon}`;
}

export function isOutcomeIndexed(
  index: Record<string, string>,
  decisionId: string,
  horizon: string,
): boolean {
  const key = buildOutcomeIndexKey(decisionId, horizon);
  return Object.prototype.hasOwnProperty.call(index, key);
}

export async function readOutcomeIndex(): Promise<Record<string, string>> {
  const filePath = resolveDecisionOutcomesIndexPath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export async function writeOutcomeIndex(index: Record<string, string>): Promise<void> {
  const filePath = resolveDecisionOutcomesIndexPath();
  await ensureDir(filePath);
  atomicWriteFileSync(filePath, `${JSON.stringify(index, null, 2)}\n`);
}

export async function appendDecisionOutcomes(outcomes: DecisionOutcome[]): Promise<void> {
  const filePath = resolveDecisionOutcomesPath();
  const lines = outcomes.map((entry) => JSON.stringify(entry));
  await appendNdjsonAtomic(filePath, lines);
}

export async function appendDecisionAccuracy(metrics: DecisionAccuracyMetric[]): Promise<void> {
  const filePath = resolveDecisionAccuracyPath();
  const lines = metrics.map((entry) => JSON.stringify(entry));
  await appendNdjsonAtomic(filePath, lines);
}

export async function loadDecisionOutcomes(): Promise<DecisionOutcome[]> {
  const filePath = resolveDecisionOutcomesPath();
  return await readNdjsonFile(filePath, (value) => value as DecisionOutcome);
}

export async function loadDecisionAccuracy(): Promise<DecisionAccuracyMetric[]> {
  const filePath = resolveDecisionAccuracyPath();
  return await readNdjsonFile(filePath, (value) => value as DecisionAccuracyMetric);
}

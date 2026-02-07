import fs from "node:fs";
import path from "node:path";
import type { ApprovalActor, BudgetedRunPayload } from "../gating/types.js";
import { resolveStateDir } from "../config/paths.js";

export type BudgetedApprovalRecord = {
  runId: string;
  job: "sentiment_labeler";
  approvedBy: ApprovalActor;
  approvedAt: string;
  payload: BudgetedRunPayload;
};

const APPROVED_DIR = path.join("ops", "budgeted", "approved");
const CONSUMED_DIR = path.join("ops", "budgeted", "consumed");

function resolveApprovedDir(): string {
  return path.join(resolveStateDir(), APPROVED_DIR);
}

function resolveConsumedDir(): string {
  return path.join(resolveStateDir(), CONSUMED_DIR);
}

function resolveApprovedPath(runId: string): string {
  return path.join(resolveApprovedDir(), `${runId}.json`);
}

function resolveConsumedPath(runId: string): string {
  return path.join(resolveConsumedDir(), `${runId}.json`);
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export async function writeBudgetedApproval(record: BudgetedApprovalRecord): Promise<void> {
  const filePath = resolveApprovedPath(record.runId);
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function listBudgetedApprovals(): Promise<BudgetedApprovalRecord[]> {
  const dir = resolveApprovedDir();
  try {
    const entries = await fs.promises.readdir(dir);
    const records: BudgetedApprovalRecord[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) {
        continue;
      }
      const raw = await fs.promises.readFile(path.join(dir, entry), "utf8");
      try {
        const parsed = JSON.parse(raw) as BudgetedApprovalRecord;
        if (parsed.runId && parsed.job) {
          records.push(parsed);
        }
      } catch {
        continue;
      }
    }
    return records.sort((a, b) => a.approvedAt.localeCompare(b.approvedAt));
  } catch {
    return [];
  }
}

export async function consumeBudgetedApproval(runId: string): Promise<void> {
  const source = resolveApprovedPath(runId);
  const target = resolveConsumedPath(runId);
  await ensureDir(path.dirname(target));
  if (!fs.existsSync(source)) {
    return;
  }
  await fs.promises.rename(source, target);
}

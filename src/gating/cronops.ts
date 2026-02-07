import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

type CronProposalSummary = {
  logicalId?: string;
  schedule?: string;
};

const PROPOSAL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function isValidProposalId(value: string): boolean {
  return PROPOSAL_ID_RE.test(value);
}

export function resolveCronOpsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = resolveStateDir(env, os.homedir);
  return path.join(stateDir, "workspace", "cronops");
}

export function resolveCronProposalDir(params: {
  proposalId: string;
  env?: NodeJS.ProcessEnv;
}): string {
  return path.join(resolveCronOpsRoot(params.env), "proposals", "pending", params.proposalId);
}

export async function proposalExists(params: {
  proposalId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const dir = resolveCronProposalDir(params);
  try {
    const stats = await fs.promises.stat(dir);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function resolveProposalMetadataPath(proposalDir: string): string | null {
  const candidate = path.join(proposalDir, "proposal.json");
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  const metaCandidate = path.join(proposalDir, "meta.json");
  if (fs.existsSync(metaCandidate)) {
    return metaCandidate;
  }
  return null;
}

export async function loadCronProposalSummary(params: {
  proposalId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<CronProposalSummary | null> {
  const proposalDir = resolveCronProposalDir(params);
  const metaPath = resolveProposalMetadataPath(proposalDir);
  if (!metaPath) {
    return null;
  }
  try {
    const raw = await fs.promises.readFile(metaPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const logicalId =
      typeof parsed.logical_id === "string"
        ? parsed.logical_id
        : typeof parsed.logicalId === "string"
          ? parsed.logicalId
          : undefined;
    const schedule =
      typeof parsed.schedule === "string"
        ? parsed.schedule
        : typeof parsed.cron === "string"
          ? parsed.cron
          : undefined;
    return { logicalId, schedule };
  } catch {
    return null;
  }
}

import fs from "node:fs";
import path from "node:path";
import type { DecisionCandidate, DecisionProposal } from "./types.js";
import { resolveStateDir } from "../config/paths.js";
import { readNdjsonFile } from "./ndjson.js";

export const DECISION_CANDIDATES_PATH = path.join("decisions", "candidates.ndjson");
export const DECISION_PROPOSALS_PATH = path.join("decisions", "proposals.ndjson");

export function resolveDecisionCandidatesPath(): string {
  return path.join(resolveStateDir(), DECISION_CANDIDATES_PATH);
}

export function resolveDecisionProposalsPath(): string {
  return path.join(resolveStateDir(), DECISION_PROPOSALS_PATH);
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function appendDecisionCandidates(candidates: DecisionCandidate[]): Promise<void> {
  if (candidates.length === 0) {
    return;
  }
  const filePath = resolveDecisionCandidatesPath();
  await ensureDir(filePath);
  const lines = candidates.map((entry) => JSON.stringify(entry)).join("\n");
  await fs.promises.appendFile(filePath, `${lines}\n`, "utf8");
}

export async function appendDecisionProposals(proposals: DecisionProposal[]): Promise<void> {
  if (proposals.length === 0) {
    return;
  }
  const filePath = resolveDecisionProposalsPath();
  await ensureDir(filePath);
  const lines = proposals.map((entry) => JSON.stringify(entry)).join("\n");
  await fs.promises.appendFile(filePath, `${lines}\n`, "utf8");
}

export async function loadDecisionCandidates(): Promise<DecisionCandidate[]> {
  const filePath = resolveDecisionCandidatesPath();
  return await readNdjsonFile(filePath, (value) => value as DecisionCandidate);
}

export async function loadDecisionProposals(): Promise<DecisionProposal[]> {
  const filePath = resolveDecisionProposalsPath();
  return await readNdjsonFile(filePath, (value) => value as DecisionProposal);
}

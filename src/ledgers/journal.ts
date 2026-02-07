import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LedgerPosting, LedgerProvenance } from "../gating/types.js";
import { resolveStateDir } from "../config/paths.js";
import { isValidLedgerName } from "../gating/ledger-store.js";

export type LedgerJournalEntry = {
  runId: string;
  approvalId: string;
  timestamp: string;
  postings: LedgerPosting[];
  provenance: LedgerProvenance;
  payloadHash: string;
};

export function resolveLedgerJournalPath(
  ledger: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!isValidLedgerName(ledger)) {
    throw new Error("invalid ledger name");
  }
  const stateDir = resolveStateDir(env, os.homedir);
  return path.join(stateDir, "ledgers", ledger, "journal.ndjson");
}

export function hashLedgerPayload(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function appendLedgerJournalEntry(params: {
  ledger: string;
  entry: LedgerJournalEntry;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const filePath = resolveLedgerJournalPath(params.ledger, params.env);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const handle = await fs.promises.open(filePath, "a", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(params.entry)}\n`, { encoding: "utf-8" });
  } finally {
    await handle.close();
  }
}

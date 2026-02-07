import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendLedgerJournalEntry, resolveLedgerJournalPath } from "./journal.js";

describe("ledger journal", () => {
  it("appends entries to the journal", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-ledger-"));
    const env = { ...process.env, OPENCLAW_STATE_DIR: tmp };
    const entry = {
      runId: "run-1",
      approvalId: "approval-1",
      timestamp: new Date().toISOString(),
      postings: [{ account: "trading:position", amount: 1, asset: "BTC" }],
      provenance: { exchange: "kraken", dryRun: true },
      payloadHash: "hash",
    };
    await appendLedgerJournalEntry({ ledger: "finance", entry, env });
    const filePath = resolveLedgerJournalPath("finance", env);
    const raw = await fs.readFile(filePath, "utf-8");
    const lines = raw.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]) as typeof entry;
    expect(parsed.approvalId).toBe("approval-1");
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

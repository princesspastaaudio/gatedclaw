import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withEnvOverride } from "../config/test-helpers.js";
import { isValidProposalId } from "./cronops.js";
import { createDefaultExecutors } from "./executors.js";
import { validateLedgerPatch } from "./ledger-store.js";

describe("gating executors", () => {
  it("validates proposal ids", () => {
    expect(isValidProposalId("proposal-1")).toBe(true);
    expect(isValidProposalId("bad/../id")).toBe(false);
  });

  it("validates ledger patch schema", () => {
    expect(validateLedgerPatch({ set: { balance: 10 }, remove: ["old"] }).ok).toBe(true);
    expect(validateLedgerPatch({ set: { "bad key": 1 } }).ok).toBe(false);
  });

  it("validates cron payload existence", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-gating-"));
    const proposalId = "proposal-123";
    const proposalDir = path.join(tmp, "workspace", "cronops", "proposals", "pending", proposalId);
    await fs.mkdir(proposalDir, { recursive: true });
    const executors = createDefaultExecutors();
    const executor = executors.get("cron.apply");
    if (!executor) {
      throw new Error("missing executor");
    }
    await withEnvOverride({ OPENCLAW_STATE_DIR: tmp }, async () => {
      const result = await executor.validate({ proposalId });
      expect(result.ok).toBe(true);
    });
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

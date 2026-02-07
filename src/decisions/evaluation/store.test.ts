import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildOutcomeIndexKey,
  isOutcomeIndexed,
  readOutcomeIndex,
  writeOutcomeIndex,
} from "./store.js";

describe("decision outcomes index", () => {
  const originalStateDir = process.env.OPENCLAW_STATE_DIR;
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    if (originalStateDir) {
      process.env.OPENCLAW_STATE_DIR = originalStateDir;
    } else {
      delete process.env.OPENCLAW_STATE_DIR;
    }
  });

  it("persists index entries for idempotency", async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openclaw-state-"));
    process.env.OPENCLAW_STATE_DIR = tempDir;

    const key = buildOutcomeIndexKey("dec-1", "24h");
    await writeOutcomeIndex({ [key]: "out-1" });

    const index = await readOutcomeIndex();
    expect(isOutcomeIndexed(index, "dec-1", "24h")).toBe(true);
    expect(index[key]).toBe("out-1");
  });
});

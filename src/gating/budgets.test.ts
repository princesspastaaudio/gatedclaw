import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendCronUsageEvent } from "../cronops/metrics.js";
import { enforceCronBudget } from "./budgets.js";

describe("cron budgets", () => {
  it("blocks approvals when daily token budget is exceeded", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-budgets-"));
    const env = { ...process.env, OPENCLAW_STATE_DIR: tmp };
    await appendCronUsageEvent({
      env,
      event: {
        proposalId: "job-1",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        tokensUsed: 90,
        model: "gpt-4",
        estimatedCostUsd: 1,
        exitStatus: "success",
      },
    });
    const result = await enforceCronBudget({
      cfg: { budgets: { maxDailyTokens: 100 } },
      metrics: { estimatedTokens: 20 },
      env,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("budget-max-daily-tokens");
    }
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

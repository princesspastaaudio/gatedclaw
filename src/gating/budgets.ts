import type { OpenClawConfig } from "../config/config.js";
import type { CronMetrics } from "./types.js";
import { readCronUsageEvents } from "../cronops/metrics.js";

export type CronBudgetCheck =
  | { ok: true }
  | { ok: false; reason: string; details?: Record<string, unknown> };

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function toDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function enforceCronBudget(params: {
  cfg: OpenClawConfig;
  metrics?: CronMetrics;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}): Promise<CronBudgetCheck> {
  const budgets = params.cfg.budgets;
  if (!budgets) {
    return { ok: true };
  }
  const metrics = params.metrics ?? {};
  const estimatedTokens = coerceNumber(metrics.estimatedTokens);
  const estimatedCostUsd = coerceNumber(metrics.estimatedCostUsd);
  if (typeof budgets.maxSingleRunCostUsd === "number") {
    if (estimatedCostUsd === null) {
      return {
        ok: false,
        reason: "budget-missing-cost-estimate",
        details: { maxSingleRunCostUsd: budgets.maxSingleRunCostUsd },
      };
    }
    if (estimatedCostUsd > budgets.maxSingleRunCostUsd) {
      return {
        ok: false,
        reason: "budget-max-cost",
        details: { estimatedCostUsd, maxSingleRunCostUsd: budgets.maxSingleRunCostUsd },
      };
    }
  }
  if (typeof budgets.maxDailyTokens === "number") {
    if (estimatedTokens === null) {
      return {
        ok: false,
        reason: "budget-missing-token-estimate",
        details: { maxDailyTokens: budgets.maxDailyTokens },
      };
    }
    const events = await readCronUsageEvents({ env: params.env });
    const todayKey = toDateKey(params.now ?? new Date());
    const usedToday = events.reduce((sum, event) => {
      const timestamp = event.endTime ?? event.startTime;
      if (!timestamp) {
        return sum;
      }
      const eventDate = new Date(timestamp);
      if (Number.isNaN(eventDate.getTime())) {
        return sum;
      }
      if (toDateKey(eventDate) !== todayKey) {
        return sum;
      }
      const tokens = coerceNumber(event.tokensUsed) ?? 0;
      return sum + tokens;
    }, 0);
    if (usedToday + estimatedTokens > budgets.maxDailyTokens) {
      return {
        ok: false,
        reason: "budget-max-daily-tokens",
        details: {
          maxDailyTokens: budgets.maxDailyTokens,
          usedToday,
          estimatedTokens,
        },
      };
    }
  }
  return { ok: true };
}

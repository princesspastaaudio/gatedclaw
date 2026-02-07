import { z } from "zod";

export const BudgetsSchema = z
  .object({
    maxDailyTokens: z.number().int().positive().optional(),
    maxSingleRunCostUsd: z.number().positive().optional(),
  })
  .strict()
  .optional();

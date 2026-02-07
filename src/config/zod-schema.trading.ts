import { z } from "zod";

const KrakenConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    allowedSymbols: z.array(z.string()).optional(),
    maxOrderUsd: z.number().positive().optional(),
    maxOrderAsset: z.record(z.string(), z.number().positive()).optional(),
  })
  .strict()
  .optional();

export const TradingSchema = z
  .object({
    kraken: KrakenConfigSchema,
  })
  .strict()
  .optional();

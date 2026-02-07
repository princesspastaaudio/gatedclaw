import { describe, expect, it } from "vitest";
import { executeKrakenTrade, validateKrakenTradeIntent } from "./kraken.js";

describe("kraken trading", () => {
  it("rejects payloads that exceed limits", () => {
    const validation = validateKrakenTradeIntent({
      payload: {
        exchange: "kraken",
        side: "buy",
        symbol: "BTC/USD",
        orderType: "market",
        quantity: 1,
      },
      config: {
        maxOrderUsd: 100,
      },
    });
    expect(validation.ok).toBe(false);
  });

  it("returns dry run when disabled", async () => {
    const result = await executeKrakenTrade({
      payload: {
        exchange: "kraken",
        side: "buy",
        symbol: "BTC/USD",
        orderType: "limit",
        quantity: 0.1,
        limitPrice: 20000,
      },
      config: {
        enabled: false,
        allowedSymbols: ["BTC/USD"],
      },
    });
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
  });
});

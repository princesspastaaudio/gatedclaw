import { describe, expect, it, vi } from "vitest";
import type { SignalProvider } from "./types.js";
import { runSignalProviders } from "./index.js";

describe("runSignalProviders", () => {
  it("composes multiple providers", async () => {
    const loadA = vi.fn(async () => ({ value: 1 }));
    const summarizeA = vi.fn(() => ({ summary: 1 }));
    const scoreA = vi.fn(() => ({ score: 1 }));
    const providerA: SignalProvider<unknown, unknown, unknown> = {
      name: "a",
      load: loadA,
      summarize: summarizeA,
      score: scoreA,
    };
    const providerB: SignalProvider<unknown, unknown, unknown> = {
      name: "b",
      load: vi.fn(async () => ({ value: 2 })),
      summarize: vi.fn(() => ({ summary: 2 })),
      score: vi.fn(() => ({ score: 2 })),
    };

    const result = await runSignalProviders([providerA, providerB], {
      symbol: "BTC/USD",
      horizon: "24h",
      config: {},
    });

    expect(result).toHaveLength(2);
    expect(loadA).toHaveBeenCalled();
    expect(summarizeA).toHaveBeenCalled();
    expect(scoreA).toHaveBeenCalled();
  });
});

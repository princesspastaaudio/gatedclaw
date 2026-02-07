import { describe, expect, it } from "vitest";
import type { CoinCalcSimSummary } from "./signals/coin-calc-sim.js";
import type { SentimentSignalSummary } from "./signals/sentiment.js";
import type { TapeSignalSummary } from "./signals/tape.js";
import { computeDecisionConfidence, selectRecommendedAction } from "./engine.js";

const baseSentiment: SentimentSignalSummary = {
  bucketTs: "2024-01-01T00:00:00.000Z",
  meanSentiment: 0.6,
  meanConfidence: 0.7,
  momentum: 0.2,
  stability: 0.8,
  topTags: ["ETF"],
  bucketDates: ["2024-01-01"],
  runId: "sent-1",
};

const baseTape: TapeSignalSummary = {
  ts: "2024-01-01T00:00:00.000Z",
  consensusPrice: 40000,
  dispersionPct: 0.5,
  sourcesOk: 3,
  trendPct: 1.2,
  healthOk: true,
  staleSources: [],
  runId: "tape-1",
};

const baseSim: CoinCalcSimSummary = {
  ts: "2024-01-01T00:00:00.000Z",
  meanReturnPct: 1.2,
  p10Pct: -0.8,
  p50Pct: 2.0,
  p90Pct: 3.4,
  regime: "risk-on",
  runId: "sim-1",
};

describe("decision engine", () => {
  it("computes deterministic confidence", () => {
    const breakdown = computeDecisionConfidence({
      sentiment: baseSentiment,
      tape: baseTape,
      sim: baseSim,
      config: { maxDispersionPct: 2.5 },
    });
    expect(breakdown.confidence).toBeCloseTo(0.7515, 4);
  });

  it("selects BUY for aligned sentiment and trend", () => {
    const decision = selectRecommendedAction({
      sentiment: baseSentiment,
      tape: baseTape,
      sim: baseSim,
      confidence: 0.8,
      config: { minDecisionConfidence: 0.55 },
    });
    expect(decision).toBe("BUY");
  });

  it("selects SELL on strong negative sentiment", () => {
    const decision = selectRecommendedAction({
      sentiment: { ...baseSentiment, meanSentiment: -0.7 },
      tape: baseTape,
      sim: null,
      confidence: 0.8,
      config: { minDecisionConfidence: 0.55 },
    });
    expect(decision).toBe("SELL");
  });

  it("selects HOLD when confidence is below threshold", () => {
    const decision = selectRecommendedAction({
      sentiment: baseSentiment,
      tape: baseTape,
      sim: baseSim,
      confidence: 0.3,
      config: { minDecisionConfidence: 0.55 },
    });
    expect(decision).toBe("HOLD");
  });
});

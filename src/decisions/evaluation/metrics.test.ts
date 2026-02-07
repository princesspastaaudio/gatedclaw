import { describe, expect, it } from "vitest";
import {
  classifyDirection,
  computeCalibrationBuckets,
  computeReturnPct,
  isDecisionReady,
  isDirectionalHit,
  parseHorizonToMs,
} from "./metrics.js";

describe("decision evaluation metrics", () => {
  it("gates evaluation by horizon and min age", () => {
    const now = new Date("2024-01-02T00:00:00.000Z");
    const createdAt = "2024-01-01T00:00:00.000Z";
    const horizon = "24h";
    const readiness = isDecisionReady({
      createdAt,
      horizon,
      now,
      minAgeMinutesBeforeEval: 1500,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toBe("min-age");

    const ready = isDecisionReady({
      createdAt,
      horizon,
      now,
      minAgeMinutesBeforeEval: 60,
    });
    expect(ready.ready).toBe(true);
    expect(parseHorizonToMs(horizon)).toBe(24 * 60 * 60 * 1000);
  });

  it("computes return and hit classification", () => {
    const returnPct = computeReturnPct(100, 102);
    expect(returnPct).toBe(2);
    expect(classifyDirection({ returnPct, holdEpsilonReturnPct: 0.1 })).toBe("up");
    expect(isDirectionalHit({ action: "BUY", returnPct, holdEpsilonReturnPct: 0.1 })).toBe(true);
    expect(isDirectionalHit({ action: "SELL", returnPct, holdEpsilonReturnPct: 0.1 })).toBe(false);
    expect(isDirectionalHit({ action: "HOLD", returnPct: 0.05, holdEpsilonReturnPct: 0.1 })).toBe(
      true,
    );
  });

  it("aggregates calibration buckets", () => {
    const buckets = computeCalibrationBuckets({
      items: [
        { action: "BUY", returnPct: 1, confidence: 0.7 },
        { action: "SELL", returnPct: -0.5, confidence: 0.6 },
        { action: "HOLD", returnPct: 0.02, confidence: 0.8 },
      ],
      thresholds: [0.55, 0.75],
      holdEpsilonReturnPct: 0.1,
    });
    expect(buckets).toEqual([
      { threshold: 0.55, hitRate: 100, n: 3 },
      { threshold: 0.75, hitRate: 100, n: 1 },
    ]);
  });
});

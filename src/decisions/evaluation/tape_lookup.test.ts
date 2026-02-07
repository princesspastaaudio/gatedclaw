import { describe, expect, it } from "vitest";
import type { TapePriceRecord } from "../../market/tape/store.js";
import { buildTapeLookupIndex, findNearestTapeRecord } from "./tape_lookup.js";

function makeRecord(ts: string): TapePriceRecord {
  return {
    ts,
    symbol: "BTC",
    sources: [{ name: "source", price: 100, ts }],
    consensus: { price: 100, method: "median" },
    dispersion: { abs: 0, pct: 0.01 },
    health: { staleSources: [], ok: true },
    provenance: { runId: "run", agent: "tape", version: "dev" },
  };
}

describe("tape lookup", () => {
  it("prefers first record at or after the target", () => {
    const records = [
      makeRecord("2024-01-01T10:00:00.000Z"),
      makeRecord("2024-01-01T10:07:00.000Z"),
    ];
    const index = buildTapeLookupIndex(records);
    const found = findNearestTapeRecord({
      index,
      symbol: "BTC/USD",
      target: "2024-01-01T10:05:00.000Z",
      toleranceMs: 10 * 60 * 1000,
    });
    expect(found?.ts).toBe("2024-01-01T10:07:00.000Z");
  });

  it("falls back to nearest prior record within tolerance", () => {
    const records = [
      makeRecord("2024-01-01T10:02:00.000Z"),
      makeRecord("2024-01-01T10:30:00.000Z"),
    ];
    const index = buildTapeLookupIndex(records);
    const found = findNearestTapeRecord({
      index,
      symbol: "BTC",
      target: "2024-01-01T10:05:00.000Z",
      toleranceMs: 10 * 60 * 1000,
    });
    expect(found?.ts).toBe("2024-01-01T10:02:00.000Z");
  });

  it("returns null when no record is within tolerance", () => {
    const records = [makeRecord("2024-01-01T10:00:00.000Z")];
    const index = buildTapeLookupIndex(records);
    const found = findNearestTapeRecord({
      index,
      symbol: "BTC",
      target: "2024-01-01T12:00:00.000Z",
      toleranceMs: 5 * 60 * 1000,
    });
    expect(found).toBeNull();
  });
});

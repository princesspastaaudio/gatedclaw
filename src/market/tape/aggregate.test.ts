import { describe, expect, it } from "vitest";
import { aggregateTape, computeConsensus, detectStaleSources } from "./aggregate.js";

describe("computeConsensus", () => {
  it("computes median for odd and even", () => {
    expect(computeConsensus([{ name: "a", price: 1, ts: "" }]).price).toBe(1);
    const even = computeConsensus([
      { name: "a", price: 1, ts: "" },
      { name: "b", price: 3, ts: "" },
    ]).price;
    expect(even).toBe(2);
  });
});

describe("detectStaleSources", () => {
  it("flags stale prices", () => {
    const now = new Date("2024-01-02T00:00:00Z");
    const health = detectStaleSources(
      [{ name: "a", price: 1, ts: "2024-01-01T00:00:00Z" }],
      now,
      60,
    );
    expect(health.ok).toBe(false);
    expect(health.staleSources).toContain("a");
  });
});

describe("aggregateTape", () => {
  it("combines consensus and dispersion", () => {
    const aggregate = aggregateTape({
      prices: [
        { name: "a", price: 100, ts: "2024-01-01T00:00:00Z" },
        { name: "b", price: 110, ts: "2024-01-01T00:00:00Z" },
      ],
      now: new Date("2024-01-01T00:00:10Z"),
      staleAfterSeconds: 120,
    });
    expect(aggregate.consensus.price).toBe(105);
    expect(aggregate.dispersion.abs).toBe(10);
    expect(aggregate.health.ok).toBe(true);
  });
});

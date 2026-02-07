import { describe, expect, it } from "vitest";
import { aggregateSentiment } from "./bridge.js";

const baseLabel = {
  labeledAt: "2024-01-01T00:00:00Z",
  sentiment: { score: 0.4, confidence: 0.8 },
  tags: ["ETF"],
  summary: "summary",
  model: { name: "model", promptVersion: "v1" },
  tokenUsage: { input: 10, output: 5, total: 15 },
  provenance: { runId: "run", agent: "sentiment_labeler", version: "1" },
};

describe("aggregateSentiment", () => {
  it("builds buckets per category", () => {
    const buckets = aggregateSentiment([
      {
        ...baseLabel,
        articleId: "a",
        relevance: { btc: 1, eth: 0, macro: 0 },
      },
      {
        ...baseLabel,
        articleId: "b",
        sentiment: { score: -0.2, confidence: 0.6 },
        relevance: { btc: 0, eth: 1, macro: 0 },
      },
    ]);
    const overall = buckets.find((bucket) => bucket.category === "overall");
    expect(overall?.count).toBe(2);
    const btc = buckets.find((bucket) => bucket.category === "btc");
    expect(btc?.count).toBe(1);
  });
});

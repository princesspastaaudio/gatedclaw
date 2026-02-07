import { describe, expect, it } from "vitest";
import { scoreRelevance, shouldLabelArticle } from "./labeler.js";

describe("sentiment triage", () => {
  it("scores relevance for btc content", () => {
    const relevance = scoreRelevance("Bitcoin rallied after ETF approval");
    expect(relevance.btc).toBeGreaterThan(0);
  });

  it("filters by minimum relevance", () => {
    const decision = shouldLabelArticle(
      {
        id: "a",
        source: { type: "rss", name: "feed", url: "https://example.com" },
        url: "https://example.com/a",
        title: "Macro update",
        fetchedAt: new Date().toISOString(),
        text: "GDP data released",
        hash: "hash",
        provenance: { runId: "run", agent: "news_ingest", version: "1" },
      },
      true,
      0.6,
    );
    expect(decision.ok).toBe(false);
  });
});

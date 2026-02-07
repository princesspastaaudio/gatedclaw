import { describe, expect, it } from "vitest";
import type { NewsArticle } from "../market/news/store.js";
import type { SentimentLabel } from "../sentiment/store.js";
import { selectEvidenceArticles } from "./evidence.js";

const articles: NewsArticle[] = [
  {
    id: "a1",
    source: { type: "rss", name: "Test", url: "https://example.com/rss" },
    url: "https://example.com/a1",
    title: "ETF inflows surge",
    fetchedAt: "2024-01-01T00:00:00.000Z",
    text: "text",
    hash: "hash",
    provenance: { runId: "news-1", agent: "news_ingest", version: "dev" },
  },
  {
    id: "a2",
    source: { type: "rss", name: "Test", url: "https://example.com/rss" },
    url: "https://example.com/a2",
    title: "Macro risk jitters",
    fetchedAt: "2024-01-01T00:00:00.000Z",
    text: "text",
    hash: "hash",
    provenance: { runId: "news-2", agent: "news_ingest", version: "dev" },
  },
];

const labels: SentimentLabel[] = [
  {
    articleId: "a1",
    labeledAt: "2024-01-01T02:00:00.000Z",
    sentiment: { score: 0.8, confidence: 0.9 },
    tags: ["ETF"],
    relevance: { btc: 0.9, eth: 0, macro: 0 },
    summary: "positive",
    model: { name: "test", promptVersion: "1" },
    tokenUsage: { input: 1, output: 1, total: 2 },
    provenance: { runId: "sent-1", agent: "sentiment", version: "dev" },
  },
  {
    articleId: "a2",
    labeledAt: "2024-01-01T03:00:00.000Z",
    sentiment: { score: -0.4, confidence: 0.5 },
    tags: ["CPI"],
    relevance: { btc: 0.4, eth: 0, macro: 0.7 },
    summary: "mixed",
    model: { name: "test", promptVersion: "1" },
    tokenUsage: { input: 1, output: 1, total: 2 },
    provenance: { runId: "sent-1", agent: "sentiment", version: "dev" },
  },
];

describe("selectEvidenceArticles", () => {
  it("selects top scored labels for symbol bucket", () => {
    const selected = selectEvidenceArticles({
      symbol: "BTC/USD",
      bucketDates: ["2024-01-01"],
      labels,
      articles,
    });
    expect(selected.length).toBe(2);
    expect(selected[0]?.articleId).toBe("a1");
    expect(selected[0]?.title).toBe("ETF inflows surge");
  });
});

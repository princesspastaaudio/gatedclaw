import type { NewsArticle } from "../market/news/store.js";
import type { SentimentLabel } from "../sentiment/store.js";
import { clamp, parseIsoDate } from "./utils.js";

export type EvidenceArticle = {
  articleId: string;
  title: string;
  url: string;
  sentimentScore: number;
};

function bucketKey(value: string): string {
  const ts = parseIsoDate(value);
  if (ts === null) {
    return value.slice(0, 10);
  }
  return new Date(ts).toISOString().slice(0, 10);
}

function resolveCategory(symbol: string): "btc" | "eth" | "macro" | "overall" {
  if (symbol.startsWith("BTC")) {
    return "btc";
  }
  if (symbol.startsWith("ETH")) {
    return "eth";
  }
  return "overall";
}

export function selectEvidenceArticles(params: {
  symbol: string;
  bucketDates: string[];
  labels: SentimentLabel[];
  articles: NewsArticle[];
  limit?: number;
}): EvidenceArticle[] {
  if (params.labels.length === 0 || params.articles.length === 0) {
    return [];
  }
  const category = resolveCategory(params.symbol);
  const buckets = new Set(params.bucketDates.map((date) => bucketKey(date)));
  const articleById = new Map(params.articles.map((article) => [article.id, article]));
  const scored = params.labels
    .filter((label) => {
      if (category !== "overall") {
        return (label.relevance[category] ?? 0) > 0;
      }
      return true;
    })
    .filter((label) => {
      if (buckets.size === 0) {
        return true;
      }
      return buckets.has(bucketKey(label.labeledAt));
    })
    .map((label) => {
      const article = articleById.get(label.articleId);
      if (!article) {
        return null;
      }
      const weight = Math.abs(label.sentiment.score) * clamp(label.sentiment.confidence, 0, 1);
      return {
        weight,
        article,
        label,
      };
    })
    .filter((entry): entry is { weight: number; article: NewsArticle; label: SentimentLabel } =>
      Boolean(entry),
    )
    .sort((a, b) => b.weight - a.weight);
  const limit = params.limit ?? 5;
  return scored.slice(0, limit).map((entry) => ({
    articleId: entry.article.id,
    title: entry.article.title,
    url: entry.article.url,
    sentimentScore: entry.label.sentiment.score,
  }));
}

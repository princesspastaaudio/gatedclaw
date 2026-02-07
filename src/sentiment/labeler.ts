import type { NewsArticle } from "../market/news/store.js";
import type { SentimentLabel } from "./store.js";
import { VERSION } from "../version.js";
import { SENTIMENT_PROMPT_VERSION, SENTIMENT_SYSTEM_PROMPT } from "./prompts.js";

export type SentimentModelConfig = {
  name: string;
  tier?: string;
};

export type SentimentConfig = {
  model: SentimentModelConfig;
  triageEnabled: boolean;
  minRelevanceScore: number;
  tagSet: string[];
  maxArticlesPerRun: number;
  maxDailyTokens: number;
  maxSingleRunCostUsd: number;
};

const POSITIVE_WORDS = [
  "surge",
  "rally",
  "record",
  "bull",
  "breakout",
  "gain",
  "rise",
  "optimism",
  "approval",
  "upgrade",
];
const NEGATIVE_WORDS = [
  "drop",
  "crash",
  "bear",
  "selloff",
  "decline",
  "loss",
  "downgrade",
  "lawsuit",
  "ban",
];

export type RelevanceScores = { btc: number; eth: number; macro: number };

export function estimateTokens(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return 0;
  }
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export function estimateRunCostUsd(params: {
  inputTokens: number;
  outputTokens: number;
  tier?: string;
}): number {
  const tier = params.tier?.toLowerCase() ?? "";
  const perThousand = tier === "premium" ? 0.03 : tier === "standard" ? 0.01 : 0.002;
  const totalTokens = params.inputTokens + params.outputTokens;
  return Number((perThousand * (totalTokens / 1000)).toFixed(6));
}

export function scoreRelevance(text: string): RelevanceScores {
  const haystack = text.toLowerCase();
  const btcHits = /(\bbtc\b|\bbitcoin\b|\bsatoshi\b)/g;
  const ethHits = /(\beth\b|\bethereum\b|\bsolidity\b)/g;
  const macroHits =
    /(\bfed\b|\binflation\b|\binterest rate\b|\btreasury\b|\bjobs report\b|\bgdp\b)/g;
  const btc = (haystack.match(btcHits)?.length ?? 0) / 2;
  const eth = (haystack.match(ethHits)?.length ?? 0) / 2;
  const macro = (haystack.match(macroHits)?.length ?? 0) / 2;
  return {
    btc: Math.min(1, btc),
    eth: Math.min(1, eth),
    macro: Math.min(1, macro),
  };
}

export function deriveTags(text: string, tagSet: string[]): string[] {
  if (tagSet.length === 0) {
    return [];
  }
  const haystack = text.toLowerCase();
  const tags: string[] = [];
  for (const tag of tagSet) {
    const normalized = tag.toLowerCase();
    if (normalized && haystack.includes(normalized)) {
      tags.push(tag);
    }
  }
  return tags.slice(0, 8);
}

export function scoreSentiment(text: string): { score: number; confidence: number } {
  const haystack = text.toLowerCase();
  const pos = POSITIVE_WORDS.reduce((acc, word) => acc + (haystack.includes(word) ? 1 : 0), 0);
  const neg = NEGATIVE_WORDS.reduce((acc, word) => acc + (haystack.includes(word) ? 1 : 0), 0);
  const total = pos + neg;
  if (total === 0) {
    return { score: 0, confidence: 0.3 };
  }
  const score = (pos - neg) / total;
  const confidence = Math.min(1, 0.4 + Math.abs(score) * 0.6);
  return { score: Number(score.toFixed(3)), confidence: Number(confidence.toFixed(3)) };
}

export function summarizeText(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 240) {
    return trimmed;
  }
  return `${trimmed.slice(0, 237)}...`;
}

export function shouldLabelArticle(
  article: NewsArticle,
  triageEnabled: boolean,
  minRelevanceScore: number,
): { ok: boolean; relevance: RelevanceScores } {
  const relevance = scoreRelevance(`${article.title} ${article.text}`);
  if (!triageEnabled) {
    return { ok: true, relevance };
  }
  const maxScore = Math.max(relevance.btc, relevance.eth, relevance.macro);
  return { ok: maxScore >= minRelevanceScore, relevance };
}

export function buildSentimentLabel(params: {
  article: NewsArticle;
  model: SentimentModelConfig;
  tagSet: string[];
  runId: string;
  relevance: RelevanceScores;
}): SentimentLabel {
  const combined = `${params.article.title}\n\n${params.article.text}`;
  const sentiment = scoreSentiment(combined);
  const tags = deriveTags(combined, params.tagSet);
  const summary = summarizeText(params.article.text);
  const inputTokens = estimateTokens(SENTIMENT_SYSTEM_PROMPT) + estimateTokens(params.article.text);
  const outputTokens = estimateTokens(`${summary} ${tags.join(" ")}`) + 48;
  const totalTokens = inputTokens + outputTokens;
  return {
    articleId: params.article.id,
    labeledAt: new Date().toISOString(),
    sentiment,
    tags,
    relevance: params.relevance,
    summary,
    model: {
      name: params.model.name,
      tier: params.model.tier,
      promptVersion: SENTIMENT_PROMPT_VERSION,
    },
    tokenUsage: {
      input: inputTokens,
      output: outputTokens,
      total: totalTokens,
    },
    provenance: {
      runId: params.runId,
      agent: "sentiment_labeler",
      version: VERSION,
    },
  };
}

export function estimateArticleTokens(article: NewsArticle): { input: number; output: number } {
  const input = estimateTokens(`${SENTIMENT_SYSTEM_PROMPT}\n${article.text}`);
  const output = 200;
  return { input, output };
}

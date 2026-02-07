import fs from "node:fs";
import type { SentimentAggregateRecord } from "../../coin_calc/bridge.js";
import type { SignalProvider } from "./types.js";
import { COIN_CALC_SENTIMENT_PATH } from "../../coin_calc/bridge.js";
import { resolveStateDir } from "../../config/paths.js";
import { readNdjsonFile } from "../ndjson.js";
import { clamp, parseIsoDate, round } from "../utils.js";

export type SentimentSignalSummary = {
  bucketTs: string;
  meanSentiment: number;
  meanConfidence: number;
  momentum: number;
  stability: number;
  topTags: string[];
  bucketDates: string[];
  runId: string | null;
};

export type SentimentSignalScore = {
  score: number;
  confidence: number;
  momentum: number;
  stability: number;
};

function resolveCategory(symbol: string): SentimentAggregateRecord["category"] {
  if (symbol.startsWith("BTC")) {
    return "btc";
  }
  if (symbol.startsWith("ETH")) {
    return "eth";
  }
  return "overall";
}

function bucketTs(value: string): number {
  const parsed = parseIsoDate(value);
  if (parsed !== null) {
    return parsed;
  }
  return new Date(`${value}T00:00:00Z`).getTime();
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, val) => acc + val, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const avg = mean(values);
  const variance = mean(values.map((val) => (val - avg) ** 2));
  return Math.sqrt(variance);
}

export const SentimentSignalProvider: SignalProvider<
  SentimentAggregateRecord[],
  SentimentSignalSummary,
  SentimentSignalScore
> = {
  name: "sentiment",
  async load(context) {
    const filePath = `${resolveStateDir()}/${COIN_CALC_SENTIMENT_PATH}`;
    if (!fs.existsSync(filePath)) {
      return [];
    }
    return await readNdjsonFile(filePath, (value) => value as SentimentAggregateRecord);
  },
  summarize(loaded, context) {
    const category = resolveCategory(context.symbol);
    const buckets = loaded
      .filter((entry) => entry.category === category)
      .sort((a, b) => bucketTs(a.bucket) - bucketTs(b.bucket));
    const windowSize = context.config.sentimentWindowBuckets ?? 6;
    const window = buckets.slice(Math.max(0, buckets.length - windowSize));
    if (window.length === 0) {
      return null;
    }
    const sentiments = window.map((entry) => entry.meanSentiment);
    const confidences = window.map((entry) => entry.meanConfidence);
    const last = window.at(-1) ?? window[0];
    const momentum = (last.meanSentiment ?? 0) - (window[0]?.meanSentiment ?? 0);
    const stability = clamp(1 - stddev(sentiments) / 0.6, 0, 1);
    return {
      bucketTs: new Date(bucketTs(last.bucket)).toISOString(),
      meanSentiment: round(mean(sentiments), 4),
      meanConfidence: round(mean(confidences), 4),
      momentum: round(momentum, 4),
      stability: round(stability, 4),
      topTags: last.topTags ?? [],
      bucketDates: window.map((entry) => entry.bucket),
      runId: last.runId ?? null,
    };
  },
  score(summary) {
    return {
      score: summary.meanSentiment,
      confidence: summary.meanConfidence,
      momentum: summary.momentum,
      stability: summary.stability,
    };
  },
};

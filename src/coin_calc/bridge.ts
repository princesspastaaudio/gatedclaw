import fs from "node:fs";
import path from "node:path";
import type { SentimentLabel } from "../sentiment/store.js";
import { resolveStateDir } from "../config/paths.js";
import { VERSION } from "../version.js";

export type SentimentBucket = {
  bucket: string;
  category: "btc" | "eth" | "macro" | "overall";
  count: number;
  meanSentiment: number;
  meanConfidence: number;
  topTags: string[];
};

export type SentimentAggregateRecord = {
  runId: string;
  bucket: string;
  category: "btc" | "eth" | "macro" | "overall";
  count: number;
  meanSentiment: number;
  meanConfidence: number;
  topTags: string[];
  provenance: { runId: string; agent: string; version: string };
};

export const COIN_CALC_SENTIMENT_PATH = path.join("coin_calc", "sentiment.ndjson");

export function resolveCoinCalcSentimentPath(): string {
  return path.join(resolveStateDir(), COIN_CALC_SENTIMENT_PATH);
}

function bucketDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Number((sum / values.length).toFixed(4));
}

function topTags(labels: SentimentLabel[]): string[] {
  const counts = new Map<string, number>();
  for (const label of labels) {
    for (const tag of label.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);
}

function selectLabelsForCategory(labels: SentimentLabel[], category: SentimentBucket["category"]) {
  if (category === "overall") {
    return labels;
  }
  return labels.filter((label) => label.relevance[category] > 0);
}

export function aggregateSentiment(labels: SentimentLabel[]): SentimentBucket[] {
  if (labels.length === 0) {
    return [];
  }
  const bucket = bucketDate(labels[0].labeledAt);
  const categories: SentimentBucket["category"][] = ["overall", "btc", "eth", "macro"];
  const output: SentimentBucket[] = [];
  for (const category of categories) {
    const scoped = selectLabelsForCategory(labels, category);
    if (scoped.length === 0) {
      continue;
    }
    output.push({
      bucket,
      category,
      count: scoped.length,
      meanSentiment: mean(scoped.map((label) => label.sentiment.score)),
      meanConfidence: mean(scoped.map((label) => label.sentiment.confidence)),
      topTags: topTags(scoped),
    });
  }
  return output;
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function appendSentimentAggregates(params: {
  runId: string;
  labels: SentimentLabel[];
}): Promise<SentimentAggregateRecord[]> {
  const buckets = aggregateSentiment(params.labels);
  if (buckets.length === 0) {
    return [];
  }
  const filePath = resolveCoinCalcSentimentPath();
  await ensureDir(filePath);
  const records: SentimentAggregateRecord[] = buckets.map((bucket) => ({
    runId: params.runId,
    bucket: bucket.bucket,
    category: bucket.category,
    count: bucket.count,
    meanSentiment: bucket.meanSentiment,
    meanConfidence: bucket.meanConfidence,
    topTags: bucket.topTags,
    provenance: {
      runId: params.runId,
      agent: "sentiment_labeler",
      version: VERSION,
    },
  }));
  const lines = records.map((record) => JSON.stringify(record)).join("\n");
  await fs.promises.appendFile(filePath, `${lines}\n`, "utf8");
  return records;
}

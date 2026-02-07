import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { resolveStateDir } from "../config/paths.js";
import { VERSION } from "../version.js";

export type SentimentLabel = {
  articleId: string;
  labeledAt: string;
  sentiment: { score: number; confidence: number };
  tags: string[];
  relevance: { btc: number; eth: number; macro: number };
  summary: string;
  model: { name: string; tier?: string; promptVersion: string };
  tokenUsage: { input: number; output: number; total: number };
  provenance: { runId: string; agent: string; version: string };
};

export const SENTIMENT_LABELS_PATH = path.join("market", "news", "labels.ndjson");

export function resolveSentimentLabelsPath(): string {
  return path.join(resolveStateDir(), SENTIMENT_LABELS_PATH);
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function appendSentimentLabel(label: SentimentLabel): Promise<void> {
  const filePath = resolveSentimentLabelsPath();
  await ensureDir(filePath);
  await fs.promises.appendFile(filePath, `${JSON.stringify(label)}\n`, "utf8");
}

export async function loadLabeledArticleIds(): Promise<Set<string>> {
  const filePath = resolveSentimentLabelsPath();
  const ids = new Set<string>();
  if (!fs.existsSync(filePath)) {
    return ids;
  }
  const stream = fs.createReadStream(filePath, "utf8");
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as SentimentLabel;
      if (parsed.articleId) {
        ids.add(parsed.articleId);
      }
    } catch {
      continue;
    }
  }
  return ids;
}

export function buildSentimentProvenance(runId: string, agent: string) {
  return {
    runId,
    agent,
    version: VERSION,
  };
}

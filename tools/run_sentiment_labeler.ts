import crypto from "node:crypto";
import { loadConfig } from "../src/config/config.js";
import { aggregateSentiment, appendSentimentAggregates } from "../src/coin_calc/bridge.js";
import { loadNewsArticles } from "../src/market/news/store.js";
import { consumeBudgetedApproval, listBudgetedApprovals } from "../src/ops/budgeted.js";
import { appendRunRecord, buildRunRecord, notifyOperators } from "../src/ops/notify.js";
import {
  buildSentimentLabel,
  estimateRunCostUsd,
  shouldLabelArticle,
} from "../src/sentiment/labeler.js";
import {
  appendSentimentLabel,
  loadLabeledArticleIds,
  type SentimentLabel,
} from "../src/sentiment/store.js";

const cfg = loadConfig();
const sentimentCfg = cfg.sentiment ?? {};
if (sentimentCfg.enabled === false) {
  console.warn("sentiment labeler disabled");
  process.exit(0);
}

const approvals = await listBudgetedApprovals();
if (approvals.length === 0) {
  console.warn("no approved budgeted sentiment runs");
  process.exit(0);
}

const approval = approvals[approvals.length - 1];
const runId = approval.runId || `sent-${crypto.randomUUID()}`;

if (
  sentimentCfg.maxDailyTokens &&
  approval.payload.estimatedTokens > sentimentCfg.maxDailyTokens
) {
  await notifyOperators(
    `Sentiment run blocked: estimated tokens ${approval.payload.estimatedTokens} exceeds maxDailyTokens ${sentimentCfg.maxDailyTokens}.`,
  );
  process.exit(1);
}
if (
  sentimentCfg.maxSingleRunCostUsd &&
  approval.payload.estimatedCostUsd > sentimentCfg.maxSingleRunCostUsd
) {
  await notifyOperators(
    `Sentiment run blocked: estimated cost $${approval.payload.estimatedCostUsd.toFixed(4)} exceeds maxSingleRunCostUsd ${sentimentCfg.maxSingleRunCostUsd}.`,
  );
  process.exit(1);
}

const triageEnabled = sentimentCfg.triage?.enabled ?? true;
const minRelevanceScore = sentimentCfg.triage?.minRelevanceScore ?? 0.2;
const tagSet = sentimentCfg.tagging?.enabled === false ? [] : sentimentCfg.tagging?.tagSet ?? [];
const maxArticlesPerRun = sentimentCfg.maxArticlesPerRun ?? approval.payload.maxArticles;

const articles = await loadNewsArticles();
const labeledIds = await loadLabeledArticleIds();
const unlabeled = articles.filter((article) => !labeledIds.has(article.id));
const triaged = unlabeled
  .map((article) => {
    const decision = shouldLabelArticle(article, triageEnabled, minRelevanceScore);
    return { article, decision };
  })
  .filter((entry) => entry.decision.ok)
  .slice(0, maxArticlesPerRun);

const labels: SentimentLabel[] = [];
for (const entry of triaged) {
  const label = buildSentimentLabel({
    article: entry.article,
    model: approval.payload.model,
    tagSet,
    runId,
    relevance: entry.decision.relevance,
  });
  labels.push(label);
  await appendSentimentLabel(label);
}

await appendSentimentAggregates({ runId, labels });
const totals = labels.reduce(
  (acc, label) => {
    acc.input += label.tokenUsage.input;
    acc.output += label.tokenUsage.output;
    acc.total += label.tokenUsage.total;
    return acc;
  },
  { input: 0, output: 0, total: 0 },
);
const costEstimateUsd = estimateRunCostUsd({
  inputTokens: totals.input,
  outputTokens: totals.output,
  tier: approval.payload.model.tier,
});

const startedAt = approval.approvedAt;
const finishedAt = new Date().toISOString();

const record = buildRunRecord({
  runId,
  job: "sentiment_labeler",
  startedAt,
  finishedAt,
  counts: {
    labeled: labels.length,
    skipped: triaged.length - labels.length,
  },
  tokenUsage: totals,
  costEstimateUsd,
});

await appendRunRecord(record);
const buckets = aggregateSentiment(labels);
const topTags = buckets[0]?.topTags ?? [];
const meanSentiment =
  buckets[0]?.meanSentiment ??
  (labels.length > 0
    ? labels.reduce((acc, label) => acc + label.sentiment.score, 0) / labels.length
    : 0);

await notifyOperators(
  `Sentiment run complete\nlabeled: ${labels.length}\nskipped: ${unlabeled.length - labels.length}\nmean sentiment: ${meanSentiment.toFixed(3)}\ntop tags: ${topTags.join(", ") || "none"}\nactual tokens: ${totals.total}`,
);

await consumeBudgetedApproval(approval.runId);

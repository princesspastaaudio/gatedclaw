import { Command } from "commander";
import crypto from "node:crypto";
import { loadConfig } from "../config/config.js";
import { requestBudgetedRunApproval } from "../gating/requests.js";
import { createGatingService } from "../gating/service.js";
import { createTelegramApprovalMessenger } from "../gating/telegram.js";
import { loadNewsArticles } from "../market/news/store.js";
import {
  estimateArticleTokens,
  estimateRunCostUsd,
  shouldLabelArticle,
} from "../sentiment/labeler.js";
import { loadLabeledArticleIds } from "../sentiment/store.js";
import { resolveDefaultTelegramAccountId } from "../telegram/accounts.js";

const program = new Command();

program
  .option("--maxArticles <count>", "Max articles per run", "50")
  .option("--expectedValue <text>", "Expected value summary", "Sentiment rollup for coin-calc")
  .parse(process.argv);

const opts = program.opts();
const maxArticles = Math.max(1, Number.parseInt(opts.maxArticles, 10));
if (!Number.isFinite(maxArticles)) {
  throw new Error("maxArticles must be a number");
}

const cfg = loadConfig();
const adminChat = cfg.gating?.adminChats?.[0];
if (!adminChat) {
  throw new Error("gating.adminChats must include at least one chat id");
}

const sentimentCfg = cfg.sentiment ?? {};
const modelName = sentimentCfg.model?.name ?? "openclaw/sentiment-lite";
const modelTier = sentimentCfg.model?.tier;
const triageEnabled = sentimentCfg.triage?.enabled ?? true;
const minRelevanceScore = sentimentCfg.triage?.minRelevanceScore ?? 0.2;
const tagSet = sentimentCfg.tagging?.enabled === false ? [] : (sentimentCfg.tagging?.tagSet ?? []);
const maxArticlesPerRun = sentimentCfg.maxArticlesPerRun ?? maxArticles;

const articles = await loadNewsArticles();
const labeledIds = await loadLabeledArticleIds();
const unlabeled = articles.filter((article) => !labeledIds.has(article.id));

const triaged = unlabeled
  .map((article) => {
    const decision = shouldLabelArticle(article, triageEnabled, minRelevanceScore);
    return { article, decision };
  })
  .filter((entry) => entry.decision.ok);

const pendingArticles = triaged.slice(0, Math.min(maxArticlesPerRun, maxArticles));
const estimatedTokens = pendingArticles.reduce((acc, entry) => {
  const tokens = estimateArticleTokens(entry.article);
  return acc + tokens.input + tokens.output;
}, 0);
const estimatedCostUsd = estimateRunCostUsd({
  inputTokens: estimatedTokens,
  outputTokens: 0,
  tier: modelTier,
});

const runId = `sent-${crypto.randomUUID()}`;
const messenger = createTelegramApprovalMessenger({
  accountId: resolveDefaultTelegramAccountId(cfg),
});
const service = createGatingService({ cfg, messenger });

const result = await requestBudgetedRunApproval({
  runId,
  actor: {
    channel: "telegram",
    chatId: String(adminChat),
  },
  payload: {
    runId,
    job: "sentiment_labeler",
    pendingArticles: pendingArticles.length,
    maxArticles: Math.min(maxArticlesPerRun, maxArticles),
    estimatedTokens,
    estimatedCostUsd,
    model: { name: modelName, tier: modelTier },
    expectedValue: opts.expectedValue,
  },
  service,
});

if (!result.ok) {
  throw new Error(`Approval request failed: ${result.reason ?? "unknown"}`);
}

console.log(`sentiment approval requested: ${result.request?.approvalId ?? "unknown"}`);

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  loadConfig,
  readConfigFileSnapshot,
  resolveConfigSnapshotHash,
} from "../src/config/config.js";
import { resolveStateDir } from "../src/config/paths.js";
import { appendDecisionCandidates, appendDecisionProposals } from "../src/decisions/store.js";
import { buildDecisionCandidate } from "../src/decisions/engine.js";
import { selectEvidenceArticles } from "../src/decisions/evidence.js";
import { formatProposalNotes, shouldSubmitProposal } from "../src/decisions/proposals.js";
import type { DecisionCandidate, DecisionProposal } from "../src/decisions/types.js";
import { SentimentSignalProvider } from "../src/decisions/signals/sentiment.js";
import { TapeSignalProvider } from "../src/decisions/signals/tape.js";
import { CoinCalcSimSignalProvider } from "../src/decisions/signals/coin-calc-sim.js";
import { readNdjsonFile } from "../src/decisions/ndjson.js";
import { normalizeSymbol, parseIsoDate } from "../src/decisions/utils.js";
import { resolveSentimentLabelsPath, type SentimentLabel } from "../src/sentiment/store.js";
import { loadNewsArticles, type NewsArticle } from "../src/market/news/store.js";
import { createGatingService } from "../src/gating/service.js";
import { createTelegramApprovalMessenger } from "../src/gating/telegram.js";
import { requestTradeExecuteApproval } from "../src/gating/requests.js";
import { resolveDefaultTelegramAccountId } from "../src/telegram/accounts.js";
import { appendRunRecord, buildRunRecord, notifyOperators } from "../src/ops/notify.js";

type SkipHistogram = Record<string, number>;

function bump(histogram: SkipHistogram, key: string): void {
  histogram[key] = (histogram[key] ?? 0) + 1;
}

function maxTimestamp(values: Array<string | undefined | null>): number {
  return values.reduce((acc, value) => {
    const ts = parseIsoDate(value ?? null);
    if (ts === null) {
      return acc;
    }
    return Math.max(acc, ts);
  }, 0);
}

function resolveLatestInputTimestamp(params: {
  sentimentBuckets: Array<{ bucket: string }>;
  tapeRecords: Array<{ ts: string }>;
  simRecords: Array<{ ts?: string; createdAt?: string }>;
}): number {
  const sentimentLatest = params.sentimentBuckets.reduce(
    (acc, entry) => Math.max(acc, parseIsoDate(entry.bucket) ?? 0),
    0,
  );
  const tapeLatest = params.tapeRecords.reduce(
    (acc, entry) => Math.max(acc, parseIsoDate(entry.ts) ?? 0),
    0,
  );
  const simLatest = params.simRecords.reduce(
    (acc, entry) => Math.max(acc, maxTimestamp([entry.ts, entry.createdAt])),
    0,
  );
  return Math.max(sentimentLatest, tapeLatest, simLatest);
}

const cfg = loadConfig();
const decisionCfg = cfg.decision ?? {};

if (decisionCfg.enabled === false) {
  console.log("decision synth disabled via config.decision.enabled=false");
  process.exit(0);
}

const runId = `decision-${crypto.randomUUID()}`;
const startedAt = new Date().toISOString();

const symbols = cfg.marketTape?.symbols?.length ? cfg.marketTape.symbols : ["BTC", "ETH"];
const horizons = decisionCfg.horizons ?? ["4h", "24h", "72h"];
const maxProposalsPerRun = decisionCfg.maxProposalsPerRun ?? 3;

const configSnapshot = await readConfigFileSnapshot();
const configHash = resolveConfigSnapshotHash(configSnapshot);

const sentimentData = await SentimentSignalProvider.load({ config: decisionCfg });
const tapeData = await TapeSignalProvider.load({ config: decisionCfg });
const simData = await CoinCalcSimSignalProvider.load({ config: decisionCfg });

const latestInputMs = resolveLatestInputTimestamp({
  sentimentBuckets: sentimentData,
  tapeRecords: tapeData,
  simRecords: simData,
});
const lastCandidates = await readNdjsonFile(
  path.join(resolveStateDir(), "decisions", "candidates.ndjson"),
  (value) => value as DecisionCandidate,
);
const lastCandidateMs = lastCandidates.reduce(
  (acc, entry) => Math.max(acc, parseIsoDate(entry.createdAt) ?? 0),
  0,
);
const hasNewData = latestInputMs > 0 && latestInputMs > lastCandidateMs;

const labelsPath = resolveSentimentLabelsPath();
const labels = fs.existsSync(labelsPath)
  ? await readNdjsonFile(labelsPath, (value) => value as SentimentLabel)
  : [];
const articles = labels.length > 0 ? await loadNewsArticles() : [];
const articleById = new Map(articles.map((entry) => [entry.id, entry]));

const candidates: DecisionCandidate[] = [];
const proposals: DecisionProposal[] = [];
const skippedReasons: SkipHistogram = {};

if (!hasNewData) {
  bump(skippedReasons, "no-new-data");
} else if (sentimentData.length === 0 || tapeData.length === 0) {
  bump(skippedReasons, "missing-inputs");
} else {
  const coinCalcRefs = {
    simFile: fs.existsSync(path.join(resolveStateDir(), "coin_calc", "sim_results.ndjson"))
      ? "state/coin_calc/sim_results.ndjson"
      : null,
    featuresFile: fs.existsSync(path.join(resolveStateDir(), "coin_calc", "features.ndjson"))
      ? "state/coin_calc/features.ndjson"
      : null,
  };
  for (const rawSymbol of symbols) {
    const symbol = normalizeSymbol(rawSymbol);
    for (const horizon of horizons) {
      const context = { symbol, horizon, config: decisionCfg };
      const sentimentSummary = SentimentSignalProvider.summarize(sentimentData, context);
      const tapeSummary = TapeSignalProvider.summarize(tapeData, context);
      if (!sentimentSummary || !tapeSummary) {
        bump(skippedReasons, "insufficient-signal");
        continue;
      }
      const simSummary = CoinCalcSimSignalProvider.summarize(simData, context);
      const evidenceArticles = selectEvidenceArticles({
        symbol,
        bucketDates: sentimentSummary.bucketDates,
        labels,
        articles,
      });
      const evidence = {
        articles: evidenceArticles,
        runs: {
          newsRunId: evidenceArticles[0]
            ? articleById.get(evidenceArticles[0].articleId)?.provenance.runId ?? null
            : null,
          sentimentRunId: sentimentSummary.runId,
          tapeRunId: tapeSummary.runId,
        },
      };
      const candidate = buildDecisionCandidate({
        symbol,
        horizon,
        sentiment: sentimentSummary,
        tape: tapeSummary,
        sim: simSummary,
        config: decisionCfg,
        trading: cfg.trading,
        runId,
        createdAt: new Date().toISOString(),
        configHash,
        evidence,
        coinCalcRefs,
      });
      candidates.push(candidate);
    }
  }
}

if (candidates.length > 0) {
  await appendDecisionCandidates(candidates);
}

let proposalsSubmitted = 0;
const approvals: string[] = [];

if (decisionCfg.autoSubmitProposals && candidates.length > 0) {
  const adminChat = cfg.gating?.adminChats?.[0];
  if (!adminChat) {
    bump(skippedReasons, "missing-admin-chat");
  } else {
  const messenger = createTelegramApprovalMessenger({
    accountId: resolveDefaultTelegramAccountId(cfg),
  });
  const service = createGatingService({ cfg, messenger });
  const existingProposals = await readNdjsonFile(
    path.join(resolveStateDir(), "decisions", "proposals.ndjson"),
    (value) => value as DecisionProposal,
  );
  const candidatesByConfidence = [...candidates].sort(
    (a, b) => b.confidence - a.confidence,
  );
  for (const candidate of candidatesByConfidence.slice(0, maxProposalsPerRun)) {
    const decision = shouldSubmitProposal({
      candidate,
      config: decisionCfg,
      now: new Date(),
      hasNewData,
      existingProposals,
    });
    if (!decision.ok) {
      if (decision.reason) {
        bump(skippedReasons, decision.reason);
      }
      continue;
    }
    const proposalId = crypto.randomUUID();
    const approval = await requestTradeExecuteApproval({
      proposalId,
      actor: {
        channel: "telegram",
        chatId: String(adminChat),
      },
      payload: {
        decisionId: candidate.decisionId,
        proposalId,
        symbol: candidate.symbol,
        action: candidate.recommendedAction === "BUY" ? "BUY" : "SELL",
        qty: candidate.positionSizing.qty,
        unit: candidate.positionSizing.unit,
        maxUsd: candidate.positionSizing.maxUsd,
        confidence: candidate.confidence,
        horizon: candidate.horizon,
        notes: `${candidate.expectedValue.directional} edge ${candidate.expectedValue.edgePct.toFixed(2)}%`,
      },
      service,
    });
    const proposal: DecisionProposal = {
      proposalId,
      decisionId: candidate.decisionId,
      createdAt: new Date().toISOString(),
      approvalId: approval.request?.approvalId ?? null,
      status: approval.ok ? "submitted" : "created",
      notes: formatProposalNotes(candidate),
    };
    proposals.push(proposal);
    existingProposals.push(proposal);
    if (approval.ok && approval.request?.approvalId) {
      proposalsSubmitted += 1;
      approvals.push(approval.request.approvalId);
    }
  }
  }
}

if (proposals.length > 0) {
  await appendDecisionProposals(proposals);
}

const finishedAt = new Date().toISOString();
const record = buildRunRecord({
  runId,
  job: "decision_synth",
  startedAt,
  finishedAt,
  counts: {
    candidatesGenerated: candidates.length,
    proposalsSubmitted,
    ...Object.fromEntries(
      Object.entries(skippedReasons).map(([reason, count]) => [`skipped.${reason}`, count]),
    ),
  },
});

await appendRunRecord(record);

const topCandidate = candidates.sort((a, b) => b.confidence - a.confidence)[0];
const summaryLines = [
  "Decision Candidate Summary",
  `Candidates: ${candidates.length} · Proposals: ${proposalsSubmitted}`,
];
if (topCandidate) {
  summaryLines.push(
    `Top: ${topCandidate.symbol} ${topCandidate.recommendedAction} ${topCandidate.positionSizing.qty.toFixed(6)} ${topCandidate.positionSizing.unit}`,
  );
  summaryLines.push(
    `Confidence: ${(topCandidate.confidence * 100).toFixed(1)}% · Dispersion ${topCandidate.signals.marketTape.dispersionPct.toFixed(2)}%`,
  );
  summaryLines.push(
    `Why: sentiment ${topCandidate.signals.sentiment.score.toFixed(2)} trend ${topCandidate.signals.marketTape.consensusPrice.toFixed(2)} ${topCandidate.expectedValue.directional}`,
  );
}
if (approvals.length > 0) {
  summaryLines.push(`Approvals: ${approvals.join(", ")}`);
}

await notifyOperators(summaryLines.join("\n"));

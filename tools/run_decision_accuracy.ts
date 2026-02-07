import crypto from "node:crypto";
import { loadConfig } from "../src/config/config.js";
import { loadDecisionCandidates } from "../src/decisions/store.js";
import {
  appendDecisionAccuracy,
  loadDecisionOutcomes,
} from "../src/decisions/evaluation/store.js";
import type { DecisionCandidate } from "../src/decisions/types.js";
import type { DecisionAccuracyMetric } from "../src/decisions/evaluation/types.js";
import {
  computeCalibrationBuckets,
  computeMean,
  computePercentile,
  isDirectionalHit,
} from "../src/decisions/evaluation/metrics.js";
import { parseIsoDate, round } from "../src/decisions/utils.js";
import { appendRunRecord, buildRunRecord, notifyOperators } from "../src/ops/notify.js";
import { VERSION } from "../src/version.js";

const cfg = loadConfig();
const evaluationCfg = cfg.decisionEvaluation ?? {};

if (evaluationCfg.enabled === false) {
  console.log("decision accuracy disabled via config.decisionEvaluation.enabled=false");
  process.exit(0);
}

const runId = `decision-accuracy-${crypto.randomUUID()}`;
const startedAt = new Date().toISOString();
const now = new Date();

const outcomes = await loadDecisionOutcomes();
const candidates = await loadDecisionCandidates();

const candidateByDecision = new Map<string, DecisionCandidate>();
for (const candidate of candidates) {
  const existing = candidateByDecision.get(candidate.decisionId);
  if (!existing || candidate.createdAt < existing.createdAt) {
    candidateByDecision.set(candidate.decisionId, candidate);
  }
}

const holdEpsilon = evaluationCfg.holdEpsilonReturnPct ?? 0.1;
const windowN = evaluationCfg.accuracyWindowN ?? 200;
const windowDays = evaluationCfg.accuracyWindowDays ?? 30;
const confidenceBuckets = evaluationCfg.confidenceBuckets ?? [0.55, 0.65, 0.75];

const cutoffMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

const recentOutcomes = outcomes
  .filter((outcome) => {
    const evaluatedMs = parseIsoDate(outcome.evaluatedAt);
    return evaluatedMs !== null && evaluatedMs >= cutoffMs;
  })
  .sort((a, b) => {
    const aMs = parseIsoDate(a.evaluatedAt) ?? 0;
    const bMs = parseIsoDate(b.evaluatedAt) ?? 0;
    if (aMs !== bMs) {
      return bMs - aMs;
    }
    return a.decisionId.localeCompare(b.decisionId);
  })
  .slice(0, windowN);

type JoinedOutcome = {
  outcomeId: string;
  decisionId: string;
  symbol: string;
  horizon: string;
  returnPct: number;
  evaluatedAt: string;
  action: DecisionCandidate["recommendedAction"];
  confidence: number;
  className: string;
};

const joined: JoinedOutcome[] = [];

for (const outcome of recentOutcomes) {
  const candidate = candidateByDecision.get(outcome.decisionId);
  if (!candidate) {
    continue;
  }
  const className = candidate.signals.coinCalc.summary ? "sentiment+tape+with_sim" : "sentiment+tape";
  joined.push({
    outcomeId: outcome.outcomeId,
    decisionId: outcome.decisionId,
    symbol: outcome.symbol,
    horizon: outcome.horizon,
    returnPct: outcome.returnPct,
    evaluatedAt: outcome.evaluatedAt,
    action: candidate.recommendedAction,
    confidence: candidate.confidence,
    className,
  });
}

const metrics: DecisionAccuracyMetric[] = [];

function computeMetrics(scope: DecisionAccuracyMetric["scope"], items: JoinedOutcome[]) {
  if (items.length === 0) {
    return;
  }
  const returns = items.map((item) => item.returnPct);
  const counts = {
    total: items.length,
    buy: items.filter((item) => item.action === "BUY").length,
    sell: items.filter((item) => item.action === "SELL").length,
    hold: items.filter((item) => item.action === "HOLD").length,
  };
  const hits = items.filter((item) =>
    isDirectionalHit({
      action: item.action,
      returnPct: item.returnPct,
      holdEpsilonReturnPct: holdEpsilon,
    }),
  ).length;
  const meanConfidence = computeMean(items.map((item) => item.confidence));
  const calibration = computeCalibrationBuckets({
    items: items.map((item) => ({
      action: item.action,
      returnPct: item.returnPct,
      confidence: item.confidence,
    })),
    thresholds: confidenceBuckets,
    holdEpsilonReturnPct: holdEpsilon,
  });
  metrics.push({
    metricId: crypto.randomUUID(),
    ts: now.toISOString(),
    scope,
    window: { n: windowN, days: windowDays },
    counts,
    accuracy: {
      directionalHitRate: round((hits / items.length) * 100, 4),
      avgReturnPct: computeMean(returns),
      medianReturnPct: computePercentile(returns, 50),
      p10ReturnPct: computePercentile(returns, 10),
      p90ReturnPct: computePercentile(returns, 90),
    },
    calibration: {
      meanConfidence,
      hitRateAtOrAboveConfidence: calibration,
    },
    provenance: { runId, agent: "decision_accuracy", version: VERSION },
  });
}

const bySymbolHorizon = new Map<string, JoinedOutcome[]>();
const byClass = new Map<string, JoinedOutcome[]>();

for (const item of joined) {
  const symbolKey = `${item.symbol}::${item.horizon}`;
  const symbolEntries = bySymbolHorizon.get(symbolKey) ?? [];
  symbolEntries.push(item);
  bySymbolHorizon.set(symbolKey, symbolEntries);

  const classEntries = byClass.get(item.className) ?? [];
  classEntries.push(item);
  byClass.set(item.className, classEntries);
}

for (const [key, items] of bySymbolHorizon.entries()) {
  const [symbol, horizon] = key.split("::");
  if (!symbol || !horizon) {
    continue;
  }
  computeMetrics({ symbol, horizon }, items);
}

for (const [className, items] of byClass.entries()) {
  computeMetrics({ class: className }, items);
}

if (metrics.length > 0) {
  await appendDecisionAccuracy(metrics);
}

const finishedAt = new Date().toISOString();
const record = buildRunRecord({
  runId,
  job: "decision_accuracy",
  startedAt,
  finishedAt,
  counts: {
    metricsWritten: metrics.length,
  },
});
await appendRunRecord(record);

const notifyCfg = evaluationCfg.notifications ?? {};
if (notifyCfg.enabled && notifyCfg.level === "summary") {
  const highlight = metrics.find(
    (metric) => "symbol" in metric.scope && metric.scope.symbol === "BTC/USD" && metric.scope.horizon === "24h",
  );
  const hitRate = highlight ? highlight.accuracy.directionalHitRate.toFixed(2) : "n/a";
  const summary = [
    "Decision accuracy run complete.",
    `Metrics written: ${metrics.length}.`,
    `BTC/USD 24h hit rate: ${hitRate}.`,
  ].join("\n");
  await notifyOperators(summary);
}

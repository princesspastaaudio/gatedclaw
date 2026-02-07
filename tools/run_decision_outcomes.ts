import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config/config.js";
import { resolveStateDir } from "../src/config/paths.js";
import { loadDecisionCandidates } from "../src/decisions/store.js";
import { readNdjsonFile } from "../src/decisions/ndjson.js";
import {
  appendDecisionOutcomes,
  buildOutcomeIndexKey,
  isOutcomeIndexed,
  readOutcomeIndex,
  writeOutcomeIndex,
} from "../src/decisions/evaluation/store.js";
import {
  classifyDirection,
  computeReturnPct,
  isDecisionReady,
  parseHorizonToMs,
} from "../src/decisions/evaluation/metrics.js";
import {
  buildTapeLookupIndex,
  findNearestTapeRecord,
  DEFAULT_TAPE_LOOKUP_TOLERANCE_MINUTES,
} from "../src/decisions/evaluation/tape_lookup.js";
import type { DecisionOutcome } from "../src/decisions/evaluation/types.js";
import { TAPE_PRICES_PATH, type TapePriceRecord } from "../src/market/tape/store.js";
import { parseIsoDate, round } from "../src/decisions/utils.js";
import { appendRunRecord, buildRunRecord, notifyOperators } from "../src/ops/notify.js";
import { VERSION } from "../src/version.js";

const cfg = loadConfig();
const evaluationCfg = cfg.decisionEvaluation ?? {};

if (evaluationCfg.enabled === false) {
  console.log("decision outcomes disabled via config.decisionEvaluation.enabled=false");
  process.exit(0);
}

const runId = `decision-outcomes-${crypto.randomUUID()}`;
const startedAt = new Date().toISOString();
const now = new Date();

const decisionHorizons = cfg.decision?.horizons ?? ["4h", "24h", "72h"];
const horizons = evaluationCfg.horizons ?? decisionHorizons;
const maxDecisionsPerRun = evaluationCfg.maxDecisionsPerRun ?? 200;
const holdEpsilon = evaluationCfg.holdEpsilonReturnPct ?? 0.1;
const minTapeHealthSourcesOk = evaluationCfg.minTapeHealthSourcesOk ?? 2;
const maxDispersionPct = evaluationCfg.maxDispersionPct ?? cfg.decision?.maxDispersionPct ?? 2.5;
const toleranceMs = DEFAULT_TAPE_LOOKUP_TOLERANCE_MINUTES * 60 * 1000;

const candidates = await loadDecisionCandidates();
const tapePath = path.join(resolveStateDir(), TAPE_PRICES_PATH);
const tapeRecords = fs.existsSync(tapePath)
  ? await readNdjsonFile(tapePath, (value) => value as TapePriceRecord)
  : [];

const tapeIndex = buildTapeLookupIndex(tapeRecords);
const outcomeIndex = await readOutcomeIndex();

const outcomes: DecisionOutcome[] = [];
const skipReasons: Record<string, number> = {};

function bump(reason: string): void {
  skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
}

function resolveTapeHealth(record: TapePriceRecord) {
  const dispersionPct = round((record.dispersion.pct ?? 0) * 100, 4);
  const sourcesOk = record.health.ok ? record.sources.length : 0;
  return {
    dispersionPct,
    sourcesOk,
    staleSources: record.health.staleSources ?? [],
  };
}

function isTapeHealthy(record: TapePriceRecord): boolean {
  const health = resolveTapeHealth(record);
  if (health.dispersionPct > maxDispersionPct) {
    return false;
  }
  if (health.sourcesOk < minTapeHealthSourcesOk) {
    return false;
  }
  return true;
}

for (const candidate of candidates) {
  if (outcomes.length >= maxDecisionsPerRun) {
    bump("max-per-run");
    break;
  }
  if (!horizons.includes(candidate.horizon)) {
    bump("horizon-disabled");
    continue;
  }
  if (isOutcomeIndexed(outcomeIndex, candidate.decisionId, candidate.horizon)) {
    bump("already-evaluated");
    continue;
  }
  const parsedHorizonMs = parseHorizonToMs(candidate.horizon);
  if (parsedHorizonMs === null) {
    bump("invalid-horizon");
    continue;
  }
  const resolvedMinAgeMinutes =
    evaluationCfg.minAgeMinutesBeforeEval ?? Math.round(parsedHorizonMs / 60000);
  const readiness = isDecisionReady({
    createdAt: candidate.createdAt,
    horizon: candidate.horizon,
    now,
    minAgeMinutesBeforeEval: resolvedMinAgeMinutes,
  });
  if (!readiness.ready) {
    bump(readiness.reason ?? "not-ready");
    continue;
  }
  const createdMs = parseIsoDate(candidate.createdAt);
  if (createdMs === null) {
    bump("invalid-created-at");
    continue;
  }
  const entryRecord = findNearestTapeRecord({
    index: tapeIndex,
    symbol: candidate.symbol,
    target: candidate.createdAt,
    toleranceMs,
  });
  if (!entryRecord) {
    bump("no-tape-entry");
    continue;
  }
  const exitRecord = findNearestTapeRecord({
    index: tapeIndex,
    symbol: candidate.symbol,
    target: createdMs + parsedHorizonMs,
    toleranceMs,
  });
  if (!exitRecord) {
    bump("no-tape-exit");
    continue;
  }
  if (!isTapeHealthy(entryRecord) || !isTapeHealthy(exitRecord)) {
    bump("tape-health");
    continue;
  }
  const entryPrice = entryRecord.consensus.price ?? 0;
  const exitPrice = exitRecord.consensus.price ?? 0;
  const returnPct = computeReturnPct(entryPrice, exitPrice);
  const direction = classifyDirection({ returnPct, holdEpsilonReturnPct: holdEpsilon });
  const tapeHealth = resolveTapeHealth(exitRecord);
  const outcome: DecisionOutcome = {
    outcomeId: crypto.randomUUID(),
    decisionId: candidate.decisionId,
    symbol: candidate.symbol,
    horizon: candidate.horizon,
    decisionCreatedAt: candidate.createdAt,
    evaluatedAt: now.toISOString(),
    entry: { ts: entryRecord.ts, price: round(entryPrice, 6), source: "market_tape.median" },
    exit: { ts: exitRecord.ts, price: round(exitPrice, 6), source: "market_tape.median" },
    returnPct,
    direction,
    realizedVolatilityPct: round(Math.abs(returnPct), 4),
    tapeHealth,
    provenance: { runId, agent: "decision_outcomes", version: VERSION },
  };
  outcomes.push(outcome);
  outcomeIndex[buildOutcomeIndexKey(candidate.decisionId, candidate.horizon)] = outcome.outcomeId;
}

if (outcomes.length > 0) {
  await appendDecisionOutcomes(outcomes);
  await writeOutcomeIndex(outcomeIndex);
}

const finishedAt = new Date().toISOString();
const record = buildRunRecord({
  runId,
  job: "decision_outcomes",
  startedAt,
  finishedAt,
  counts: {
    evaluated: outcomes.length,
    skippedNoTape: (skipReasons["no-tape-entry"] ?? 0) + (skipReasons["no-tape-exit"] ?? 0),
    skippedAlreadyEvaluated: skipReasons["already-evaluated"] ?? 0,
    skippedNotReady:
      (skipReasons["min-age"] ?? 0) + (skipReasons["horizon-not-elapsed"] ?? 0),
    skippedTapeHealth: skipReasons["tape-health"] ?? 0,
  },
});
await appendRunRecord(record);

const notifyCfg = evaluationCfg.notifications ?? {};
if (notifyCfg.enabled && notifyCfg.level === "summary") {
  const summary = [
    "Decision outcomes run complete.",
    `Evaluated: ${outcomes.length}.`,
    `Skipped (already evaluated): ${skipReasons["already-evaluated"] ?? 0}.`,
    `Skipped (no tape): ${(skipReasons["no-tape-entry"] ?? 0) + (skipReasons["no-tape-exit"] ?? 0)}.`,
    `Skipped (tape health): ${skipReasons["tape-health"] ?? 0}.`,
  ].join("\n");
  await notifyOperators(summary);
}

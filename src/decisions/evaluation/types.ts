import type { DecisionDirectional } from "../types.js";

export type DecisionOutcome = {
  outcomeId: string;
  decisionId: string;
  symbol: string;
  horizon: string;
  decisionCreatedAt: string;
  evaluatedAt: string;
  entry: { ts: string; price: number; source: "market_tape.median" };
  exit: { ts: string; price: number; source: "market_tape.median" };
  returnPct: number;
  direction: DecisionDirectional;
  realizedVolatilityPct: number;
  tapeHealth: { dispersionPct: number; sourcesOk: number; staleSources: string[] };
  provenance: { runId: string; agent: string; version: string };
};

export type DecisionAccuracyScope = { symbol: string; horizon: string } | { class: string };

export type DecisionAccuracyMetric = {
  metricId: string;
  ts: string;
  scope: DecisionAccuracyScope;
  window: { n: number; days: number };
  counts: { total: number; buy: number; sell: number; hold: number };
  accuracy: {
    directionalHitRate: number;
    avgReturnPct: number;
    medianReturnPct: number;
    p10ReturnPct: number;
    p90ReturnPct: number;
  };
  calibration: {
    meanConfidence: number;
    hitRateAtOrAboveConfidence: Array<{ threshold: number; hitRate: number; n: number }>;
  };
  provenance: { runId: string; agent: string; version: string };
};

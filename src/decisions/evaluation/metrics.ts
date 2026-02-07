import type { DecisionAction, DecisionDirectional } from "../types.js";
import { round, parseIsoDate } from "../utils.js";

const HORIZON_PATTERN = /^(\d+)\s*([mhdw])$/i;

export function parseHorizonToMs(horizon: string): number | null {
  const trimmed = horizon.trim();
  if (!trimmed) {
    return null;
  }
  const match = HORIZON_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const unit = match[2].toLowerCase();
  const multiplier =
    unit === "m"
      ? 60 * 1000
      : unit === "h"
        ? 60 * 60 * 1000
        : unit === "d"
          ? 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;
  return value * multiplier;
}

export function isDecisionReady(params: {
  createdAt: string;
  horizon: string;
  now: Date;
  minAgeMinutesBeforeEval: number;
}): { ready: boolean; reason?: string; horizonMs?: number } {
  const createdMs = parseIsoDate(params.createdAt);
  if (createdMs === null) {
    return { ready: false, reason: "invalid-created-at" };
  }
  const horizonMs = parseHorizonToMs(params.horizon);
  if (horizonMs === null) {
    return { ready: false, reason: "invalid-horizon" };
  }
  const nowMs = params.now.getTime();
  const ageMinutes = (nowMs - createdMs) / (60 * 1000);
  if (ageMinutes < params.minAgeMinutesBeforeEval) {
    return { ready: false, reason: "min-age" };
  }
  if (nowMs < createdMs + horizonMs) {
    return { ready: false, reason: "horizon-not-elapsed", horizonMs };
  }
  return { ready: true, horizonMs };
}

export function computeReturnPct(entry: number, exit: number): number {
  if (!Number.isFinite(entry) || entry <= 0) {
    return 0;
  }
  return round(((exit - entry) / entry) * 100, 4);
}

export function classifyDirection(params: {
  returnPct: number;
  holdEpsilonReturnPct: number;
}): DecisionDirectional {
  const epsilon = Math.max(0, params.holdEpsilonReturnPct);
  if (Math.abs(params.returnPct) < epsilon) {
    return "flat";
  }
  return params.returnPct > 0 ? "up" : "down";
}

export function isDirectionalHit(params: {
  action: DecisionAction;
  returnPct: number;
  holdEpsilonReturnPct: number;
}): boolean {
  const epsilon = Math.max(0, params.holdEpsilonReturnPct);
  if (params.action === "HOLD") {
    return Math.abs(params.returnPct) < epsilon;
  }
  if (params.action === "BUY") {
    return params.returnPct > 0;
  }
  return params.returnPct < 0;
}

export function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return round(sorted[lower], 4);
  }
  const weight = rank - lower;
  const value = sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
  return round(value, 4);
}

export function computeMean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((acc, value) => acc + value, 0);
  return round(total / values.length, 4);
}

export type CalibrationInput = {
  action: DecisionAction;
  returnPct: number;
  confidence: number;
};

export function computeCalibrationBuckets(params: {
  items: CalibrationInput[];
  thresholds: number[];
  holdEpsilonReturnPct: number;
}): Array<{ threshold: number; hitRate: number; n: number }> {
  return params.thresholds.map((threshold) => {
    const filtered = params.items.filter((item) => item.confidence >= threshold);
    if (filtered.length === 0) {
      return { threshold, hitRate: 0, n: 0 };
    }
    const hits = filtered.filter((item) =>
      isDirectionalHit({
        action: item.action,
        returnPct: item.returnPct,
        holdEpsilonReturnPct: params.holdEpsilonReturnPct,
      }),
    ).length;
    return {
      threshold,
      hitRate: round((hits / filtered.length) * 100, 4),
      n: filtered.length,
    };
  });
}

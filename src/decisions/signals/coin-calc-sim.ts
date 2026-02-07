import fs from "node:fs";
import path from "node:path";
import type { SignalProvider } from "./types.js";
import { resolveStateDir } from "../../config/paths.js";
import { readNdjsonFile } from "../ndjson.js";
import { clamp, parseIsoDate, round } from "../utils.js";

export type CoinCalcSimSummary = {
  ts: string;
  meanReturnPct: number;
  p10Pct: number;
  p50Pct: number;
  p90Pct: number;
  regime: "risk-on" | "risk-off" | "neutral";
  runId: string | null;
};

export type CoinCalcSimScore = {
  p50Pct: number;
};

type CoinCalcSimRecord = {
  symbol?: string;
  horizon?: string;
  ts?: string;
  createdAt?: string;
  runId?: string;
  summary?: Partial<CoinCalcSimSummary>;
  meanReturnPct?: number;
  p10Pct?: number;
  p50Pct?: number;
  p90Pct?: number;
  regime?: CoinCalcSimSummary["regime"];
};

const SIM_PATH = path.join("coin_calc", "sim_results.ndjson");

function resolveTimestamp(record: CoinCalcSimRecord): number {
  return (
    parseIsoDate(record.ts) ??
    parseIsoDate(record.createdAt) ??
    parseIsoDate(record.summary?.ts ?? null) ??
    0
  );
}

function toSummary(record: CoinCalcSimRecord): CoinCalcSimSummary | null {
  const summary = record.summary ?? {};
  const meanReturnPct = summary.meanReturnPct ?? record.meanReturnPct;
  const p10Pct = summary.p10Pct ?? record.p10Pct;
  const p50Pct = summary.p50Pct ?? record.p50Pct;
  const p90Pct = summary.p90Pct ?? record.p90Pct;
  if (
    !Number.isFinite(meanReturnPct) ||
    !Number.isFinite(p10Pct) ||
    !Number.isFinite(p50Pct) ||
    !Number.isFinite(p90Pct)
  ) {
    return null;
  }
  const regime =
    summary.regime ??
    record.regime ??
    (p50Pct > 0.4 ? "risk-on" : p50Pct < -0.4 ? "risk-off" : "neutral");
  const tsValue = resolveTimestamp(record);
  const ts = tsValue ? new Date(tsValue).toISOString() : new Date().toISOString();
  return {
    ts,
    meanReturnPct: round(meanReturnPct, 4),
    p10Pct: round(p10Pct, 4),
    p50Pct: round(p50Pct, 4),
    p90Pct: round(p90Pct, 4),
    regime,
    runId: record.runId ?? null,
  };
}

export const CoinCalcSimSignalProvider: SignalProvider<
  CoinCalcSimRecord[],
  CoinCalcSimSummary,
  CoinCalcSimScore
> = {
  name: "coinCalcSim",
  async load() {
    const filePath = path.join(resolveStateDir(), SIM_PATH);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    return await readNdjsonFile(filePath, (value) => value as CoinCalcSimRecord);
  },
  summarize(loaded, context) {
    if (loaded.length === 0) {
      return null;
    }
    const symbolKey = context.symbol.replace("/USD", "");
    const matches = loaded.filter((entry) => {
      if (entry.symbol && entry.symbol !== context.symbol && entry.symbol !== symbolKey) {
        return false;
      }
      if (entry.horizon && entry.horizon !== context.horizon) {
        return false;
      }
      return true;
    });
    const sorted = matches.sort((a, b) => resolveTimestamp(a) - resolveTimestamp(b));
    const latest = sorted.at(-1);
    if (!latest) {
      return null;
    }
    return toSummary(latest);
  },
  score(summary) {
    return {
      p50Pct: clamp(summary.p50Pct, -100, 100),
    };
  },
};

import fs from "node:fs";
import type { TapePriceRecord } from "../../market/tape/store.js";
import type { SignalProvider } from "./types.js";
import { resolveStateDir } from "../../config/paths.js";
import { TAPE_PRICES_PATH } from "../../market/tape/store.js";
import { readNdjsonFile } from "../ndjson.js";
import { clamp, parseIsoDate, round } from "../utils.js";

export type TapeSignalSummary = {
  ts: string;
  consensusPrice: number;
  dispersionPct: number;
  sourcesOk: number;
  trendPct: number;
  healthOk: boolean;
  staleSources: string[];
  runId: string | null;
};

export type TapeSignalScore = {
  trendPct: number;
  dispersionPct: number;
  healthOk: boolean;
};

function tsValue(value: string): number {
  return parseIsoDate(value) ?? 0;
}

export const TapeSignalProvider: SignalProvider<
  TapePriceRecord[],
  TapeSignalSummary,
  TapeSignalScore
> = {
  name: "marketTape",
  async load() {
    const filePath = `${resolveStateDir()}/${TAPE_PRICES_PATH}`;
    if (!fs.existsSync(filePath)) {
      return [];
    }
    return await readNdjsonFile(filePath, (value) => value as TapePriceRecord);
  },
  summarize(loaded, context) {
    const windowSize = context.config.tapeWindowPoints ?? 6;
    const symbol = context.symbol.split("/")[0] ?? context.symbol;
    const entries = loaded
      .filter((entry) => entry.symbol === symbol)
      .sort((a, b) => tsValue(a.ts) - tsValue(b.ts));
    const window = entries.slice(Math.max(0, entries.length - windowSize));
    if (window.length === 0) {
      return null;
    }
    const first = window[0];
    const last = window.at(-1) ?? window[0];
    const startPrice = first.consensus.price || 0;
    const endPrice = last.consensus.price || 0;
    const trendPct = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;
    const dispersionPct = (last.dispersion.pct ?? 0) * 100;
    return {
      ts: last.ts,
      consensusPrice: round(endPrice, 6),
      dispersionPct: round(dispersionPct, 4),
      sourcesOk: last.health.ok ? last.sources.length : 0,
      trendPct: round(trendPct, 4),
      healthOk: last.health.ok,
      staleSources: last.health.staleSources ?? [],
      runId: last.provenance?.runId ?? null,
    };
  },
  score(summary) {
    return {
      trendPct: summary.trendPct,
      dispersionPct: summary.dispersionPct,
      healthOk: summary.healthOk,
    };
  },
};

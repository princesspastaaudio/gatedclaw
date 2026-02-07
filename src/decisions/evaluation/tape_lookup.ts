import type { TapePriceRecord } from "../../market/tape/store.js";
import { baseAssetFromSymbol, parseIsoDate } from "../utils.js";

export const DEFAULT_TAPE_LOOKUP_TOLERANCE_MINUTES = 10;

export type TapeLookupEntry = {
  tsMs: number;
  record: TapePriceRecord;
};

export type TapeLookupIndex = Map<string, TapeLookupEntry[]>;

function compareEntries(a: TapeLookupEntry, b: TapeLookupEntry): number {
  return a.tsMs - b.tsMs;
}

export function buildTapeLookupIndex(records: TapePriceRecord[]): TapeLookupIndex {
  const index: TapeLookupIndex = new Map();
  for (const record of records) {
    const tsMs = parseIsoDate(record.ts);
    if (tsMs === null) {
      continue;
    }
    const symbol = baseAssetFromSymbol(record.symbol);
    const entry = { tsMs, record };
    const existing = index.get(symbol);
    if (existing) {
      existing.push(entry);
    } else {
      index.set(symbol, [entry]);
    }
  }
  for (const entries of index.values()) {
    entries.sort(compareEntries);
  }
  return index;
}

function findFirstAtOrAfter(entries: TapeLookupEntry[], targetMs: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (entries[mid].tsMs < targetMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export function findNearestTapeRecord(params: {
  index: TapeLookupIndex;
  symbol: string;
  target: string | number;
  toleranceMs?: number;
}): TapePriceRecord | null {
  const targetMs = typeof params.target === "number" ? params.target : parseIsoDate(params.target);
  if (targetMs === null) {
    return null;
  }
  const symbol = baseAssetFromSymbol(params.symbol);
  const entries = params.index.get(symbol);
  if (!entries || entries.length === 0) {
    return null;
  }
  const toleranceMs = params.toleranceMs ?? DEFAULT_TAPE_LOOKUP_TOLERANCE_MINUTES * 60 * 1000;
  const idx = findFirstAtOrAfter(entries, targetMs);
  if (idx < entries.length) {
    const candidate = entries[idx];
    if (Math.abs(candidate.tsMs - targetMs) <= toleranceMs) {
      return candidate.record;
    }
  }
  if (idx > 0) {
    const candidate = entries[idx - 1];
    if (Math.abs(candidate.tsMs - targetMs) <= toleranceMs) {
      return candidate.record;
    }
  }
  return null;
}

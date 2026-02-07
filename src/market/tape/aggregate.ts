export type TapeSourcePrice = {
  name: string;
  price: number;
  ts: string;
};

export type TapeConsensus = {
  price: number;
  method: "median";
};

export type TapeDispersion = {
  abs: number;
  pct: number;
};

export type TapeHealth = {
  staleSources: string[];
  ok: boolean;
};

export type TapeAggregate = {
  consensus: TapeConsensus;
  dispersion: TapeDispersion;
  health: TapeHealth;
};

export function computeConsensus(prices: TapeSourcePrice[]): TapeConsensus {
  const values = prices.map((entry) => entry.price).sort((a, b) => a - b);
  if (values.length === 0) {
    return { price: 0, method: "median" };
  }
  const mid = Math.floor(values.length / 2);
  const price = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
  return { price, method: "median" };
}

export function computeDispersion(
  prices: TapeSourcePrice[],
  consensus: TapeConsensus,
): TapeDispersion {
  if (prices.length === 0) {
    return { abs: 0, pct: 0 };
  }
  const values = prices.map((entry) => entry.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const abs = max - min;
  const pct = consensus.price > 0 ? abs / consensus.price : 0;
  return { abs, pct };
}

export function detectStaleSources(
  prices: TapeSourcePrice[],
  now: Date,
  staleAfterSeconds: number,
): TapeHealth {
  const staleSources: string[] = [];
  const cutoffMs = staleAfterSeconds * 1000;
  for (const entry of prices) {
    const ts = new Date(entry.ts).getTime();
    if (!Number.isFinite(ts)) {
      staleSources.push(entry.name);
      continue;
    }
    if (now.getTime() - ts > cutoffMs) {
      staleSources.push(entry.name);
    }
  }
  return { staleSources, ok: staleSources.length === 0 };
}

export function aggregateTape(params: {
  prices: TapeSourcePrice[];
  now: Date;
  staleAfterSeconds: number;
}): TapeAggregate {
  const consensus = computeConsensus(params.prices);
  const dispersion = computeDispersion(params.prices, consensus);
  const health = detectStaleSources(params.prices, params.now, params.staleAfterSeconds);
  return { consensus, dispersion, health };
}

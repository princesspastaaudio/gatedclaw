import { type TapeSourceHandler } from "./types.js";

const SYMBOL_MAP: Record<string, string> = {
  BTC: "XBTUSD",
  ETH: "ETHUSD",
};

export const fetchKrakenPrice: TapeSourceHandler = async ({ symbol, timeoutMs }) => {
  const pair = SYMBOL_MAP[symbol.toUpperCase()];
  if (!pair) {
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "OpenClawMarketBot/1.0" },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      result?: Record<string, { c?: string[] }>;
    };
    const entry = data.result?.[pair];
    const price = entry?.c?.[0] ? Number.parseFloat(entry.c[0]) : NaN;
    if (!Number.isFinite(price)) {
      return null;
    }
    return {
      name: "kraken",
      symbol: symbol.toUpperCase(),
      price,
      ts: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

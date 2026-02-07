import { setTimeout as delay } from "node:timers/promises";
import { type TapeSourceHandler } from "./types.js";

const BASE_URL = "https://api.coingecko.com/api/v3";
const SYMBOL_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
};

export const fetchCoingeckoPrice: TapeSourceHandler = async ({ symbol, timeoutMs }) => {
  const id = SYMBOL_MAP[symbol.toUpperCase()];
  if (!id) {
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${BASE_URL}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "OpenClawMarketBot/1.0" },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const price = data?.[id]?.usd;
    if (!price || !Number.isFinite(price)) {
      return null;
    }
    return {
      name: "coingecko",
      symbol: symbol.toUpperCase(),
      price,
      ts: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    await delay(50);
  }
};

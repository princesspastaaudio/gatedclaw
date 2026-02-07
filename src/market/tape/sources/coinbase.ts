import { type TapeSourceHandler } from "./types.js";

export const fetchCoinbasePrice: TapeSourceHandler = async ({ symbol, timeoutMs }) => {
  const productId = `${symbol.toUpperCase()}-USD`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://api.exchange.coinbase.com/products/${productId}/ticker`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "OpenClawMarketBot/1.0" },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { price?: string };
    const price = data.price ? Number.parseFloat(data.price) : NaN;
    if (!Number.isFinite(price)) {
      return null;
    }
    return {
      name: "coinbase",
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

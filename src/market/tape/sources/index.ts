import type { TapeSourceHandler } from "./types.js";
import { fetchCoinbasePrice } from "./coinbase.js";
import { fetchCoingeckoPrice } from "./coingecko.js";
import { fetchKrakenPrice } from "./kraken.js";

export type TapeSourceKind = "coingecko" | "coinbase" | "kraken";

export const TAPE_SOURCE_HANDLERS: Record<TapeSourceKind, TapeSourceHandler> = {
  coingecko: fetchCoingeckoPrice,
  coinbase: fetchCoinbasePrice,
  kraken: fetchKrakenPrice,
};

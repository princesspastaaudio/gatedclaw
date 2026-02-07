export type KrakenTradingConfig = {
  enabled?: boolean;
  apiKey?: string;
  apiSecret?: string;
  allowedSymbols?: string[];
  maxOrderUsd?: number;
  maxOrderAsset?: Record<string, number>;
};

export type TradingConfig = {
  kraken?: KrakenTradingConfig;
};

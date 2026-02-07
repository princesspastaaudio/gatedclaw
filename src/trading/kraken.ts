import crypto from "node:crypto";
import type { KrakenTradingConfig } from "../config/types.trading.js";
import type { TradeExecutePayload } from "../gating/types.js";

export type KrakenTradeValidation =
  | { ok: true; summary: Record<string, unknown> }
  | { ok: false; reason: string; summary: Record<string, unknown> };

export type KrakenTradeExecutionResult = {
  ok: boolean;
  dryRun: boolean;
  orderId?: string;
  message?: string;
  summary: Record<string, unknown>;
};

function parseSymbol(symbol: string): { base: string; quote?: string } {
  const [base, quote] = symbol.split("/");
  return { base: base ?? symbol, quote };
}

function resolveNotionalUsd(payload: TradeExecutePayload): number | null {
  if (typeof payload.notionalUsd === "number" && Number.isFinite(payload.notionalUsd)) {
    return payload.notionalUsd;
  }
  if (typeof payload.limitPrice === "number" && Number.isFinite(payload.limitPrice)) {
    return payload.limitPrice * payload.quantity;
  }
  return null;
}

export function validateKrakenTradeIntent(params: {
  payload: TradeExecutePayload;
  config?: KrakenTradingConfig;
}): KrakenTradeValidation {
  const payload = params.payload;
  if (payload.exchange !== "kraken") {
    return { ok: false, reason: "exchange-unsupported", summary: { exchange: payload.exchange } };
  }
  if (!payload.symbol?.trim()) {
    return { ok: false, reason: "symbol-missing", summary: {} };
  }
  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
    return { ok: false, reason: "quantity-invalid", summary: { quantity: payload.quantity } };
  }
  if (payload.orderType === "limit") {
    if (!Number.isFinite(payload.limitPrice) || payload.limitPrice <= 0) {
      return {
        ok: false,
        reason: "limit-price-missing",
        summary: { limitPrice: payload.limitPrice },
      };
    }
  }
  const config = params.config;
  const allowedSymbols = config?.allowedSymbols ?? [];
  if (allowedSymbols.length > 0 && !allowedSymbols.includes(payload.symbol)) {
    return {
      ok: false,
      reason: "symbol-not-allowed",
      summary: { allowedSymbols, symbol: payload.symbol },
    };
  }
  const { base } = parseSymbol(payload.symbol);
  const maxOrderAsset = config?.maxOrderAsset?.[base];
  if (typeof maxOrderAsset === "number" && payload.quantity > maxOrderAsset) {
    return {
      ok: false,
      reason: "asset-limit-exceeded",
      summary: { maxOrderAsset, asset: base, quantity: payload.quantity },
    };
  }
  const notionalUsd = resolveNotionalUsd(payload);
  if (typeof config?.maxOrderUsd === "number") {
    if (notionalUsd === null) {
      return {
        ok: false,
        reason: "notional-missing",
        summary: { maxOrderUsd: config.maxOrderUsd },
      };
    }
    if (notionalUsd > config.maxOrderUsd) {
      return {
        ok: false,
        reason: "usd-limit-exceeded",
        summary: { maxOrderUsd: config.maxOrderUsd, notionalUsd },
      };
    }
  }
  return {
    ok: true,
    summary: {
      symbol: payload.symbol,
      quantity: payload.quantity,
      notionalUsd,
      orderType: payload.orderType,
      side: payload.side,
    },
  };
}

function buildKrakenSignature(params: {
  path: string;
  postData: string;
  nonce: string;
  secret: string;
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(params.nonce + params.postData)
    .digest();
  const hmac = crypto
    .createHmac("sha512", Buffer.from(params.secret, "base64"))
    .update(params.path)
    .update(hash)
    .digest("base64");
  return hmac;
}

export async function executeKrakenTrade(params: {
  payload: TradeExecutePayload;
  config?: KrakenTradingConfig;
}): Promise<KrakenTradeExecutionResult> {
  const validation = validateKrakenTradeIntent({ payload: params.payload, config: params.config });
  if (!validation.ok) {
    return {
      ok: false,
      dryRun: true,
      message: validation.reason,
      summary: validation.summary,
    };
  }
  const config = params.config ?? {};
  const notionalUsd = resolveNotionalUsd(params.payload);
  if (!config.enabled) {
    return {
      ok: true,
      dryRun: true,
      summary: { ...validation.summary, notionalUsd, mode: "dry_run" },
    };
  }
  if (!config.apiKey || !config.apiSecret) {
    return {
      ok: false,
      dryRun: false,
      message: "kraken credentials missing",
      summary: validation.summary,
    };
  }
  const path = "/0/private/AddOrder";
  const nonce = String(Date.now());
  const body = new URLSearchParams({
    nonce,
    pair: params.payload.symbol,
    type: params.payload.side,
    ordertype: params.payload.orderType,
    volume: String(params.payload.quantity),
  });
  if (params.payload.orderType === "limit" && params.payload.limitPrice) {
    body.set("price", String(params.payload.limitPrice));
  }
  const postData = body.toString();
  const signature = buildKrakenSignature({
    path,
    postData,
    nonce,
    secret: config.apiSecret,
  });
  const response = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "API-Key": config.apiKey,
      "API-Sign": signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: postData,
  });
  const json = (await response.json()) as {
    error?: string[];
    result?: { txid?: string[] };
  };
  if (!response.ok || (json.error && json.error.length > 0)) {
    const error = json.error?.join(", ") ?? response.statusText;
    return {
      ok: false,
      dryRun: false,
      message: error || "kraken order failed",
      summary: validation.summary,
    };
  }
  const orderId = json.result?.txid?.[0];
  return {
    ok: true,
    dryRun: false,
    orderId,
    summary: { ...validation.summary, orderId },
  };
}

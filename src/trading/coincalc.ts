import fs from "node:fs/promises";
import type { TradeExecutePayload, TradeMetrics } from "../gating/types.js";

type CoinCalcRecord = Record<string, unknown>;

function parseNdjson(raw: string): CoinCalcRecord[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CoinCalcRecord);
}

function parseJson(raw: string): CoinCalcRecord[] {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    return parsed.filter((entry) => entry && typeof entry === "object") as CoinCalcRecord[];
  }
  if (parsed && typeof parsed === "object") {
    return [parsed as CoinCalcRecord];
  }
  return [];
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function extractMetrics(record: CoinCalcRecord): TradeMetrics {
  return {
    sentimentScore: coerceNumber(record.sentimentScore ?? record.sentiment),
    confidence: coerceNumber(record.confidence),
    timeWindow: coerceString(record.timeWindow ?? record.window),
    sourceCount: coerceNumber(record.sourceCount ?? record.sources),
    modelVersion: coerceString(record.modelVersion ?? record.model),
    estimatedSlippagePct: coerceNumber(record.estimatedSlippagePct ?? record.slippagePct),
    estimatedFeeUsd: coerceNumber(record.estimatedFeeUsd ?? record.feeUsd),
    exposureDelta: coerceNumber(record.exposureDelta ?? record.exposure),
    riskNotes: coerceString(record.riskNotes ?? record.riskSummary),
  };
}

export function buildTradePayloadFromCoinCalc(record: CoinCalcRecord): TradeExecutePayload {
  const symbol = coerceString(record.symbol ?? record.pair ?? record.market);
  const sideRaw = coerceString(record.side ?? record.action);
  const orderTypeRaw = coerceString(record.orderType ?? record.order ?? record.type);
  const quantity = coerceNumber(record.quantity ?? record.size ?? record.amount);
  if (!symbol || !sideRaw || !orderTypeRaw || !quantity) {
    throw new Error("coin-calc record missing trade fields");
  }
  const side = sideRaw.toLowerCase() === "sell" ? "sell" : "buy";
  const orderType = orderTypeRaw.toLowerCase() === "limit" ? "limit" : "market";
  const limitPrice = coerceNumber(record.limitPrice ?? record.price);
  const notionalUsd = coerceNumber(record.notionalUsd ?? record.estimatedCostUsd);
  return {
    exchange: "kraken",
    side,
    symbol,
    orderType,
    quantity,
    ...(limitPrice ? { limitPrice } : {}),
    ...(notionalUsd ? { notionalUsd } : {}),
    metrics: extractMetrics(record),
  };
}

export async function loadCoinCalcTradeProposal(params: {
  filePath: string;
}): Promise<TradeExecutePayload> {
  const raw = await fs.readFile(params.filePath, "utf-8");
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("coin-calc file is empty");
  }
  const records =
    trimmed.startsWith("{") || trimmed.startsWith("[") ? parseJson(trimmed) : parseNdjson(trimmed);
  if (records.length === 0) {
    throw new Error("coin-calc file has no records");
  }
  const record = records[records.length - 1];
  return buildTradePayloadFromCoinCalc(record);
}

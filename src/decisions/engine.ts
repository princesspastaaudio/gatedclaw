import crypto from "node:crypto";
import type { DecisionConfig } from "../config/types.decision.js";
import type { TradingConfig } from "../config/types.trading.js";
import type { CoinCalcSimSummary } from "./signals/coin-calc-sim.js";
import type { SentimentSignalSummary } from "./signals/sentiment.js";
import type { TapeSignalSummary } from "./signals/tape.js";
import type {
  DecisionAction,
  DecisionCandidate,
  DecisionExpectedValue,
  DecisionRisk,
} from "./types.js";
import { VERSION } from "../version.js";
import { baseAssetFromSymbol, clamp, normalizeSymbol, round } from "./utils.js";

export type DecisionInputs = {
  symbol: string;
  horizon: string;
  sentiment: SentimentSignalSummary;
  tape: TapeSignalSummary;
  sim: CoinCalcSimSummary | null;
  config: DecisionConfig;
  trading: TradingConfig | undefined;
  runId: string;
  createdAt: string;
  configHash: string | null;
  evidence: DecisionCandidate["evidence"];
  coinCalcRefs: { simFile: string | null; featuresFile: string | null };
};

export type DecisionConfidenceBreakdown = {
  base: number;
  dispersionPenalty: number;
  alignment: number;
  confidence: number;
};

const SENTIMENT_STRONG_THRESHOLD = 0.2;
const SIM_SELL_THRESHOLD = -0.6;

function deriveDecisionId(params: {
  symbol: string;
  horizon: string;
  sentimentBucketTs: string;
  tapeTs: string;
  simTs: string | null;
  configHash: string | null;
}): string {
  const raw = [
    params.symbol,
    params.horizon,
    params.sentimentBucketTs,
    params.tapeTs,
    params.simTs ?? "",
    params.configHash ?? "",
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function computeDecisionConfidence(params: {
  sentiment: SentimentSignalSummary;
  tape: TapeSignalSummary;
  sim: CoinCalcSimSummary | null;
  config: DecisionConfig;
}): DecisionConfidenceBreakdown {
  // Confidence formula: weighted sentiment strength/confidence, tape trend strength, stability,
  // and optional sim p50 boost, then apply dispersion penalty and sentiment-tape alignment.
  const sentimentStrength = clamp(Math.abs(params.sentiment.meanSentiment), 0, 1);
  const trendStrength = clamp(Math.abs(params.tape.trendPct) / 2, 0, 1);
  const simStrength = params.sim ? clamp(Math.abs(params.sim.p50Pct) / 5, 0, 0.25) : 0;
  const stability = clamp(params.sentiment.stability, 0, 1);
  const alignment =
    Math.sign(params.sentiment.meanSentiment) === 0 || Math.sign(params.tape.trendPct) === 0
      ? 0.7
      : Math.sign(params.sentiment.meanSentiment) === Math.sign(params.tape.trendPct)
        ? 1
        : 0.35;
  const base =
    0.35 * sentimentStrength +
    0.25 * clamp(params.sentiment.meanConfidence, 0, 1) +
    0.2 * trendStrength +
    0.1 * stability +
    simStrength;
  const maxDispersion = params.config.maxDispersionPct ?? 2.5;
  const dispersionPenalty =
    maxDispersion > 0 ? clamp(params.tape.dispersionPct / maxDispersion, 0, 1) : 1;
  const confidence = clamp(base * (1 - 0.5 * dispersionPenalty) * alignment, 0, 1);
  return {
    base: round(base, 4),
    dispersionPenalty: round(dispersionPenalty, 4),
    alignment: round(alignment, 4),
    confidence: round(confidence, 4),
  };
}

export function selectRecommendedAction(params: {
  sentiment: SentimentSignalSummary;
  tape: TapeSignalSummary;
  sim: CoinCalcSimSummary | null;
  confidence: number;
  config: DecisionConfig;
}): DecisionAction {
  const minConfidence = params.config.minDecisionConfidence ?? 0.55;
  if (params.confidence < minConfidence) {
    return "HOLD";
  }
  const sentimentScore = params.sentiment.meanSentiment;
  if (sentimentScore >= SENTIMENT_STRONG_THRESHOLD && params.tape.trendPct >= 0) {
    return "BUY";
  }
  if (sentimentScore <= -SENTIMENT_STRONG_THRESHOLD) {
    return "SELL";
  }
  if (params.sim && params.sim.p50Pct <= SIM_SELL_THRESHOLD) {
    return "SELL";
  }
  return "HOLD";
}

function computeExpectedValue(params: {
  sentiment: SentimentSignalSummary;
  tape: TapeSignalSummary;
  sim: CoinCalcSimSummary | null;
}): DecisionExpectedValue {
  const simEdge = params.sim?.p50Pct ?? 0;
  const combined = params.sentiment.meanSentiment * 2 + params.tape.trendPct * 0.4 + simEdge * 0.6;
  const directional = combined > 0.5 ? "up" : combined < -0.5 ? "down" : "flat";
  const edgePct = params.sim ? params.sim.p50Pct : combined;
  return {
    directional,
    edgePct: round(edgePct, 4),
    notes: params.sim
      ? "Edge from coin-calc sim p50 blended with tape and sentiment."
      : "Edge inferred from sentiment momentum and tape trend.",
  };
}

function computeRisk(params: {
  tape: TapeSignalSummary;
  sim: CoinCalcSimSummary | null;
  sizingUsd: number;
}): DecisionRisk {
  const dispersion = params.tape.dispersionPct;
  const simSpread = params.sim ? Math.max(0, params.sim.p90Pct - params.sim.p10Pct) : 0;
  const volatilityPct = round(Math.max(dispersion, simSpread), 4);
  const maxDrawdownPct = round(params.sim ? Math.max(0, -params.sim.p10Pct) : dispersion, 4);
  const slippageEstimatePct = round(Math.min(1.5, dispersion * 0.4), 4);
  const feeEstimateUsd = round(params.sizingUsd * 0.002, 4);
  return {
    volatilityPct,
    maxDrawdownPct,
    slippageEstimatePct,
    feeEstimateUsd,
    riskNotes: params.sim
      ? "Risk derived from sim tail percentiles and tape dispersion."
      : "Risk derived from tape dispersion and sentiment stability.",
  };
}

function scaleUsdByConfidence(params: {
  maxUsd: number;
  confidence: number;
  scale: "linear" | "sqrt";
}): number {
  if (params.maxUsd <= 0) {
    return 0;
  }
  const confidence = clamp(params.confidence, 0, 1);
  const factor = params.scale === "sqrt" ? Math.sqrt(confidence) : confidence;
  return params.maxUsd * factor;
}

function resolvePositionSizing(params: {
  symbol: string;
  price: number;
  confidence: number;
  config: DecisionConfig;
  trading: TradingConfig | undefined;
}): { sizing: { qty: number; unit: string; maxUsd: number }; sizingUsd: number } {
  const maxUsdPerTrade = params.config.sizing?.maxUsdPerTrade ?? 2500;
  const scale = params.config.sizing?.confidenceScale ?? "linear";
  const minUsd = params.config.sizing?.minUsd ?? 50;
  const tradingMaxUsd = params.trading?.maxOrderUsd ?? maxUsdPerTrade;
  const maxUsdLimit = Math.min(maxUsdPerTrade, tradingMaxUsd);
  const scaledUsd = scaleUsdByConfidence({
    maxUsd: maxUsdLimit,
    confidence: params.confidence,
    scale,
  });
  if (!Number.isFinite(params.price) || params.price <= 0 || scaledUsd < minUsd) {
    return {
      sizing: { qty: 0, unit: baseAssetFromSymbol(params.symbol), maxUsd: round(maxUsdLimit, 4) },
      sizingUsd: 0,
    };
  }
  let qty = scaledUsd / params.price;
  const assetLimit = params.trading?.maxOrderAsset?.[baseAssetFromSymbol(params.symbol)];
  if (Number.isFinite(assetLimit ?? NaN)) {
    qty = Math.min(qty, assetLimit ?? qty);
  }
  const maxUsd = round(qty * params.price, 4);
  return {
    sizing: { qty: round(qty, 6), unit: baseAssetFromSymbol(params.symbol), maxUsd },
    sizingUsd: maxUsd,
  };
}

export function buildDecisionCandidate(params: DecisionInputs): DecisionCandidate {
  const symbol = normalizeSymbol(params.symbol);
  const confidenceBreakdown = computeDecisionConfidence({
    sentiment: params.sentiment,
    tape: params.tape,
    sim: params.sim,
    config: params.config,
  });
  const action = selectRecommendedAction({
    sentiment: params.sentiment,
    tape: params.tape,
    sim: params.sim,
    confidence: confidenceBreakdown.confidence,
    config: params.config,
  });
  const position = resolvePositionSizing({
    symbol,
    price: params.tape.consensusPrice,
    confidence: confidenceBreakdown.confidence,
    config: params.config,
    trading: params.trading,
  });
  const expectedValue = computeExpectedValue({
    sentiment: params.sentiment,
    tape: params.tape,
    sim: params.sim,
  });
  const risk = computeRisk({
    tape: params.tape,
    sim: params.sim,
    sizingUsd: position.sizingUsd,
  });
  const simSummary = params.sim
    ? {
        meanReturnPct: params.sim.meanReturnPct,
        p10Pct: params.sim.p10Pct,
        p50Pct: params.sim.p50Pct,
        p90Pct: params.sim.p90Pct,
        regime: params.sim.regime,
      }
    : null;

  return {
    decisionId: deriveDecisionId({
      symbol,
      horizon: params.horizon,
      sentimentBucketTs: params.sentiment.bucketTs,
      tapeTs: params.tape.ts,
      simTs: params.sim?.ts ?? null,
      configHash: params.configHash,
    }),
    createdAt: params.createdAt,
    symbol,
    horizon: params.horizon,
    recommendedAction: action,
    positionSizing: position.sizing,
    confidence: confidenceBreakdown.confidence,
    expectedValue,
    risk,
    signals: {
      sentiment: {
        bucketTs: params.sentiment.bucketTs,
        score: params.sentiment.meanSentiment,
        confidence: params.sentiment.meanConfidence,
        topTags: params.sentiment.topTags,
      },
      marketTape: {
        ts: params.tape.ts,
        consensusPrice: params.tape.consensusPrice,
        dispersionPct: params.tape.dispersionPct,
        sourcesOk: params.tape.sourcesOk,
      },
      coinCalc: {
        inputRef: {
          simFile: params.coinCalcRefs.simFile,
          featuresFile: params.coinCalcRefs.featuresFile,
        },
        summary: simSummary,
      },
    },
    evidence: params.evidence,
    provenance: {
      runId: params.runId,
      agent: "decision_synth",
      version: VERSION,
      configHash: params.configHash,
    },
  };
}

export type DecisionSizingConfig = {
  maxUsdPerTrade?: number;
  confidenceScale?: "linear" | "sqrt";
  minUsd?: number;
};

export type DecisionConfig = {
  enabled?: boolean;
  horizons?: string[];
  sentimentWindowBuckets?: number;
  tapeWindowPoints?: number;
  minSentimentConfidence?: number;
  maxDispersionPct?: number;
  minDecisionConfidence?: number;
  autoSubmitProposals?: boolean;
  maxProposalsPerRun?: number;
  cooldownMinutes?: number;
  sizing?: DecisionSizingConfig;
};

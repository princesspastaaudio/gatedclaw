export type DecisionAction = "BUY" | "SELL" | "HOLD";
export type DecisionDirectional = "up" | "down" | "flat";

export type DecisionPositionSizing = {
  qty: number;
  unit: string;
  maxUsd: number;
};

export type DecisionExpectedValue = {
  directional: DecisionDirectional;
  edgePct: number;
  notes: string;
};

export type DecisionRisk = {
  volatilityPct: number;
  maxDrawdownPct: number;
  slippageEstimatePct: number;
  feeEstimateUsd: number;
  riskNotes: string;
};

export type DecisionSignals = {
  sentiment: {
    bucketTs: string;
    score: number;
    confidence: number;
    topTags: string[];
  };
  marketTape: {
    ts: string;
    consensusPrice: number;
    dispersionPct: number;
    sourcesOk: number;
  };
  coinCalc: {
    inputRef: {
      simFile: string | null;
      featuresFile: string | null;
    };
    summary: {
      meanReturnPct: number;
      p10Pct: number;
      p50Pct: number;
      p90Pct: number;
      regime: "risk-on" | "risk-off" | "neutral";
    } | null;
  };
};

export type DecisionEvidence = {
  articles: Array<{
    articleId: string;
    title: string;
    url: string;
    sentimentScore: number;
  }>;
  runs: {
    newsRunId: string | null;
    sentimentRunId: string | null;
    tapeRunId: string | null;
  };
};

export type DecisionCandidate = {
  decisionId: string;
  createdAt: string;
  symbol: string;
  horizon: string;
  recommendedAction: DecisionAction;
  positionSizing: DecisionPositionSizing;
  confidence: number;
  expectedValue: DecisionExpectedValue;
  risk: DecisionRisk;
  signals: DecisionSignals;
  evidence: DecisionEvidence;
  provenance: {
    runId: string;
    agent: string;
    version: string;
    configHash: string | null;
  };
};

export type DecisionProposal = {
  proposalId: string;
  decisionId: string;
  createdAt: string;
  approvalId: string | null;
  status: "created" | "submitted" | "approved" | "denied" | "expired";
  notes: string;
};

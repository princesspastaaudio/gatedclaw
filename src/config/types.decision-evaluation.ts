export type DecisionEvaluationNotificationsConfig = {
  enabled?: boolean;
  level?: "errors-only" | "summary";
  adminOnly?: boolean;
};

export type DecisionEvaluationConfig = {
  enabled?: boolean;
  horizons?: string[];
  holdEpsilonReturnPct?: number;
  minTapeHealthSourcesOk?: number;
  maxDispersionPct?: number;
  minAgeMinutesBeforeEval?: number;
  maxDecisionsPerRun?: number;
  accuracyWindowN?: number;
  accuracyWindowDays?: number;
  confidenceBuckets?: number[];
  notifications?: DecisionEvaluationNotificationsConfig;
};

import type { DecisionConfig } from "../../config/types.decision.js";

export type SignalContext = {
  symbol: string;
  horizon: string;
  config: DecisionConfig;
};

export type SignalProvider<TLoaded, TSummary, TScore> = {
  name: string;
  load: (context: { config: DecisionConfig }) => Promise<TLoaded>;
  summarize: (loaded: TLoaded, context: SignalContext) => TSummary | null;
  score: (summary: TSummary, context: SignalContext) => TScore;
};

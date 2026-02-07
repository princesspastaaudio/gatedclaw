import type { DecisionConfig } from "../../config/types.decision.js";
import type { SignalProvider } from "./types.js";

export type SignalProviderState<TSummary, TScore> = {
  name: string;
  summary: TSummary | null;
  score: TScore | null;
};

export async function runSignalProviders(
  providers: Array<SignalProvider<unknown, unknown, unknown>>,
  context: { symbol: string; horizon: string; config: DecisionConfig },
): Promise<Array<SignalProviderState<unknown, unknown>>> {
  const loaded = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      data: await provider.load({ config: context.config }),
    })),
  );
  return loaded.map(({ provider, data }) => {
    const summary = provider.summarize(data, context);
    const score = summary ? provider.score(summary, context) : null;
    return { name: provider.name, summary, score };
  });
}

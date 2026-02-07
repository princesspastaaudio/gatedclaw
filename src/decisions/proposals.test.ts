import { describe, expect, it } from "vitest";
import type { DecisionCandidate, DecisionProposal } from "./types.js";
import { shouldSubmitProposal, formatProposalNotes } from "./proposals.js";

const baseCandidate: DecisionCandidate = {
  decisionId: "dec-1",
  createdAt: "2024-01-01T00:00:00.000Z",
  symbol: "BTC/USD",
  horizon: "24h",
  recommendedAction: "BUY",
  positionSizing: { qty: 0.1, unit: "BTC", maxUsd: 2000 },
  confidence: 0.7,
  expectedValue: { directional: "up", edgePct: 1.2, notes: "test" },
  risk: {
    volatilityPct: 1,
    maxDrawdownPct: 2,
    slippageEstimatePct: 0.2,
    feeEstimateUsd: 4,
    riskNotes: "test",
  },
  signals: {
    sentiment: { bucketTs: "2024-01-01T00:00:00.000Z", score: 0.5, confidence: 0.6, topTags: [] },
    marketTape: {
      ts: "2024-01-01T00:00:00.000Z",
      consensusPrice: 40000,
      dispersionPct: 0.5,
      sourcesOk: 3,
    },
    coinCalc: { inputRef: { simFile: null, featuresFile: null }, summary: null },
  },
  evidence: { articles: [], runs: { newsRunId: null, sentimentRunId: null, tapeRunId: null } },
  provenance: { runId: "run-1", agent: "decision_synth", version: "dev", configHash: null },
};

describe("proposal guardrails", () => {
  it("blocks when dispersion exceeds threshold", () => {
    const decision = shouldSubmitProposal({
      candidate: {
        ...baseCandidate,
        signals: {
          ...baseCandidate.signals,
          marketTape: { ...baseCandidate.signals.marketTape, dispersionPct: 4 },
        },
      },
      config: { maxDispersionPct: 2 },
      now: new Date(),
      hasNewData: true,
      existingProposals: [],
    });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe("dispersion-high");
  });

  it("blocks duplicates during cooldown", () => {
    const proposal: DecisionProposal = {
      proposalId: "prop-1",
      decisionId: "dec-1",
      createdAt: new Date().toISOString(),
      approvalId: null,
      status: "submitted",
      notes: formatProposalNotes(baseCandidate),
    };
    const decision = shouldSubmitProposal({
      candidate: baseCandidate,
      config: { cooldownMinutes: 60 },
      now: new Date(),
      hasNewData: true,
      existingProposals: [proposal],
    });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe("duplicate");
  });
});

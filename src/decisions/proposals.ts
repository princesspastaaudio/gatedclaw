import type { DecisionConfig } from "../config/types.decision.js";
import type { DecisionCandidate, DecisionProposal } from "./types.js";
import { clamp, parseIsoDate } from "./utils.js";

export type ProposalDecision = {
  ok: boolean;
  reason?: string;
};

export function shouldSubmitProposal(params: {
  candidate: DecisionCandidate;
  config: DecisionConfig;
  now: Date;
  hasNewData: boolean;
  existingProposals: DecisionProposal[];
}): ProposalDecision {
  if (!params.hasNewData) {
    return { ok: false, reason: "no-new-data" };
  }
  if (params.candidate.recommendedAction === "HOLD") {
    return { ok: false, reason: "hold" };
  }
  if (params.candidate.positionSizing.qty <= 0 || params.candidate.positionSizing.maxUsd <= 0) {
    return { ok: false, reason: "size-zero" };
  }
  const minSentimentConfidence = params.config.minSentimentConfidence ?? 0.5;
  if (params.candidate.signals.sentiment.confidence < minSentimentConfidence) {
    return { ok: false, reason: "sentiment-confidence-low" };
  }
  const maxDispersionPct = params.config.maxDispersionPct ?? 2.5;
  if (params.candidate.signals.marketTape.dispersionPct > maxDispersionPct) {
    return { ok: false, reason: "dispersion-high" };
  }
  if (params.candidate.signals.marketTape.sourcesOk === 0) {
    return { ok: false, reason: "tape-stale" };
  }
  const minDecisionConfidence = params.config.minDecisionConfidence ?? 0.55;
  if (params.candidate.confidence < minDecisionConfidence) {
    return { ok: false, reason: "decision-confidence-low" };
  }
  const duplicate = findRecentDuplicate({
    candidate: params.candidate,
    existingProposals: params.existingProposals,
    cooldownMinutes: params.config.cooldownMinutes ?? 60,
    now: params.now,
  });
  if (duplicate) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true };
}

export function findRecentDuplicate(params: {
  candidate: DecisionCandidate;
  existingProposals: DecisionProposal[];
  cooldownMinutes: number;
  now: Date;
}): DecisionProposal | null {
  const cooldownMs = Math.max(0, params.cooldownMinutes) * 60 * 1000;
  if (cooldownMs === 0) {
    return null;
  }
  const nowMs = params.now.getTime();
  const match = params.existingProposals.findLast((proposal) => {
    const createdAt = parseIsoDate(proposal.createdAt) ?? 0;
    if (nowMs - createdAt > cooldownMs) {
      return false;
    }
    return proposal.decisionId === params.candidate.decisionId;
  });
  if (match) {
    return match;
  }
  return (
    params.existingProposals
      .filter((proposal) => {
        const createdAt = parseIsoDate(proposal.createdAt) ?? 0;
        return nowMs - createdAt <= cooldownMs;
      })
      .find((proposal) => {
        const signature = `${params.candidate.symbol}:${params.candidate.horizon}:${params.candidate.recommendedAction}`;
        const proposalSignature = proposal.notes.split("|")[0] ?? "";
        return proposalSignature === signature;
      }) ?? null
  );
}

export function formatProposalNotes(candidate: DecisionCandidate): string {
  const signature = `${candidate.symbol}:${candidate.horizon}:${candidate.recommendedAction}`;
  const confidence = clamp(candidate.confidence, 0, 1);
  return `${signature}|confidence=${confidence.toFixed(3)}`;
}

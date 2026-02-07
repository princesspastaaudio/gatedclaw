import { Command } from "commander";
import crypto from "node:crypto";
import type { DecisionProposal } from "../decisions/types.js";
import { loadConfig } from "../config/config.js";
import { formatProposalNotes, shouldSubmitProposal } from "../decisions/proposals.js";
import {
  loadDecisionCandidates,
  appendDecisionProposals,
  loadDecisionProposals,
} from "../decisions/store.js";
import { requestTradeExecuteApproval } from "../gating/requests.js";
import { createGatingService } from "../gating/service.js";
import { createTelegramApprovalMessenger } from "../gating/telegram.js";
import { resolveDefaultTelegramAccountId } from "../telegram/accounts.js";

const program = new Command();

program
  .option("--symbol <symbol>", "Symbol to filter (e.g. BTC/USD)")
  .option("--horizon <horizon>", "Horizon to filter (e.g. 24h)")
  .option("--limit <count>", "Max approvals to submit", "3")
  .parse(process.argv);

const opts = program.opts();
const limit = Math.max(1, Number.parseInt(opts.limit, 10));
if (!Number.isFinite(limit)) {
  throw new Error("limit must be a number");
}

const cfg = loadConfig();
const adminChat = cfg.gating?.adminChats?.[0];
if (!adminChat) {
  throw new Error("gating.adminChats must include at least one chat id");
}

const candidates = await loadDecisionCandidates();
const filtered = candidates.filter((candidate) => {
  if (opts.symbol && candidate.symbol !== opts.symbol) {
    return false;
  }
  if (opts.horizon && candidate.horizon !== opts.horizon) {
    return false;
  }
  return true;
});

const ranked = filtered.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
if (ranked.length === 0) {
  console.log("No candidates matched the filter.");
  process.exit(0);
}

const messenger = createTelegramApprovalMessenger({
  accountId: resolveDefaultTelegramAccountId(cfg),
});
const service = createGatingService({ cfg, messenger });
const existingProposals = await loadDecisionProposals();
const proposals: DecisionProposal[] = [];
let submitted = 0;

for (const candidate of ranked) {
  const decision = shouldSubmitProposal({
    candidate,
    config: cfg.decision ?? {},
    now: new Date(),
    hasNewData: true,
    existingProposals: [...existingProposals, ...proposals],
  });
  if (!decision.ok) {
    console.log(
      `Skipping ${candidate.symbol} ${candidate.horizon}: ${decision.reason ?? "guardrail"}`,
    );
    continue;
  }
  const proposalId = crypto.randomUUID();
  const approval = await requestTradeExecuteApproval({
    proposalId,
    actor: {
      channel: "telegram",
      chatId: String(adminChat),
    },
    payload: {
      decisionId: candidate.decisionId,
      proposalId,
      symbol: candidate.symbol,
      action: candidate.recommendedAction === "BUY" ? "BUY" : "SELL",
      qty: candidate.positionSizing.qty,
      unit: candidate.positionSizing.unit,
      maxUsd: candidate.positionSizing.maxUsd,
      confidence: candidate.confidence,
      horizon: candidate.horizon,
      notes: `${candidate.expectedValue.directional} edge ${candidate.expectedValue.edgePct.toFixed(2)}%`,
    },
    service,
  });

  proposals.push({
    proposalId,
    decisionId: candidate.decisionId,
    createdAt: new Date().toISOString(),
    approvalId: approval.request?.approvalId ?? null,
    status: approval.ok ? "submitted" : "created",
    notes: formatProposalNotes(candidate),
  });

  if (approval.ok && approval.request?.approvalId) {
    submitted += 1;
    console.log(
      `Approval requested for ${candidate.symbol} ${candidate.horizon}: ${approval.request.approvalId}`,
    );
  } else {
    console.log(
      `Approval request failed for ${candidate.symbol} ${candidate.horizon}: ${approval.reason ?? "unknown"}`,
    );
  }
}

if (proposals.length > 0) {
  await appendDecisionProposals(proposals);
}

console.log(`Submitted approvals: ${submitted}`);

import type { OpenClawConfig } from "../config/config.js";
import type {
  ApprovalRequest,
  LedgerPatchPayload,
  TradeExecutePayload,
  LedgerPostingsApplyPayload,
  CronApplyBudgetedPayload,
} from "./types.js";
import { buildGatingCallbackData } from "./callback-data.js";
import { loadCronProposalSummary } from "./cronops.js";
import { summarizeLedgerPatch } from "./ledger-store.js";

type ApprovalCard = {
  text: string;
  buttons: Array<Array<{ text: string; callback_data: string }>>;
};

function formatActorLabel(request: ApprovalRequest): string | null {
  const approved = request.audit.findLast((event) => event.type === "approved");
  const denied = request.audit.findLast((event) => event.type === "denied");
  const actor = approved?.actor ?? denied?.actor;
  if (!actor) {
    return null;
  }
  if (actor.username) {
    return `@${actor.username}`;
  }
  if (actor.userId) {
    return `id:${actor.userId}`;
  }
  return null;
}

function formatStatusLine(request: ApprovalRequest): string {
  if (request.status === "pending") {
    return "pending";
  }
  const actorLabel = formatActorLabel(request);
  if (request.status === "approved") {
    return actorLabel ? `approved by ${actorLabel}` : "approved";
  }
  if (request.status === "denied") {
    return actorLabel ? `denied by ${actorLabel}` : "denied";
  }
  return "expired";
}

function formatCronSummary(summary: Awaited<ReturnType<typeof loadCronProposalSummary>>): string {
  if (!summary) {
    return "pending cron proposal";
  }
  const parts = [];
  if (summary.logicalId) {
    parts.push(summary.logicalId);
  }
  if (summary.schedule) {
    parts.push(`@ ${summary.schedule}`);
  }
  if (parts.length === 0) {
    return "pending cron proposal";
  }
  return parts.join(" ");
}

function formatNumber(value: number | undefined, digits = 2): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value.toFixed(digits);
}

function summarizePostings(payload: LedgerPostingsApplyPayload): string {
  const summaries = payload.postings.map(
    (posting) => `${posting.account} ${posting.amount} ${posting.asset}`,
  );
  return summaries.slice(0, 3).join(", ");
}

export async function buildApprovalCard(
  request: ApprovalRequest,
  cfg?: OpenClawConfig,
): Promise<ApprovalCard> {
  let header = "Approval";
  let resourceLine = `Resource: ${request.resource.type}:${request.resource.id}`;
  let summaryLine: string | null = null;
  let buttons: Array<Array<{ text: string; callback_data: string }>> = [];

  if (request.kind === "cron.apply_budgeted") {
    header = "Cron Apply Budgeted";
    resourceLine = `Proposal: ${request.resource.id}`;
    const summary = await loadCronProposalSummary({
      proposalId: request.resource.id,
    });
    const payload = request.payload as CronApplyBudgetedPayload;
    const metrics = payload.metrics ?? {};
    summaryLine = `Summary: ${formatCronSummary(summary)}`;
    const metricsLines = [
      `Tokens: ${metrics.estimatedTokens ?? "n/a"}`,
      `Cost: ${metrics.estimatedCostUsd ?? "n/a"} USD`,
      `Model tier: ${metrics.modelTier ?? "n/a"}`,
      `Expected value: ${metrics.expectedValue ?? "n/a"}`,
    ];
    buttons = [
      [
        {
          text: "✅ Approve",
          callback_data: buildGatingCallbackData(request.approvalId, "approve"),
        },
        { text: "❌ Deny", callback_data: buildGatingCallbackData(request.approvalId, "deny") },
      ],
      [
        {
          text: "⚠️ Approve (RECREATE)",
          callback_data: buildGatingCallbackData(request.approvalId, "approve_recreate"),
        },
      ],
    ];
    const statusLine = `Status: ${formatStatusLine(request)}`;
    const lines = [
      header,
      resourceLine,
      summaryLine,
      ...metricsLines,
      statusLine,
      `Approval: ${request.approvalId}`,
    ]
      .filter(Boolean)
      .slice(0, 10);
    return {
      text: lines.join("\n"),
      buttons: request.status === "pending" ? buttons : [],
    };
  }

  if (request.kind.startsWith("cron.apply")) {
    header = "Cron Apply";
    resourceLine = `Resource: proposal ${request.resource.id}`;
    const summary = await loadCronProposalSummary({
      proposalId: request.resource.id,
    });
    summaryLine = `Summary: ${formatCronSummary(summary)}`;
    buttons = [
      [
        {
          text: "✅ Approve",
          callback_data: buildGatingCallbackData(request.approvalId, "approve"),
        },
        { text: "❌ Deny", callback_data: buildGatingCallbackData(request.approvalId, "deny") },
      ],
      [
        {
          text: "⚠️ Approve (RECREATE)",
          callback_data: buildGatingCallbackData(request.approvalId, "approve_recreate"),
        },
      ],
    ];
  } else if (request.kind === "ledger.patch") {
    header = "Ledger Patch";
    resourceLine = `Resource: ledger ${request.resource.id}`;
    const payload = request.payload as LedgerPatchPayload;
    summaryLine = `Summary: ${summarizeLedgerPatch(payload.patch)}`;
    buttons = [
      [
        {
          text: "✅ Approve",
          callback_data: buildGatingCallbackData(request.approvalId, "approve"),
        },
        { text: "❌ Deny", callback_data: buildGatingCallbackData(request.approvalId, "deny") },
      ],
    ];
  } else if (request.kind === "trade.execute") {
    header = "Trade Execute";
    const payload = request.payload as TradeExecutePayload;
    const metrics = payload.metrics ?? {};
    const mode = cfg?.trading?.kraken?.enabled ? "LIVE" : "DRY RUN";
    const limitPrice =
      payload.orderType === "limit" ? ` @ ${formatNumber(payload.limitPrice) ?? "n/a"}` : "";
    const fee = formatNumber(metrics.estimatedFeeUsd);
    const slippage = formatNumber(metrics.estimatedSlippagePct);
    const sentiment = formatNumber(metrics.sentimentScore);
    const confidence = formatNumber(metrics.confidence);
    const risk = metrics.riskNotes ?? "none";
    const lines = [
      header,
      `Exchange: Kraken (${payload.side.toUpperCase()})`,
      `Asset: ${payload.symbol} ${payload.quantity}`,
      `Order: ${payload.orderType}${limitPrice}`,
      `Sentiment: ${sentiment ?? "n/a"} (conf ${confidence ?? "n/a"})`,
      `Risk: ${risk}`,
      `Fees/Slippage: ${fee ?? "n/a"} / ${slippage ?? "n/a"}%`,
      `Mode: ${mode}`,
      `Status: ${formatStatusLine(request)}`,
      `Approval: ${request.approvalId}`,
    ]
      .filter(Boolean)
      .slice(0, 10);
    buttons = [
      [
        {
          text: "✅ Approve",
          callback_data: buildGatingCallbackData(request.approvalId, "approve"),
        },
        { text: "❌ Deny", callback_data: buildGatingCallbackData(request.approvalId, "deny") },
      ],
    ];
    return {
      text: lines.join("\n"),
      buttons: request.status === "pending" ? buttons : [],
    };
  } else if (request.kind === "ledger.postings.apply") {
    header = "Ledger Postings";
    const payload = request.payload as LedgerPostingsApplyPayload;
    resourceLine = `Resource: ledger ${request.resource.id}`;
    summaryLine = `Summary: ${summarizePostings(payload)}`;
    buttons = [
      [
        {
          text: "✅ Approve",
          callback_data: buildGatingCallbackData(request.approvalId, "approve"),
        },
        { text: "❌ Deny", callback_data: buildGatingCallbackData(request.approvalId, "deny") },
      ],
    ];
  }

  const statusLine = `Status: ${formatStatusLine(request)}`;
  const lines = [header, resourceLine, summaryLine, statusLine, `Approval: ${request.approvalId}`]
    .filter(Boolean)
    .slice(0, 10);

  return {
    text: lines.join("\n"),
    buttons: request.status === "pending" ? buttons : [],
  };
}

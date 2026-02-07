import type { ApprovalRequest, LedgerPatchPayload } from "./types.js";
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

export async function buildApprovalCard(request: ApprovalRequest): Promise<ApprovalCard> {
  let header = "Approval";
  let resourceLine = `Resource: ${request.resource.type}:${request.resource.id}`;
  let summaryLine: string | null = null;
  let buttons: Array<Array<{ text: string; callback_data: string }>> = [];

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

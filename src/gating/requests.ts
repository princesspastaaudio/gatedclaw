import type { createGatingService } from "./service.js";
import type { ApprovalActor, ApprovalRequest, BudgetedRunPayload } from "./types.js";
import type { LedgerPatch } from "./types.js";
import type { ApprovalKind } from "./types.js";
import type { ApprovalResource } from "./types.js";
import type { ApprovalPayload } from "./types.js";

export async function requestCronApplyApproval(params: {
  proposalId: string;
  actor: ApprovalActor;
  allowRecreate?: boolean;
  service: ReturnType<typeof createGatingService>;
}): Promise<{ ok: boolean; request?: ApprovalRequest; reason?: string }> {
  const kind: ApprovalKind = params.allowRecreate ? "cron.apply_recreate" : "cron.apply";
  const resource: ApprovalResource = { type: "cron_proposal", id: params.proposalId };
  const payload: ApprovalPayload = {
    proposalId: params.proposalId,
    allowRecreate: params.allowRecreate,
  };
  return await params.service.requestApproval({ kind, resource, payload, actor: params.actor });
}

export async function requestLedgerPatchApproval(params: {
  ledger: string;
  patch: LedgerPatch;
  actor: ApprovalActor;
  service: ReturnType<typeof createGatingService>;
}): Promise<{ ok: boolean; request?: ApprovalRequest; reason?: string }> {
  const kind: ApprovalKind = "ledger.patch";
  const resource: ApprovalResource = { type: "ledger", id: params.ledger };
  const payload: ApprovalPayload = {
    ledger: params.ledger,
    patch: params.patch,
  };
  return await params.service.requestApproval({ kind, resource, payload, actor: params.actor });
}

export async function requestBudgetedRunApproval(params: {
  runId: string;
  actor: ApprovalActor;
  payload: BudgetedRunPayload;
  service: ReturnType<typeof createGatingService>;
}): Promise<{ ok: boolean; request?: ApprovalRequest; reason?: string }> {
  const kind: ApprovalKind = "cron.apply_budgeted";
  const resource: ApprovalResource = { type: "sentiment_run", id: params.runId };
  const payload: ApprovalPayload = params.payload;
  return await params.service.requestApproval({ kind, resource, payload, actor: params.actor });
}

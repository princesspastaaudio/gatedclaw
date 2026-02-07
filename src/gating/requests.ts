import type { OpenClawConfig } from "../config/config.js";
import type { createGatingService } from "./service.js";
import type { ApprovalActor, ApprovalRequest } from "./types.js";
import type { LedgerPatch } from "./types.js";
import type { TradeExecutePayload, CronMetrics } from "./types.js";
import type { ApprovalKind } from "./types.js";
import type { ApprovalResource } from "./types.js";
import type { ApprovalPayload } from "./types.js";
import { loadConfig } from "../config/config.js";
import { enforceCronBudget } from "./budgets.js";

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

export async function requestCronApplyBudgetedApproval(params: {
  proposalId: string;
  metrics?: CronMetrics;
  actor: ApprovalActor;
  allowRecreate?: boolean;
  service: ReturnType<typeof createGatingService>;
  cfg?: OpenClawConfig;
}): Promise<{ ok: boolean; request?: ApprovalRequest; reason?: string }> {
  const cfg = params.cfg ?? loadConfig();
  const budgetCheck = await enforceCronBudget({
    cfg,
    metrics: params.metrics,
  });
  if (!budgetCheck.ok) {
    return { ok: false, reason: budgetCheck.reason };
  }
  const kind: ApprovalKind = "cron.apply_budgeted";
  const resource: ApprovalResource = { type: "cron_proposal", id: params.proposalId };
  const payload: ApprovalPayload = {
    proposalId: params.proposalId,
    allowRecreate: params.allowRecreate,
    metrics: params.metrics,
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

export async function requestTradeExecuteApproval(params: {
  payload: TradeExecutePayload;
  actor: ApprovalActor;
  service: ReturnType<typeof createGatingService>;
}): Promise<{ ok: boolean; request?: ApprovalRequest; reason?: string }> {
  const kind: ApprovalKind = "trade.execute";
  const resource: ApprovalResource = { type: "exchange", id: params.payload.exchange };
  const payload: ApprovalPayload = params.payload;
  return await params.service.requestApproval({ kind, resource, payload, actor: params.actor });
}

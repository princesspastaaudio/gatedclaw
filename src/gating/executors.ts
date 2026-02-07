import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
  ApprovalActor,
  ApprovalKind,
  ApprovalPayload,
  BudgetedRunPayload,
  CronApplyPayload,
  LedgerPatchPayload,
  TradeExecutePayload,
} from "./types.js";
import { writeBudgetedApproval } from "../ops/budgeted.js";
import { executeTrade } from "../trading/execute.js";
import { resolveCronOpsRoot, proposalExists, isValidProposalId } from "./cronops.js";
import { applyLedgerPatch, validateLedgerPatch } from "./ledger-store.js";

export type ExecutorValidation =
  | { ok: true }
  | {
      ok: false;
      reason: string;
    };

export type ExecutorResult = {
  ok: boolean;
  message?: string;
  logRef?: string;
  details?: Record<string, unknown>;
};

export type ApprovalExecutor = {
  kind: ApprovalKind;
  validate: (payload: ApprovalPayload) => Promise<ExecutorValidation> | ExecutorValidation;
  execute: (payload: ApprovalPayload, actor: ApprovalActor) => Promise<ExecutorResult>;
};

const execFileAsync = promisify(execFile);

function resolveCronLogRef(cronopsRoot: string, proposalId: string): string | null {
  const logsDir = path.join(cronopsRoot, "logs");
  const candidateFile = path.join(logsDir, `${proposalId}.log`);
  if (fs.existsSync(candidateFile)) {
    return path.join("cronops", "logs", `${proposalId}.log`);
  }
  if (fs.existsSync(logsDir)) {
    return path.join("cronops", "logs");
  }
  return null;
}

async function validateCronPayload(payload: CronApplyPayload): Promise<ExecutorValidation> {
  if (!payload?.proposalId || typeof payload.proposalId !== "string") {
    return { ok: false, reason: "proposal-id-missing" };
  }
  if (!isValidProposalId(payload.proposalId)) {
    return { ok: false, reason: "proposal-id-invalid" };
  }
  const exists = await proposalExists({ proposalId: payload.proposalId });
  if (!exists) {
    return { ok: false, reason: "proposal-not-found" };
  }
  return { ok: true };
}

async function executeCronApply(payload: CronApplyPayload): Promise<ExecutorResult> {
  const cronopsRoot = resolveCronOpsRoot();
  const scriptPath = path.join(cronopsRoot, "bin", "cronops_exec_apply.sh");
  const args = [payload.proposalId];
  if (payload.allowRecreate) {
    args.push("ALLOW_RECREATE");
  }
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, message: "cronops wrapper not found" };
  }
  try {
    await execFileAsync(scriptPath, args, { cwd: cronopsRoot });
    const logRef = resolveCronLogRef(cronopsRoot, payload.proposalId);
    return { ok: true, logRef: logRef ?? undefined };
  } catch (err) {
    const logRef = resolveCronLogRef(cronopsRoot, payload.proposalId);
    return {
      ok: false,
      message: `cronops wrapper failed: ${String(err)}`,
      logRef: logRef ?? undefined,
    };
  }
}

async function validateLedgerPayload(payload: LedgerPatchPayload): Promise<ExecutorValidation> {
  if (!payload?.ledger || typeof payload.ledger !== "string") {
    return { ok: false, reason: "ledger-missing" };
  }
  if (!payload.patch || typeof payload.patch !== "object") {
    return { ok: false, reason: "ledger-patch-missing" };
  }
  return validateLedgerPatch(payload.patch);
}

async function validateBudgetedPayload(payload: BudgetedRunPayload): Promise<ExecutorValidation> {
  if (!payload?.runId || typeof payload.runId !== "string") {
    return { ok: false, reason: "run-id-missing" };
  }
  if (payload.job !== "sentiment_labeler") {
    return { ok: false, reason: "unsupported-job" };
  }
  if (!payload.model?.name) {
    return { ok: false, reason: "model-missing" };
  }
  if (!Number.isFinite(payload.estimatedTokens) || payload.estimatedTokens <= 0) {
    return { ok: false, reason: "tokens-missing" };
  }
  if (!Number.isFinite(payload.estimatedCostUsd) || payload.estimatedCostUsd < 0) {
    return { ok: false, reason: "cost-missing" };
  }
  return { ok: true };
}

async function validateTradePayload(payload: TradeExecutePayload): Promise<ExecutorValidation> {
  if (!payload?.decisionId || typeof payload.decisionId !== "string") {
    return { ok: false, reason: "decision-id-missing" };
  }
  if (!payload?.proposalId || typeof payload.proposalId !== "string") {
    return { ok: false, reason: "proposal-id-missing" };
  }
  if (!payload?.symbol || typeof payload.symbol !== "string") {
    return { ok: false, reason: "symbol-missing" };
  }
  if (payload.action !== "BUY" && payload.action !== "SELL") {
    return { ok: false, reason: "action-invalid" };
  }
  if (!Number.isFinite(payload.qty) || payload.qty <= 0) {
    return { ok: false, reason: "qty-invalid" };
  }
  if (!payload.unit || typeof payload.unit !== "string") {
    return { ok: false, reason: "unit-invalid" };
  }
  if (!Number.isFinite(payload.maxUsd) || payload.maxUsd <= 0) {
    return { ok: false, reason: "max-usd-invalid" };
  }
  return { ok: true };
}

async function executeLedgerPatch(
  payload: LedgerPatchPayload,
  _actor: ApprovalActor,
): Promise<ExecutorResult> {
  await applyLedgerPatch({ ledger: payload.ledger, patch: payload.patch });
  return { ok: true };
}

async function executeBudgetedRun(
  payload: BudgetedRunPayload,
  actor: ApprovalActor,
): Promise<ExecutorResult> {
  await writeBudgetedApproval({
    runId: payload.runId,
    job: payload.job,
    approvedBy: actor,
    approvedAt: new Date().toISOString(),
    payload,
  });
  return { ok: true };
}

export function createDefaultExecutors(): Map<ApprovalKind, ApprovalExecutor> {
  const executors: ApprovalExecutor[] = [
    {
      kind: "cron.apply",
      validate: async (payload) => validateCronPayload(payload as CronApplyPayload),
      execute: async (payload) => executeCronApply(payload as CronApplyPayload),
    },
    {
      kind: "cron.apply_recreate",
      validate: async (payload) => validateCronPayload(payload as CronApplyPayload),
      execute: async (payload) =>
        executeCronApply({ ...(payload as CronApplyPayload), allowRecreate: true }),
    },
    {
      kind: "cron.apply_budgeted",
      validate: async (payload) => validateBudgetedPayload(payload as BudgetedRunPayload),
      execute: async (payload, actor) => executeBudgetedRun(payload as BudgetedRunPayload, actor),
    },
    {
      kind: "ledger.patch",
      validate: async (payload) => validateLedgerPayload(payload as LedgerPatchPayload),
      execute: async (payload, actor) => executeLedgerPatch(payload as LedgerPatchPayload, actor),
    },
    {
      kind: "trade.execute",
      validate: async (payload) => validateTradePayload(payload as TradeExecutePayload),
      execute: async (payload, actor) => {
        const result = await executeTrade({
          payload: payload as TradeExecutePayload,
          actor,
        });
        return result;
      },
    },
  ];
  return new Map(executors.map((executor) => [executor.kind, executor]));
}

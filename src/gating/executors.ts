import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { OpenClawConfig } from "../config/config.js";
import type {
  ApprovalActor,
  ApprovalKind,
  ApprovalPayload,
  CronApplyPayload,
  LedgerPatchPayload,
  TradeExecutePayload,
  LedgerPostingsApplyPayload,
  CronApplyBudgetedPayload,
} from "./types.js";
import { loadConfig } from "../config/config.js";
import { appendCronUsageEvent } from "../cronops/metrics.js";
import { appendLedgerJournalEntry, hashLedgerPayload } from "../ledgers/journal.js";
import { executeKrakenTrade, validateKrakenTradeIntent } from "../trading/kraken.js";
import { resolveCronOpsRoot, proposalExists, isValidProposalId } from "./cronops.js";
import { applyLedgerPatch, isValidLedgerName, validateLedgerPatch } from "./ledger-store.js";

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
  if (!isValidLedgerName(payload.ledger)) {
    return { ok: false, reason: "ledger-invalid" };
  }
  if (!payload.patch || typeof payload.patch !== "object") {
    return { ok: false, reason: "ledger-patch-missing" };
  }
  return validateLedgerPatch(payload.patch);
}

async function executeLedgerPatch(
  payload: LedgerPatchPayload,
  _actor: ApprovalActor,
): Promise<ExecutorResult> {
  await applyLedgerPatch({ ledger: payload.ledger, patch: payload.patch });
  return { ok: true };
}

function validateTradePayload(
  payload: TradeExecutePayload,
  cfg: OpenClawConfig,
): ExecutorValidation {
  const validation = validateKrakenTradeIntent({
    payload,
    config: cfg.trading?.kraken,
  });
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }
  return { ok: true };
}

function resolveTradePostings(payload: TradeExecutePayload): {
  postings: LedgerPostingsApplyPayload["postings"];
  notes?: string;
} {
  const [base, quote] = payload.symbol.split("/");
  const baseAsset = base || payload.symbol;
  const quoteAsset = quote || "USD";
  const direction = payload.side === "buy" ? 1 : -1;
  const basePosting = {
    account: "trading:position",
    amount: direction * payload.quantity,
    asset: baseAsset,
  };
  const notionalUsd =
    typeof payload.notionalUsd === "number" && Number.isFinite(payload.notionalUsd)
      ? payload.notionalUsd
      : typeof payload.limitPrice === "number" && Number.isFinite(payload.limitPrice)
        ? payload.limitPrice * payload.quantity
        : null;
  const postings = [basePosting];
  let notes: string | undefined;
  if (notionalUsd !== null) {
    postings.push({
      account: "trading:cash",
      amount: -direction * notionalUsd,
      asset: quoteAsset,
    });
  } else {
    notes = "Notional USD unavailable; cash posting omitted.";
  }
  return { postings, notes };
}

async function executeTrade(
  payload: TradeExecutePayload,
  cfg: OpenClawConfig,
): Promise<ExecutorResult> {
  const execution = await executeKrakenTrade({
    payload,
    config: cfg.trading?.kraken,
  });
  const runId = crypto.randomUUID();
  const { postings, notes } = resolveTradePostings(payload);
  return {
    ok: execution.ok,
    message: execution.message,
    details: {
      intent: payload,
      exchange: payload.exchange,
      orderId: execution.orderId,
      dryRun: execution.dryRun,
      validation: execution.summary,
      ledgerRequest: {
        ledger: "finance",
        runId,
        postings,
        provenance: {
          exchange: payload.exchange,
          orderId: execution.orderId,
          dryRun: execution.dryRun,
        },
        notes,
      },
    },
  };
}

async function validateLedgerPostingsPayload(
  payload: LedgerPostingsApplyPayload,
): Promise<ExecutorValidation> {
  if (!payload?.ledger || typeof payload.ledger !== "string") {
    return { ok: false, reason: "ledger-missing" };
  }
  if (!payload.runId || typeof payload.runId !== "string") {
    return { ok: false, reason: "run-id-missing" };
  }
  if (!Array.isArray(payload.postings) || payload.postings.length === 0) {
    return { ok: false, reason: "postings-missing" };
  }
  for (const posting of payload.postings) {
    if (!posting.account?.trim() || !posting.asset?.trim()) {
      return { ok: false, reason: "posting-invalid" };
    }
    if (!Number.isFinite(posting.amount)) {
      return { ok: false, reason: "posting-amount-invalid" };
    }
  }
  if (!payload.provenance || typeof payload.provenance.exchange !== "string") {
    return { ok: false, reason: "provenance-missing" };
  }
  return { ok: true };
}

async function executeLedgerPostingsApply(
  payload: LedgerPostingsApplyPayload,
  _actor: ApprovalActor,
): Promise<ExecutorResult> {
  const entry = {
    runId: payload.runId,
    approvalId: payload.approvalId ?? "unknown",
    timestamp: new Date().toISOString(),
    postings: payload.postings,
    provenance: payload.provenance,
    payloadHash: hashLedgerPayload(payload),
  };
  await appendLedgerJournalEntry({ ledger: payload.ledger, entry });
  return { ok: true, details: { ledger: payload.ledger } };
}

async function executeCronApplyBudgeted(
  payload: CronApplyBudgetedPayload,
): Promise<ExecutorResult> {
  const startTime = new Date();
  const result = await executeCronApply(payload);
  const endTime = new Date();
  await appendCronUsageEvent({
    event: {
      proposalId: payload.proposalId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      tokensUsed: payload.metrics?.estimatedTokens,
      model: payload.metrics?.modelTier,
      estimatedCostUsd: payload.metrics?.estimatedCostUsd,
      exitStatus: result.ok ? "success" : "failed",
    },
  });
  return result;
}

export function createDefaultExecutors(
  params: {
    cfg?: OpenClawConfig;
  } = {},
): Map<ApprovalKind, ApprovalExecutor> {
  const cfg = params.cfg ?? loadConfig();
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
      validate: async (payload) => validateCronPayload(payload as CronApplyPayload),
      execute: async (payload) => executeCronApplyBudgeted(payload as CronApplyBudgetedPayload),
    },
    {
      kind: "ledger.patch",
      validate: async (payload) => validateLedgerPayload(payload as LedgerPatchPayload),
      execute: async (payload, actor) => executeLedgerPatch(payload as LedgerPatchPayload, actor),
    },
    {
      kind: "trade.execute",
      validate: async (payload) => validateTradePayload(payload as TradeExecutePayload, cfg),
      execute: async (payload) => executeTrade(payload as TradeExecutePayload, cfg),
    },
    {
      kind: "ledger.postings.apply",
      validate: async (payload) =>
        validateLedgerPostingsPayload(payload as LedgerPostingsApplyPayload),
      execute: async (payload, actor) =>
        executeLedgerPostingsApply(payload as LedgerPostingsApplyPayload, actor),
    },
  ];
  return new Map(executors.map((executor) => [executor.kind, executor]));
}

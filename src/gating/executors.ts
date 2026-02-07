import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
  ApprovalActor,
  ApprovalKind,
  ApprovalPayload,
  CronApplyPayload,
  LedgerPatchPayload,
} from "./types.js";
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

async function executeLedgerPatch(
  payload: LedgerPatchPayload,
  _actor: ApprovalActor,
): Promise<ExecutorResult> {
  await applyLedgerPatch({ ledger: payload.ledger, patch: payload.patch });
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
      kind: "ledger.patch",
      validate: async (payload) => validateLedgerPayload(payload as LedgerPatchPayload),
      execute: async (payload, actor) => executeLedgerPatch(payload as LedgerPatchPayload, actor),
    },
  ];
  return new Map(executors.map((executor) => [executor.kind, executor]));
}

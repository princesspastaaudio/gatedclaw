export type ApprovalKind =
  | "cron.apply"
  | "cron.apply_recreate"
  | "cron.apply_budgeted"
  | "ledger.patch";
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type ApprovalResourceType = "cron_proposal" | "ledger" | "sentiment_run";

export type ApprovalResource = {
  type: ApprovalResourceType;
  id: string;
};

export type ApprovalActor = {
  channel: "telegram";
  chatId: string;
  userId?: string;
  username?: string;
};

export type ApprovalAuditEvent = {
  type: "posted" | "clicked" | "approved" | "denied" | "executed" | "failed" | "expired";
  at: string;
  actor?: ApprovalActor;
  note?: string;
  details?: Record<string, unknown>;
};

export type ApprovalMessageRef = {
  channel: "telegram";
  chatId: string;
  messageId: string;
};

export type CronApplyPayload = {
  proposalId: string;
  allowRecreate?: boolean;
};

export type LedgerPatchPayload = {
  ledger: string;
  patch: LedgerPatch;
};

export type LedgerPatch = {
  set?: Record<string, string | number | boolean>;
  remove?: string[];
};

export type BudgetedRunPayload = {
  runId: string;
  job: "sentiment_labeler";
  pendingArticles: number;
  maxArticles: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  model: { name: string; tier?: string };
  expectedValue: string;
};

export type ApprovalPayload = CronApplyPayload | LedgerPatchPayload | BudgetedRunPayload;

export type ApprovalRequest = {
  approvalId: string;
  kind: ApprovalKind;
  resource: ApprovalResource;
  payload: ApprovalPayload;
  createdBy: ApprovalActor;
  createdAt: string;
  status: ApprovalStatus;
  audit: ApprovalAuditEvent[];
  postedMessages: ApprovalMessageRef[];
};

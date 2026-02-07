export type ApprovalKind =
  | "cron.apply"
  | "cron.apply_recreate"
  | "cron.apply_budgeted"
  | "ledger.patch"
  | "ledger.postings.apply"
  | "trade.execute";
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type ApprovalResourceType = "cron_proposal" | "ledger" | "exchange";

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

export type MetricsAttachment<T extends Record<string, unknown> = Record<string, unknown>> = {
  metrics?: T;
};

export type CronMetrics = {
  estimatedTokens?: number;
  estimatedCostUsd?: number;
  expectedRuntimeSeconds?: number;
  modelTier?: string;
  expectedValue?: string;
};

export type CronApplyBudgetedPayload = CronApplyPayload & MetricsAttachment<CronMetrics>;

export type LedgerPatchPayload = {
  ledger: string;
  patch: LedgerPatch;
};

export type LedgerPatch = {
  set?: Record<string, string | number | boolean>;
  remove?: string[];
};

export type TradeMetrics = {
  sentimentScore?: number;
  confidence?: number;
  timeWindow?: string;
  sourceCount?: number;
  modelVersion?: string;
  estimatedSlippagePct?: number;
  estimatedFeeUsd?: number;
  exposureDelta?: number;
  riskNotes?: string;
};

export type TradeExecutePayload = MetricsAttachment<TradeMetrics> & {
  exchange: "kraken";
  side: "buy" | "sell";
  symbol: string;
  orderType: "market" | "limit";
  quantity: number;
  limitPrice?: number;
  notionalUsd?: number;
};

export type LedgerPosting = {
  account: string;
  amount: number;
  asset: string;
};

export type LedgerProvenance = {
  exchange: string;
  orderId?: string;
  dryRun: boolean;
};

export type LedgerPostingsApplyPayload = {
  ledger: string;
  approvalId?: string;
  runId: string;
  postings: LedgerPosting[];
  provenance: LedgerProvenance;
  notes?: string;
};

export type ApprovalPayload =
  | CronApplyPayload
  | CronApplyBudgetedPayload
  | LedgerPatchPayload
  | TradeExecutePayload
  | LedgerPostingsApplyPayload;

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

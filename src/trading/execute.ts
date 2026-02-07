import type { ApprovalActor, TradeExecutePayload } from "../gating/types.js";
import { appendTradeExecution } from "./store.js";

export async function executeTrade(params: {
  payload: TradeExecutePayload;
  actor: ApprovalActor;
  approvalId?: string;
}): Promise<{ ok: boolean; message?: string; details?: Record<string, unknown> }> {
  await appendTradeExecution({
    executedAt: new Date().toISOString(),
    approvalId: params.approvalId ?? null,
    decisionId: params.payload.decisionId,
    proposalId: params.payload.proposalId,
    symbol: params.payload.symbol,
    action: params.payload.action,
    qty: params.payload.qty,
    unit: params.payload.unit,
    maxUsd: params.payload.maxUsd,
    mode: "dry-run",
  });
  return {
    ok: true,
    message: "trade recorded (dry-run)",
    details: { actor: params.actor },
  };
}

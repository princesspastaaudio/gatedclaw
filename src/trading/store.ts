import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export type TradeExecutionRecord = {
  executedAt: string;
  approvalId: string | null;
  decisionId: string;
  proposalId: string;
  symbol: string;
  action: "BUY" | "SELL";
  qty: number;
  unit: string;
  maxUsd: number;
  mode: "dry-run";
};

export const TRADE_EXECUTIONS_PATH = path.join("trades", "executions.ndjson");

export function resolveTradeExecutionsPath(): string {
  return path.join(resolveStateDir(), TRADE_EXECUTIONS_PATH);
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function appendTradeExecution(record: TradeExecutionRecord): Promise<void> {
  const filePath = resolveTradeExecutionsPath();
  await ensureDir(filePath);
  await fs.promises.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

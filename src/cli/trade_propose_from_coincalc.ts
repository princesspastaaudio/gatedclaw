import { Command } from "commander";
import { loadConfig } from "../config/config.js";
import { requestTradeExecuteApproval } from "../gating/requests.js";
import { createGatingService } from "../gating/service.js";
import { createTelegramApprovalMessenger, buildTelegramApprovalActor } from "../gating/telegram.js";
import { loadCoinCalcTradeProposal } from "../trading/coincalc.js";

function resolveChatId(input: string | undefined, cfgChatIds: Array<string | number> | undefined) {
  if (input?.trim()) {
    return input.trim();
  }
  const fallback = cfgChatIds?.[0];
  if (fallback === undefined || fallback === null) {
    return null;
  }
  return String(fallback);
}

async function main() {
  const program = new Command();
  program
    .name("trade_propose_from_coincalc")
    .requiredOption("--file <path>", "Path to coin-calc JSON/NDJSON output")
    .option("--chat-id <id>", "Telegram chat id to attribute the request")
    .option("--user-id <id>", "Telegram user id for audit")
    .option("--username <name>", "Telegram username for audit");

  program.parse(process.argv);
  const opts = program.opts<{
    file: string;
    chatId?: string;
    userId?: string;
    username?: string;
  }>();

  const cfg = loadConfig();
  if (cfg.gating?.enabled === false) {
    throw new Error("gating is disabled in config");
  }
  const chatId = resolveChatId(opts.chatId, cfg.gating?.adminChats);
  if (!chatId) {
    throw new Error("no gating adminChats configured; provide --chat-id");
  }
  const payload = await loadCoinCalcTradeProposal({ filePath: opts.file });
  const actor = buildTelegramApprovalActor({
    chatId,
    userId: opts.userId,
    username: opts.username,
  });
  const service = createGatingService({
    cfg,
    messenger: createTelegramApprovalMessenger({}),
  });
  const result = await requestTradeExecuteApproval({
    payload,
    actor,
    service,
  });
  if (!result.ok) {
    throw new Error(`approval request rejected: ${result.reason ?? "unknown"}`);
  }
  const approvalId = result.request?.approvalId ?? "unknown";
  const status = result.request?.status ?? "pending";
  console.log(`approvalId=${approvalId} status=${status}`);
}

main().catch((err) => {
  console.error(String(err));
  process.exitCode = 1;
});

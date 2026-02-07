import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { ApprovalMessageRef, ApprovalRequest } from "./types.js";
import { createGatingService } from "./service.js";

describe("gating service integration", () => {
  it("posts to multiple chats and syncs status", async () => {
    const cfg: OpenClawConfig = {
      gating: {
        enabled: true,
        adminChats: ["100"],
        publicChats: ["200"],
        policies: [
          {
            resource: "ledger:finance",
            request: { chatClasses: ["admin", "public"] },
            approve: { chatClasses: ["admin", "public"] },
          },
        ],
      },
    };
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-gating-"));
    const storePath = path.join(tmp, "approvals.json");
    const sent: ApprovalMessageRef[] = [];
    const edits: Array<{ message: ApprovalMessageRef; text: string }> = [];

    const service = createGatingService({
      cfg,
      storePath,
      messenger: {
        postCard: async ({ targets, text, request }) => {
          const posted = targets.map((target, idx) => ({
            channel: "telegram" as const,
            chatId: target.chatId,
            messageId: `${request.approvalId}-${idx}`,
          }));
          sent.push(...posted);
          return posted;
        },
        editCard: async ({ message, text }) => {
          edits.push({ message, text });
        },
        notify: async () => undefined,
      },
    });

    const result = await service.requestApproval({
      kind: "ledger.patch",
      resource: { type: "ledger", id: "finance" },
      payload: { ledger: "finance", patch: { set: { balance: 10 } } },
      actor: { channel: "telegram", chatId: "200", userId: "55" },
    });
    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(2);

    const approval = result.request as ApprovalRequest;
    const callback = `gating:v1:${approval.approvalId}:approve`;
    const handled = await service.handleCallback({
      data: callback,
      actor: { channel: "telegram", chatId: "100", userId: "99" },
    });
    expect(handled.handled).toBe(true);
    expect(edits).toHaveLength(4);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("denies cron approvals from public chats", async () => {
    const cfg: OpenClawConfig = {
      gating: {
        enabled: true,
        adminChats: ["100"],
        publicChats: ["200"],
        policies: [
          {
            resource: "cron_proposal:*",
            request: { chatClasses: ["admin"] },
            approve: { chatClasses: ["admin"] },
          },
        ],
      },
    };
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-gating-"));
    const storePath = path.join(tmp, "approvals.json");
    const service = createGatingService({
      cfg,
      storePath,
      messenger: {
        postCard: async () => [],
        editCard: async () => undefined,
        notify: async () => undefined,
      },
    });
    const result = await service.requestApproval({
      kind: "cron.apply",
      resource: { type: "cron_proposal", id: "proposal-1" },
      payload: { proposalId: "proposal-1" },
      actor: { channel: "telegram", chatId: "200", userId: "55" },
    });
    expect(result.ok).toBe(false);
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

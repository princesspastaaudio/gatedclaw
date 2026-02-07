import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { isApprovalActionAllowed } from "./policy.js";

describe("gating policy", () => {
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
        {
          resource: "ledger:core",
          request: { chatClasses: ["admin"] },
          approve: { chatClasses: ["admin"] },
        },
        {
          resource: "cron_proposal:*",
          request: { chatClasses: ["admin"] },
          approve: { chatClasses: ["admin"] },
        },
      ],
    },
  };

  it("allows finance approvals from public chats", () => {
    const result = isApprovalActionAllowed({
      cfg,
      action: "approve",
      resource: { type: "ledger", id: "finance" },
      actor: { channel: "telegram", chatId: "200", userId: "55" },
    });
    expect(result.allowed).toBe(true);
  });

  it("denies core ledger approvals from public chats", () => {
    const result = isApprovalActionAllowed({
      cfg,
      action: "approve",
      resource: { type: "ledger", id: "core" },
      actor: { channel: "telegram", chatId: "200", userId: "55" },
    });
    expect(result.allowed).toBe(false);
  });

  it("denies cron approvals from public chats", () => {
    const result = isApprovalActionAllowed({
      cfg,
      action: "approve",
      resource: { type: "cron_proposal", id: "abc" },
      actor: { channel: "telegram", chatId: "200", userId: "55" },
    });
    expect(result.allowed).toBe(false);
  });

  it("respects per-user allowlists", () => {
    const cfgWithUsers: OpenClawConfig = {
      gating: {
        enabled: true,
        adminChats: ["100"],
        policies: [
          {
            resource: "ledger:finance",
            request: { chatClasses: ["admin"], users: ["42", "@alice"] },
            approve: { chatClasses: ["admin"], users: ["42", "@alice"] },
          },
        ],
      },
    };
    const denied = isApprovalActionAllowed({
      cfg: cfgWithUsers,
      action: "approve",
      resource: { type: "ledger", id: "finance" },
      actor: { channel: "telegram", chatId: "100", userId: "43" },
    });
    const allowed = isApprovalActionAllowed({
      cfg: cfgWithUsers,
      action: "approve",
      resource: { type: "ledger", id: "finance" },
      actor: { channel: "telegram", chatId: "100", username: "alice" },
    });
    expect(denied.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });
});

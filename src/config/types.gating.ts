export type GatingChatClass = "admin" | "public";

export type GatingPolicyRole = {
  /** Chat classes that may perform the action. */
  chatClasses?: GatingChatClass[];
  /** Optional allowlist of user IDs or usernames. */
  users?: string[];
};

export type GatingPolicyConfig = {
  /** Resource scope, e.g. "ledger:finance" or "cron_proposal:*". */
  resource: string;
  /** Who can create approval requests. */
  request?: GatingPolicyRole;
  /** Who can approve/deny approval requests. */
  approve?: GatingPolicyRole;
};

export type GatingConfig = {
  /** Enable gating/approvals module. */
  enabled?: boolean;
  /** Telegram chat IDs that are considered admin/control. */
  adminChats?: Array<string | number>;
  /** Telegram chat IDs that are considered public/collaboration. */
  publicChats?: Array<string | number>;
  /** Declarative policy rules by resource scope. */
  policies?: GatingPolicyConfig[];
  /** Allow cron proposal cards to be visible in public chats. */
  allowPublicViewForCronProposals?: boolean;
};

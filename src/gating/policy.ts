import type { OpenClawConfig } from "../config/config.js";
import type { GatingChatClass, GatingPolicyConfig, GatingPolicyRole } from "../config/types.js";
import type { ApprovalActor, ApprovalResource } from "./types.js";

export type ApprovalAction = "request" | "approve";

type PolicyMatch = {
  policy: GatingPolicyConfig;
  specificity: number;
};

const CHAT_CLASS_PRIORITY: Record<GatingChatClass, number> = {
  admin: 2,
  public: 1,
};

function normalizeChatId(value: string | number | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function normalizeUser(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizePolicyResource(resource: string): { type: string; id: string } | null {
  const trimmed = resource.trim();
  if (!trimmed) {
    return null;
  }
  const [type, id] = trimmed.split(":");
  if (!type || !id) {
    return null;
  }
  return { type, id };
}

function matchesResource(
  resource: ApprovalResource,
  policy: GatingPolicyConfig,
): PolicyMatch | null {
  const parsed = normalizePolicyResource(policy.resource);
  if (!parsed) {
    return null;
  }
  const typeMatch = parsed.type === "*" || parsed.type === resource.type;
  if (!typeMatch) {
    return null;
  }
  const idMatch = parsed.id === "*" || parsed.id === resource.id;
  if (!idMatch) {
    return null;
  }
  const specificity = (parsed.type === "*" ? 0 : 1) + (parsed.id === "*" ? 0 : 1);
  return { policy, specificity };
}

export function resolveChatClasses(params: {
  cfg: OpenClawConfig;
  chatId: string;
}): GatingChatClass[] {
  const chatId = normalizeChatId(params.chatId);
  const gating = params.cfg.gating;
  if (!gating || !chatId) {
    return [];
  }
  const adminChats = (gating.adminChats ?? []).map((value) => normalizeChatId(value));
  const publicChats = (gating.publicChats ?? []).map((value) => normalizeChatId(value));
  const classes = new Set<GatingChatClass>();
  if (adminChats.includes(chatId)) {
    classes.add("admin");
  }
  if (publicChats.includes(chatId)) {
    classes.add("public");
  }
  return Array.from(classes).sort((a, b) => CHAT_CLASS_PRIORITY[b] - CHAT_CLASS_PRIORITY[a]);
}

function isUserAllowed(role: GatingPolicyRole | undefined, actor: ApprovalActor): boolean {
  const users = role?.users ?? [];
  if (users.length === 0) {
    return true;
  }
  const normalizedUsers = users.map((entry) => normalizeUser(entry));
  const userId = normalizeUser(actor.userId);
  const username = normalizeUser(actor.username ? `@${actor.username}` : "");
  return normalizedUsers.some((entry) => {
    if (entry === username) {
      return true;
    }
    if (entry === userId) {
      return true;
    }
    if (entry.startsWith("id:") && entry.slice(3) === userId) {
      return true;
    }
    return false;
  });
}

function isChatClassAllowed(
  role: GatingPolicyRole | undefined,
  chatClasses: GatingChatClass[],
): boolean {
  const allowed = role?.chatClasses;
  if (!allowed || allowed.length === 0) {
    return false;
  }
  return allowed.some((entry) => chatClasses.includes(entry));
}

export function resolvePolicyForResource(
  cfg: OpenClawConfig,
  resource: ApprovalResource,
): GatingPolicyConfig | null {
  const policies = cfg.gating?.policies ?? [];
  let best: PolicyMatch | null = null;
  for (const policy of policies) {
    const match = matchesResource(resource, policy);
    if (!match) {
      continue;
    }
    if (!best || match.specificity > best.specificity) {
      best = match;
    }
  }
  return best?.policy ?? null;
}

export function isApprovalActionAllowed(params: {
  cfg: OpenClawConfig;
  action: ApprovalAction;
  resource: ApprovalResource;
  actor: ApprovalActor;
}): { allowed: boolean; reason: string } {
  const gating = params.cfg.gating;
  if (!gating || gating.enabled === false) {
    return { allowed: false, reason: "gating-disabled" };
  }
  const policy = resolvePolicyForResource(params.cfg, params.resource);
  if (!policy) {
    return { allowed: false, reason: "no-policy" };
  }
  const role = params.action === "request" ? policy.request : policy.approve;
  if (!role) {
    return { allowed: false, reason: "no-role" };
  }
  const chatClasses = resolveChatClasses({ cfg: params.cfg, chatId: params.actor.chatId });
  if (!isChatClassAllowed(role, chatClasses)) {
    return { allowed: false, reason: "chat-not-allowed" };
  }
  if (!isUserAllowed(role, params.actor)) {
    return { allowed: false, reason: "user-not-allowed" };
  }
  return { allowed: true, reason: "allowed" };
}

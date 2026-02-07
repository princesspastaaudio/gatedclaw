import crypto from "node:crypto";

export type GatingCallbackAction = "approve" | "deny" | "approve_recreate";

const CALLBACK_PREFIX = "gating";
const CALLBACK_VERSION = "v1";
const APPROVAL_ID_RE = /^[0-9a-fA-F-]{36}$/;

export function generateApprovalId(): string {
  return crypto.randomUUID();
}

export function buildGatingCallbackData(approvalId: string, action: GatingCallbackAction): string {
  return `${CALLBACK_PREFIX}:${CALLBACK_VERSION}:${approvalId}:${action}`;
}

export function parseGatingCallbackData(
  raw: string,
): { approvalId: string; action: GatingCallbackAction } | null {
  const trimmed = raw.trim();
  const parts = trimmed.split(":");
  if (parts.length !== 4) {
    return null;
  }
  const [prefix, version, approvalId, action] = parts;
  if (prefix !== CALLBACK_PREFIX || version !== CALLBACK_VERSION) {
    return null;
  }
  if (!APPROVAL_ID_RE.test(approvalId)) {
    return null;
  }
  if (action !== "approve" && action !== "deny" && action !== "approve_recreate") {
    return null;
  }
  return { approvalId, action };
}

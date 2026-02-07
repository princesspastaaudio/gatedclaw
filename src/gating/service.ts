import type { OpenClawConfig } from "../config/config.js";
import type {
  ApprovalActor,
  ApprovalAuditEvent,
  ApprovalKind,
  ApprovalMessageRef,
  ApprovalRequest,
  ApprovalResource,
  ApprovalStatus,
  ApprovalPayload,
} from "./types.js";
import { loadConfig } from "../config/config.js";
import { generateApprovalId, parseGatingCallbackData } from "./callback-data.js";
import { buildApprovalCard } from "./cards.js";
import { createDefaultExecutors } from "./executors.js";
import { isApprovalActionAllowed, resolvePolicyForResource } from "./policy.js";
import {
  appendApprovalRequest,
  getApprovalRequest,
  resolveApprovalStorePath,
  updateApprovalRequest,
} from "./store.js";

export type ApprovalMessenger = {
  postCard: (params: {
    request: ApprovalRequest;
    text: string;
    buttons: Array<Array<{ text: string; callback_data: string }>>;
    targets: Array<{ chatId: string }>;
  }) => Promise<ApprovalMessageRef[]>;
  editCard: (params: {
    message: ApprovalMessageRef;
    text: string;
    buttons?: Array<Array<{ text: string; callback_data: string }>>;
  }) => Promise<void>;
  notify: (params: { chatId: string; text: string }) => Promise<void>;
};

export type GatingServiceParams = {
  cfg?: OpenClawConfig;
  messenger: ApprovalMessenger;
  storePath?: string;
  now?: () => Date;
};

function buildAuditEvent(params: {
  type: ApprovalAuditEvent["type"];
  actor?: ApprovalActor;
  note?: string;
  details?: Record<string, unknown>;
  now: Date;
}): ApprovalAuditEvent {
  return {
    type: params.type,
    actor: params.actor,
    note: params.note,
    details: params.details,
    at: params.now.toISOString(),
  };
}

function resolveStatus(request: ApprovalRequest): ApprovalStatus {
  if (request.status !== "pending") {
    return request.status;
  }
  return "pending";
}

function resolveTargets(
  cfg: OpenClawConfig,
  resource: ApprovalResource,
): Array<{ chatId: string }> {
  const gating = cfg.gating;
  if (!gating) {
    return [];
  }
  const adminChats = (gating.adminChats ?? []).map((chatId) => String(chatId));
  const publicChats = (gating.publicChats ?? []).map((chatId) => String(chatId));
  const targets = new Set<string>();
  for (const chatId of adminChats) {
    targets.add(chatId);
  }
  const policy = resolvePolicyForResource(cfg, resource);
  for (const chatId of publicChats) {
    const allowPublicView =
      resource.type === "cron_proposal" && gating.allowPublicViewForCronProposals === true;
    const publicAllowed =
      policy?.approve?.chatClasses?.includes("public") ||
      policy?.request?.chatClasses?.includes("public") ||
      false;
    if (allowPublicView || publicAllowed) {
      targets.add(chatId);
    }
  }
  return Array.from(targets).map((chatId) => ({ chatId }));
}

export function createGatingService(params: GatingServiceParams) {
  const cfg = params.cfg ?? loadConfig();
  const storePath = params.storePath ?? resolveApprovalStorePath();
  const now = params.now ?? (() => new Date());
  const executors = createDefaultExecutors();

  async function persistRequest(request: ApprovalRequest): Promise<void> {
    await appendApprovalRequest(request, storePath);
  }

  async function updateRequest(
    approvalId: string,
    updater: (entry: ApprovalRequest) => ApprovalRequest,
  ): Promise<ApprovalRequest | null> {
    return await updateApprovalRequest(approvalId, updater, storePath);
  }

  async function syncApprovalMessages(request: ApprovalRequest): Promise<void> {
    const card = await buildApprovalCard(request);
    await Promise.all(
      request.postedMessages.map(async (message) => {
        try {
          await params.messenger.editCard({
            message,
            text: card.text,
            buttons: card.buttons,
          });
        } catch (err) {
          const notice = `Approval ${request.approvalId} ${request.status} elsewhere.`;
          await params.messenger.notify({ chatId: message.chatId, text: notice });
        }
      }),
    );
  }

  async function requestApproval(paramsRequest: {
    kind: ApprovalKind;
    resource: ApprovalResource;
    payload: ApprovalPayload;
    actor: ApprovalActor;
  }): Promise<{ ok: boolean; request?: ApprovalRequest; reason?: string }> {
    const actor = paramsRequest.actor;
    const authorization = isApprovalActionAllowed({
      cfg,
      action: "request",
      resource: paramsRequest.resource,
      actor,
    });
    if (!authorization.allowed) {
      return { ok: false, reason: authorization.reason };
    }
    const executor = executors.get(paramsRequest.kind);
    if (!executor) {
      return { ok: false, reason: "unsupported-kind" };
    }
    const validation = await executor.validate(paramsRequest.payload);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason };
    }
    const createdAt = now().toISOString();
    const approvalId = generateApprovalId();
    const request: ApprovalRequest = {
      approvalId,
      kind: paramsRequest.kind,
      resource: paramsRequest.resource,
      payload: paramsRequest.payload,
      createdBy: actor,
      createdAt,
      status: "pending",
      audit: [buildAuditEvent({ type: "posted", actor, now: now() })],
      postedMessages: [],
    };
    await persistRequest(request);
    const card = await buildApprovalCard(request);
    const targets = resolveTargets(cfg, paramsRequest.resource);
    const postedMessages = await params.messenger.postCard({
      request,
      text: card.text,
      buttons: card.buttons,
      targets,
    });
    const updated = await updateRequest(approvalId, (entry) => ({
      ...entry,
      postedMessages,
    }));
    return { ok: true, request: updated ?? request };
  }

  async function handleCallback(paramsCallback: {
    data: string;
    actor: ApprovalActor;
  }): Promise<{ handled: boolean; reason?: string }> {
    const parsed = parseGatingCallbackData(paramsCallback.data);
    if (!parsed) {
      return { handled: false };
    }
    const request = await getApprovalRequest(parsed.approvalId, storePath);
    if (!request) {
      return { handled: true, reason: "not-found" };
    }
    if (parsed.action === "approve_recreate" && !request.kind.startsWith("cron.apply")) {
      return { handled: true, reason: "invalid-action" };
    }
    const actor = paramsCallback.actor;
    const authorization = isApprovalActionAllowed({
      cfg,
      action: "approve",
      resource: request.resource,
      actor,
    });
    const clickedEvent = buildAuditEvent({ type: "clicked", actor, now: now() });
    if (!authorization.allowed) {
      await updateRequest(request.approvalId, (entry) => ({
        ...entry,
        audit: [...entry.audit, clickedEvent],
      }));
      return { handled: true, reason: "not-authorized" };
    }
    if (request.status !== "pending") {
      return { handled: true, reason: "not-pending" };
    }

    const nextStatus: ApprovalStatus = parsed.action === "deny" ? "denied" : "approved";
    const updated = await updateRequest(request.approvalId, (entry) => ({
      ...entry,
      status: nextStatus,
      audit: [
        ...entry.audit,
        clickedEvent,
        buildAuditEvent({
          type: nextStatus === "approved" ? "approved" : "denied",
          actor,
          now: now(),
        }),
      ],
    }));
    if (!updated) {
      return { handled: true, reason: "not-found" };
    }
    await syncApprovalMessages(updated);

    if (nextStatus === "approved") {
      const executorKind =
        parsed.action === "approve_recreate" ? "cron.apply_recreate" : updated.kind;
      const executor = executors.get(executorKind);
      if (!executor) {
        return { handled: true, reason: "missing-executor" };
      }
      const result = await executor.execute(updated.payload, actor);
      const finalRequest = await updateRequest(updated.approvalId, (entry) => ({
        ...entry,
        audit: [
          ...entry.audit,
          buildAuditEvent({
            type: result.ok ? "executed" : "failed",
            actor,
            now: now(),
            details: result.details,
            note: result.message,
          }),
        ],
      }));
      if (finalRequest) {
        await syncApprovalMessages(finalRequest);
      }
    }
    return { handled: true };
  }

  return {
    requestApproval,
    handleCallback,
    resolveStatus,
  };
}

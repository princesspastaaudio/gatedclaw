import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import lockfile from "proper-lockfile";
import type { ApprovalRequest } from "./types.js";
import { resolveStateDir } from "../config/paths.js";

type ApprovalStore = {
  version: 1;
  approvals: ApprovalRequest[];
};

const STORE_LOCK_OPTIONS = {
  retries: {
    retries: 8,
    factor: 2,
    minTimeout: 50,
    maxTimeout: 5000,
    randomize: true,
  },
  stale: 30_000,
} as const;

const DEFAULT_STORE: ApprovalStore = { version: 1, approvals: [] };

export function resolveApprovalStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = resolveStateDir(env, os.homedir);
  return path.join(stateDir, "gating", "approvals.json");
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readStoreFile(filePath: string): Promise<ApprovalStore> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const parsed = safeParseJson<ApprovalStore>(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.approvals)) {
      return DEFAULT_STORE;
    }
    return parsed;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      return DEFAULT_STORE;
    }
    return DEFAULT_STORE;
  }
}

async function writeStoreFile(filePath: string, value: ApprovalStore): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  await fs.promises.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf-8",
  });
  await fs.promises.chmod(tmp, 0o600);
  await fs.promises.rename(tmp, filePath);
}

async function ensureStoreFile(filePath: string) {
  try {
    await fs.promises.access(filePath);
  } catch {
    await writeStoreFile(filePath, DEFAULT_STORE);
  }
}

async function withStoreLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  await ensureStoreFile(filePath);
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(filePath, STORE_LOCK_OPTIONS);
    return await fn();
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        // ignore unlock errors
      }
    }
  }
}

export async function readApprovalStore(
  filePath: string = resolveApprovalStorePath(),
): Promise<ApprovalStore> {
  return await readStoreFile(filePath);
}

export async function updateApprovalStore<T>(
  filePath: string,
  updater: (store: ApprovalStore) => Promise<{ store: ApprovalStore; result: T }>,
): Promise<T> {
  return await withStoreLock(filePath, async () => {
    const current = await readStoreFile(filePath);
    const { store, result } = await updater(current);
    await writeStoreFile(filePath, store);
    return result;
  });
}

export async function getApprovalRequest(
  approvalId: string,
  filePath: string = resolveApprovalStorePath(),
): Promise<ApprovalRequest | null> {
  const store = await readStoreFile(filePath);
  return store.approvals.find((entry) => entry.approvalId === approvalId) ?? null;
}

export async function appendApprovalRequest(
  request: ApprovalRequest,
  filePath: string = resolveApprovalStorePath(),
): Promise<void> {
  await updateApprovalStore(filePath, async (store) => {
    store.approvals.push(request);
    return { store, result: undefined };
  });
}

export async function updateApprovalRequest(
  approvalId: string,
  updater: (entry: ApprovalRequest) => ApprovalRequest,
  filePath: string = resolveApprovalStorePath(),
): Promise<ApprovalRequest | null> {
  return await updateApprovalStore(filePath, async (store) => {
    const index = store.approvals.findIndex((entry) => entry.approvalId === approvalId);
    if (index === -1) {
      return { store, result: null };
    }
    const updated = updater(store.approvals[index]);
    store.approvals[index] = updated;
    return { store, result: updated };
  });
}

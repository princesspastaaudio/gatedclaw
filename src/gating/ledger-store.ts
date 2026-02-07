import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LedgerPatch } from "./types.js";
import { resolveStateDir } from "../config/paths.js";

export type LedgerValue = string | number | boolean;

export type LedgerSnapshot = {
  version: 1;
  entries: Record<string, LedgerValue>;
};

const LEDGER_NAME_RE = /^[a-zA-Z0-9._-]+$/;

const DEFAULT_LEDGER: LedgerSnapshot = {
  version: 1,
  entries: {},
};

export function resolveLedgerDir(env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = resolveStateDir(env, os.homedir);
  return path.join(stateDir, "workspace", "ledgers");
}

export function isValidLedgerName(name: string): boolean {
  return LEDGER_NAME_RE.test(name);
}

function resolveLedgerPath(ledger: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!isValidLedgerName(ledger)) {
    throw new Error("invalid ledger name");
  }
  return path.join(resolveLedgerDir(env), `${ledger}.json`);
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readLedgerFile(filePath: string): Promise<LedgerSnapshot> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const parsed = safeParseJson<LedgerSnapshot>(raw);
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== "object") {
      return { ...DEFAULT_LEDGER };
    }
    return parsed;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      return { ...DEFAULT_LEDGER };
    }
    return { ...DEFAULT_LEDGER };
  }
}

async function writeLedgerFile(filePath: string, value: LedgerSnapshot): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  await fs.promises.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf-8",
  });
  await fs.promises.chmod(tmp, 0o600);
  await fs.promises.rename(tmp, filePath);
}

export function validateLedgerPatch(
  patch: LedgerPatch,
): { ok: true } | { ok: false; reason: string } {
  if (!patch || typeof patch !== "object") {
    return { ok: false, reason: "patch-empty" };
  }
  if (patch.set) {
    if (typeof patch.set !== "object") {
      return { ok: false, reason: "patch-set-invalid" };
    }
    for (const [key, value] of Object.entries(patch.set)) {
      if (!key.trim()) {
        return { ok: false, reason: "patch-set-key-empty" };
      }
      if (!isValidLedgerName(key)) {
        return { ok: false, reason: "patch-set-key-invalid" };
      }
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        return { ok: false, reason: "patch-set-value-invalid" };
      }
    }
  }
  if (patch.remove) {
    if (!Array.isArray(patch.remove)) {
      return { ok: false, reason: "patch-remove-invalid" };
    }
    for (const entry of patch.remove) {
      if (!entry.trim()) {
        return { ok: false, reason: "patch-remove-empty" };
      }
      if (!isValidLedgerName(entry)) {
        return { ok: false, reason: "patch-remove-key-invalid" };
      }
    }
  }
  return { ok: true };
}

export async function applyLedgerPatch(params: {
  ledger: string;
  patch: LedgerPatch;
  env?: NodeJS.ProcessEnv;
}): Promise<{ ok: true; ledger: LedgerSnapshot }> {
  const filePath = resolveLedgerPath(params.ledger, params.env);
  const current = await readLedgerFile(filePath);
  const nextEntries = { ...current.entries };

  if (params.patch.set) {
    for (const [key, value] of Object.entries(params.patch.set)) {
      nextEntries[key] = value;
    }
  }
  if (params.patch.remove) {
    for (const key of params.patch.remove) {
      delete nextEntries[key];
    }
  }

  const next: LedgerSnapshot = {
    version: 1,
    entries: nextEntries,
  };
  await writeLedgerFile(filePath, next);
  return { ok: true, ledger: next };
}

export function summarizeLedgerPatch(patch: LedgerPatch): string {
  const parts: string[] = [];
  if (patch.set) {
    for (const [key, value] of Object.entries(patch.set)) {
      parts.push(`+${key}=${String(value)}`);
    }
  }
  if (patch.remove) {
    for (const key of patch.remove) {
      parts.push(`-${key}`);
    }
  }
  if (parts.length === 0) {
    return "no changes";
  }
  return parts.slice(0, 6).join(", ");
}

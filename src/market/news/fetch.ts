import { setTimeout as delay } from "node:timers/promises";

export type FetchLimits = {
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  rateLimitPerHostPerMinute: number;
};

export type FetchResult = {
  ok: boolean;
  status: number;
  body: string;
  bytes: number;
};

type RateLimitEntry = {
  lastFetchAt: number;
};

function resolveMinIntervalMs(rateLimitPerHostPerMinute: number): number {
  if (!Number.isFinite(rateLimitPerHostPerMinute) || rateLimitPerHostPerMinute <= 0) {
    return 0;
  }
  return Math.ceil(60_000 / rateLimitPerHostPerMinute);
}

export function createRateLimiter() {
  const hosts = new Map<string, RateLimitEntry>();
  return async (url: URL, rateLimitPerHostPerMinute: number) => {
    const host = url.host;
    if (!host) {
      return;
    }
    const minInterval = resolveMinIntervalMs(rateLimitPerHostPerMinute);
    if (minInterval === 0) {
      return;
    }
    const entry = hosts.get(host);
    const now = Date.now();
    if (entry) {
      const elapsed = now - entry.lastFetchAt;
      if (elapsed < minInterval) {
        await delay(minInterval - elapsed);
      }
    }
    hosts.set(host, { lastFetchAt: Date.now() });
  };
}

export async function fetchWithLimits(url: string, limits: FetchLimits): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), limits.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": limits.userAgent,
      },
    });
    const arrayBuf = await res.arrayBuffer();
    const bytes = arrayBuf.byteLength;
    const sliced = bytes > limits.maxBytes ? arrayBuf.slice(0, limits.maxBytes) : arrayBuf;
    const body = Buffer.from(sliced).toString("utf8");
    return {
      ok: res.ok,
      status: res.status,
      body,
      bytes,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      body: "",
      bytes: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

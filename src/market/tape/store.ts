import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import { VERSION } from "../../version.js";

export type TapePriceRecord = {
  ts: string;
  symbol: string;
  sources: Array<{ name: string; price: number; ts: string }>;
  consensus: { price: number; method: "median" };
  dispersion: { abs: number; pct: number };
  health: { staleSources: string[]; ok: boolean };
  provenance: {
    runId: string;
    agent: string;
    version: string;
  };
};

export const TAPE_PRICES_PATH = path.join("market", "tape", "prices.ndjson");

export function resolveTapePricesPath(): string {
  return path.join(resolveStateDir(), TAPE_PRICES_PATH);
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function appendTapePrice(record: TapePriceRecord): Promise<void> {
  const filePath = resolveTapePricesPath();
  await ensureDir(filePath);
  await fs.promises.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

export function buildTapeProvenance(runId: string, agent: string) {
  return {
    runId,
    agent,
    version: VERSION,
  };
}

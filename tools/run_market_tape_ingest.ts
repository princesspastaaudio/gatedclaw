import crypto from "node:crypto";
import { loadConfig } from "../src/config/config.js";
import { aggregateTape } from "../src/market/tape/aggregate.js";
import { TAPE_SOURCE_HANDLERS, type TapeSourceKind } from "../src/market/tape/sources/index.js";
import type { TapeSourcePrice } from "../src/market/tape/sources/types.js";
import { appendTapePrice, buildTapeProvenance } from "../src/market/tape/store.js";
import { appendRunRecord, buildRunRecord, notifyOperators } from "../src/ops/notify.js";

const cfg = loadConfig();
const tapeCfg = cfg.marketTape ?? {};
const symbols = tapeCfg.symbols?.length ? tapeCfg.symbols : ["BTC", "ETH"];
const sources = tapeCfg.sources ?? [
  { name: "coingecko", kind: "coingecko", enabled: true },
  { name: "coinbase", kind: "coinbase", enabled: true },
  { name: "kraken", kind: "kraken", enabled: true },
];
const staleAfterSeconds = tapeCfg.staleAfterSeconds ?? 300;

const runId = `tape-${crypto.randomUUID()}`;
const startedAt = new Date().toISOString();

const lines: string[] = [];
let totalSources = 0;
let totalSymbols = 0;

for (const symbol of symbols) {
  const activeSources = sources.filter((source) => source.enabled !== false);
  const priceResults: TapeSourcePrice[] = [];
  await Promise.all(
    activeSources.map(async (source) => {
      const handler = TAPE_SOURCE_HANDLERS[source.kind as TapeSourceKind];
      if (!handler) {
        return;
      }
      const result = await handler({ symbol, timeoutMs: 5000 });
      if (!result) {
        return;
      }
      priceResults.push({
        name: source.name,
        price: result.price,
        ts: result.ts,
      });
    }),
  );

  if (priceResults.length === 0) {
    continue;
  }
  totalSources += priceResults.length;
  totalSymbols += 1;
  const aggregate = aggregateTape({
    prices: priceResults,
    now: new Date(),
    staleAfterSeconds,
  });
  await appendTapePrice({
    ts: new Date().toISOString(),
    symbol: symbol.toUpperCase(),
    sources: priceResults,
    consensus: aggregate.consensus,
    dispersion: aggregate.dispersion,
    health: aggregate.health,
    provenance: buildTapeProvenance(runId, "market_tape_ingest"),
  });
  lines.push(
    `${symbol.toUpperCase()}: ${aggregate.consensus.price.toFixed(2)} USD (disp ${(
      aggregate.dispersion.pct * 100
    ).toFixed(2)}%, stale ${aggregate.health.staleSources.join(", ") || "none"})`,
  );
}

const finishedAt = new Date().toISOString();
const record = buildRunRecord({
  runId,
  job: "market_tape_ingest",
  startedAt,
  finishedAt,
  counts: {
    symbols: totalSymbols,
    sources: totalSources,
  },
});

await appendRunRecord(record);
if (lines.length > 0) {
  await notifyOperators(`Market tape health\n${lines.join("\n")}`);
}

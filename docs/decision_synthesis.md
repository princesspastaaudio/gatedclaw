# Decision synthesis

OpenClaw can synthesize deterministic decision candidates from sentiment and market tape inputs, then optionally request trade approvals through gating. This is the Option A decision layer that produces NDJSON artifacts for later accuracy and governance work.

## Required inputs

Decision synthesis reads the following normalized state files:

- `state/coin_calc/sentiment.ndjson`
- `state/market/tape/prices.ndjson`
- Optional: `state/coin_calc/sim_results.ndjson`
- Optional: `state/coin_calc/features.ndjson`
- Optional: `state/market/news/labels.ndjson` and `state/market/news/articles.ndjson` for evidence links

## Outputs

Decision synthesis writes deterministic NDJSON artifacts:

- `state/decisions/candidates.ndjson`
- `state/decisions/proposals.ndjson`
- `state/ops/runs.ndjson` (run accounting with counts and skip histogram)

## Candidate schema overview

Each candidate line includes the decision metadata, signals, evidence, and provenance. The fields follow this shape:

```json
{
  "decisionId": "sha256...",
  "createdAt": "iso",
  "symbol": "BTC/USD",
  "horizon": "24h",
  "recommendedAction": "BUY|SELL|HOLD",
  "positionSizing": { "qty": 0.15, "unit": "BTC", "maxUsd": 2500 },
  "confidence": 0.0,
  "expectedValue": { "directional": "up|down|flat", "edgePct": 0.0, "notes": "..." },
  "risk": { "volatilityPct": 0.0, "maxDrawdownPct": 0.0, "slippageEstimatePct": 0.0, "feeEstimateUsd": 0.0, "riskNotes": "..." },
  "signals": {
    "sentiment": { "bucketTs": "iso", "score": 0.0, "confidence": 0.0, "topTags": [] },
    "marketTape": { "ts": "iso", "consensusPrice": 0.0, "dispersionPct": 0.0, "sourcesOk": 3 },
    "coinCalc": {
      "inputRef": { "simFile": "state/coin_calc/sim_results.ndjson", "featuresFile": "state/coin_calc/features.ndjson" },
      "summary": { "meanReturnPct": 0.0, "p10Pct": 0.0, "p50Pct": 0.0, "p90Pct": 0.0, "regime": "risk-on|risk-off|neutral" }
    }
  },
  "evidence": {
    "articles": [{ "articleId": "...", "title": "...", "url": "...", "sentimentScore": 0.0 }],
    "runs": { "newsRunId": "...", "sentimentRunId": "...", "tapeRunId": "..." }
  },
  "provenance": { "runId": "...", "agent": "decision_synth", "version": "gitSHA", "configHash": "sha256(...)" }
}
```

## Config example

Add a decision section to `config.json`:

```json
{
  "decision": {
    "enabled": true,
    "horizons": ["4h", "24h", "72h"],
    "sentimentWindowBuckets": 6,
    "tapeWindowPoints": 6,
    "minSentimentConfidence": 0.5,
    "maxDispersionPct": 2.5,
    "minDecisionConfidence": 0.55,
    "autoSubmitProposals": false,
    "maxProposalsPerRun": 3,
    "cooldownMinutes": 60,
    "sizing": {
      "maxUsdPerTrade": 2500,
      "confidenceScale": "linear",
      "minUsd": 50
    }
  },
  "trading": {
    "maxOrderUsd": 5000,
    "maxOrderAsset": { "BTC": 0.3, "ETH": 2 }
  }
}
```

## Running decision synthesis

Use the decision synthesis runner to produce candidates and optional proposals:

```
bun tools/run_decision_synth.ts
```

If `decision.autoSubmitProposals` is true, the runner requests trade approvals via gating while still requiring a human approval.

## Submitting approvals from the CLI

You can request approvals directly from recent candidates:

```
bun src/cli/decision_request_trade_approvals.ts --symbol BTC/USD --horizon 24h --limit 3
```

## Telegram card example

Decision synthesis posts a compact admin summary card such as:

```
Decision Candidate Summary
Candidates: 3 · Proposals: 1
Top: BTC/USD BUY 0.12 BTC
Confidence: 71.5% · Dispersion 0.80%
Why: sentiment 0.48 trend 40250.12 up
Approvals: approval-123
```

## Mode behavior

- Mode 1: if `state/coin_calc/sim_results.ndjson` is missing, confidence and risk are derived from sentiment plus tape trend and dispersion only.
- Mode 2: when sim results exist, the p10, p50, p90, and regime fields refine confidence and risk calculations.

For configuration details, see [Configuration](/configuration).

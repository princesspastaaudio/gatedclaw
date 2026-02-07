# OpenClaw decision evaluation and accuracy

## Overview

The decision evaluation jobs record realized outcomes for decision candidates and compute rolling
accuracy metrics. These jobs are read-only with respect to trading behavior and are meant for
observability and governance automation.

## State files

### Outcomes

`state/decisions/outcomes.ndjson` contains one line per decision and horizon:

```json
{
  "outcomeId": "uuid",
  "decisionId": "uuid",
  "symbol": "BTC/USD",
  "horizon": "24h",
  "decisionCreatedAt": "2024-01-01T00:00:00.000Z",
  "evaluatedAt": "2024-01-02T00:00:00.000Z",
  "entry": { "ts": "2024-01-01T00:00:00.000Z", "price": 42000, "source": "market_tape.median" },
  "exit": { "ts": "2024-01-02T00:00:00.000Z", "price": 43000, "source": "market_tape.median" },
  "returnPct": 2.38,
  "direction": "up",
  "realizedVolatilityPct": 2.38,
  "tapeHealth": { "dispersionPct": 1.2, "sourcesOk": 3, "staleSources": [] },
  "provenance": { "runId": "uuid", "agent": "decision_outcomes", "version": "gitSHA" }
}
```

An index file `state/decisions/outcomes.index.json` maps `decisionId::horizon` to `outcomeId`
to keep outcomes idempotent.

### Accuracy

`state/decisions/accuracy.ndjson` stores rolling accuracy metrics per scope:

```json
{
  "metricId": "uuid",
  "ts": "2024-01-02T00:00:00.000Z",
  "scope": { "symbol": "BTC/USD", "horizon": "24h" },
  "window": { "n": 200, "days": 30 },
  "counts": { "total": 12, "buy": 6, "sell": 4, "hold": 2 },
  "accuracy": {
    "directionalHitRate": 58.33,
    "avgReturnPct": 0.42,
    "medianReturnPct": 0.18,
    "p10ReturnPct": -1.1,
    "p90ReturnPct": 1.9
  },
  "calibration": {
    "meanConfidence": 0.63,
    "hitRateAtOrAboveConfidence": [
      { "threshold": 0.55, "hitRate": 60.0, "n": 10 },
      { "threshold": 0.65, "hitRate": 50.0, "n": 6 },
      { "threshold": 0.75, "hitRate": 66.67, "n": 3 }
    ]
  },
  "provenance": { "runId": "uuid", "agent": "decision_accuracy", "version": "gitSHA" }
}
```

## Config

```json
{
  "decisionEvaluation": {
    "enabled": true,
    "horizons": ["4h", "24h", "72h"],
    "holdEpsilonReturnPct": 0.1,
    "minTapeHealthSourcesOk": 2,
    "maxDispersionPct": 2.5,
    "minAgeMinutesBeforeEval": 240,
    "maxDecisionsPerRun": 200,
    "accuracyWindowN": 200,
    "accuracyWindowDays": 30,
    "confidenceBuckets": [0.55, 0.65, 0.75],
    "notifications": {
      "enabled": false,
      "level": "summary",
      "adminOnly": true
    }
  }
}
```

If `horizons` is omitted, the jobs reuse the `decision.horizons` list.

## Running the jobs

```bash
bun tools/run_decision_outcomes.ts
bun tools/run_decision_accuracy.ts
```

## Interpretation

- Directional hit rate is computed from the realized return sign against BUY and SELL decisions.
- HOLD is counted as a hit when the absolute return is below `holdEpsilonReturnPct`.
- Calibration buckets aggregate hit rate for decisions at or above confidence thresholds.

## Limitations

- These jobs are not full backtests and do not include transaction costs.
- Tape lookups are deterministic and prefer the first record at or after the target timestamp.
- Outcomes are skipped when tape health is below configured thresholds.

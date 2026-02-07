# OpenClaw gating for trading and budgets

## Overview

This document describes how trade proposals, ledger postings, and cron budget approvals flow through the OpenClaw gating module. Trading always starts as a proposal and is safe by default. Cron approvals can be budget-aware, and all accounting writes are append-only.

## Trade flow

1. Coin-calc produces sentiment output.
2. The adapter reads the JSON or NDJSON file and creates a `trade.execute` approval.
3. Approval executes the Kraken trade with dry run behavior by default.
4. A new `ledger.postings.apply` approval is created for the finance journal entry.
5. Ledger postings are appended only after the second approval.

## Cron flow with budgets

1. A cron proposal is evaluated for token and cost budgets before an approval is created.
2. `cron.apply_budgeted` approvals show estimated tokens and cost.
3. Execution writes a usage event to the cron metrics journal.

## Example config

```json
{
  "gating": {
    "enabled": true,
    "adminChats": ["123456789"],
    "policies": [
      {
        "resource": "exchange:kraken",
        "request": { "chatClasses": ["admin"] },
        "approve": { "chatClasses": ["admin"] }
      },
      {
        "resource": "ledger:finance",
        "request": { "chatClasses": ["admin"] },
        "approve": { "chatClasses": ["admin"] }
      },
      {
        "resource": "cron_proposal:*",
        "request": { "chatClasses": ["admin"] },
        "approve": { "chatClasses": ["admin"] }
      }
    ]
  },
  "trading": {
    "kraken": {
      "enabled": false,
      "apiKey": "KRAKEN_API_KEY",
      "apiSecret": "KRAKEN_API_SECRET",
      "allowedSymbols": ["BTC/USD"],
      "maxOrderUsd": 5000,
      "maxOrderAsset": { "BTC": 0.25 }
    }
  },
  "budgets": {
    "maxDailyTokens": 100000,
    "maxSingleRunCostUsd": 5
  }
}
```

## Example approval cards

Trade Execute

```
Trade Execute
Exchange: Kraken
Side: BUY
Asset: BTC/USD 0.05
Order: market
Sentiment: 0.62 (conf 0.78)
Risk: calm liquidity window
Fees/Slippage: 2.40 / 0.15%
Mode: DRY RUN
Status: pending
```

Cron Apply Budgeted

```
Cron Apply Budgeted
Proposal: nightly-summarize
Summary: summarize @ 0 2 * * *
Tokens: 24000
Cost: 3.5 USD
Model tier: gpt-4
Expected value: nightly audit refresh
Status: pending
```

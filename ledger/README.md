# 📒 ledger

> 🗺️ Part of [**the ranch**](https://github.com/toxicwind/ranch) — the whole inference estate, one map.

The ranch account book — durable multi-provider token and cost accounting.
Every provider key that serves traffic gets its tokens counted and, where a
verified per-token price exists, its dollars accounted.

## Pricing — verified, never guessed

Each static price cites its source and fetch date in the `PRICING` table in
`ledger.ts`. OpenRouter pricing is dynamic: fetched from
`https://openrouter.ai/api/v1/models` and cached on disk (7-day TTL).

| Provider | Source | Fetched |
|---|---|---|
| google (Gemini 2.x) | Google Cloud Billing Catalog API `AEFD-7695-64FA` (nanos are per-token) | 2026-09-30 |
| google (Gemini 3.x) | https://ai.google.dev/gemini-api/docs/pricing | 2026-09-30 |
| mistral | https://mistral.ai/pricing | 2026-09-30 |
| groq | https://groq.com/pricing (verified rate cards) | 2026-09-30 |
| cerebras | https://www.cerebras.ai/pricing (CostBench verified rates) | 2026-09-30 |
| deepseek | https://api-docs.deepseek.com/quick_start/pricing | 2026-09-30 |
| moonshot | https://platform.moonshot.ai/docs/pricing | 2026-09-30 |
| anthropic (via flock/NIM) | https://www.anthropic.com/pricing | 2026-09-30 |
| openrouter | https://openrouter.ai/api/v1/models (disk cache) | dynamic |

**No silent fallbacks.** An unknown model is never priced as something else: it is
recorded with `NULL` cost and surfaced as **unpriced** in reports (tokens still
counted). Known-free traffic (local herd, `:free` tiers, HuggingFace/GitHub
inference) is recorded at `$0.00` — free is a price, not a gap. Unpriced on
purpose: nvidia/NIM (credit billing, no verified per-token rate), kimi-auto
(resolves dynamically), Gemini `-latest` aliases, audio/speech models.

Run `bun ledger.ts pricing` for the full per-model table.

## CLI

```bash
bun ledger.ts daily 2026-09-30        # one day, provider+model breakdown, JSON
bun ledger.ts range 2026-09-28 2026-09-30
bun ledger.ts pricing                 # the full verified table
bun ledger.ts pricing refresh         # refresh the OpenRouter price cache
bun ledger.ts status                  # db path, row count, providers, unpriced rows
bun ledger.ts record models/gemini-3-flash-preview 1200 300 --provider google --request abc123
```

## Library

```typescript
import { recordUsage, getDailyCost } from "./ledger.ts";

// returns USD cost, 0 for known-free, null when unpriced
const cost = recordUsage({
  provider: "google",
  model: "models/gemini-3-flash-preview",
  inputTokens: 5000,
  outputTokens: 1000,
  requestId: "req-123",
});

const day = getDailyCost("2026-09-30");
// { requests, inputTokens, outputTokens, costUsd, unpricedRequests, unpricedTokens,
//   byProvider, byModel, unpricedModels }
```

## Wiring into a router

The sovereign router hooks `recordUsage` into the non-streaming `callOne` path
for **every** provider — the response's `usage` block fires the record, gated
only on tokens being present. Best-effort and wrapped: accounting never throws
into the response path. (Streaming SSE accumulation is still open.)

## Storage

SQLite at `~/.cache/ranch-ledger/ledger.db` — table `usage_log`
(ts, date, **provider**, model, raw_model, input_tokens, output_tokens,
cost_usd, request_id), indexed by date, model, provider, ts.

Cost semantics per row:
- `cost_usd > 0` → priced at a verified per-token rate
- `cost_usd = 0` → known-free
- `cost_usd NULL` → unpriced (tokens counted, dollars unknown)

## Honest limits

- **Forward-looking only.** Dollars start accruing when the hook goes live.
  Historical billed cost needs the BigQuery billing export (one click in Cloud
  Console — the `billing_export` dataset already exists).
- **Computed from list pricing, not the invoice.** EAP discounts, credits, and the
  >200k-token tiers can move the real bill. There is no Google API for actual
  billed spend outside BigQuery export — verified exhaustively 2026-09-30
  (Catalog API, 29 GitHub repos, web). This is a platform limitation, not a
  tooling gap.
- **OpenRouter cache drift.** Prices are cached for 7 days; refresh with
  `pricing refresh` when precision matters.

# 📒 ledger

> 🗺️ Part of [**the ranch**](https://github.com/toxicwind/ranch) — the whole inference estate, one map.

The ranch account book — durable Gemini token and cost accounting, priced from the
**authoritative Google Cloud Billing Catalog API**. Every token accounted for.

## Why

Request counts tell you volume. The ledger tells you **dollars** — measured tokens ×
Google's own list pricing, recorded per request, aggregated per day, queryable forever.
Forward-looking from the moment it's wired in; no BigQuery export required.

## Pricing — authoritative, not estimated

Fetched 2026-09-30 from `GET https://cloudbilling.googleapis.com/v1/services/AEFD-7695-64FA/skus`
(Gemini service). Key discovery: the API's `unitPrice.nanos` is **per-token**, not
per-`displayQuantity` (which misleadingly says 1,000,000). Verified against public pricing.

| Model | Input / 1M | Output / 1M |
|---|---|---|
| gemini-2.5-pro | $1.25 | $10.00 |
| gemini-2.5-flash | $0.30 | $2.50 |
| gemini-2.5-flash-lite | $0.10 | $0.40 |
| gemini-2.0-flash | $0.10 | $0.40 |

Unknown Gemini model IDs fall back to 2.5-flash pricing (conservative).

## CLI

```bash
bun ledger.ts daily 2026-09-30        # one day, per-model breakdown, JSON
bun ledger.ts range 2026-09-28 2026-09-30
bun ledger.ts pricing                 # the authoritative table
bun ledger.ts record gemini-2.5-flash 1200 300 --request abc123
```

## Library

```typescript
import { recordUsage, getDailyCost } from "./ledger.ts";

const cost = recordUsage({
  model: "gemini-2.5-pro",
  inputTokens: 5000,
  outputTokens: 1000,
  requestId: "req-123",
});
const day = getDailyCost("2026-09-30"); // { requests, inputTokens, outputTokens, costUsd, byModel }
```

## Wiring into a router

After receiving a Gemini response with `usageMetadata`:

```typescript
import { recordUsage } from "<path-to>/ranch/ledger/ledger.ts";

const usage = response.usageMetadata;
if (usage) {
  recordUsage({
    model: requestedModel,
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    requestId,
  });
}
```

For streaming responses, accumulate tokens from the final chunk's `usageMetadata`.

## Storage

SQLite at `~/.cache/ranch-ledger/ledger.db` — table `usage_log`
(ts, date, model, raw_model, input_tokens, output_tokens, cost_usd, request_id),
indexed by date, model, ts.

## Honest limits

- **Forward-looking only.** Dollars start accruing when the hook goes live.
  Historical billed cost needs the BigQuery billing export (one click in Cloud Console —
  the `billing_export` dataset already exists).
- **Computed from list pricing, not the invoice.** EAP discounts, credits, and the
  >200k-token tiers can move the real bill. There is no Google API for actual billed
  spend outside BigQuery export — verified exhaustively 2026-09-30 (Catalog API,
  29 GitHub repos, web). This is a platform limitation, not a tooling gap.

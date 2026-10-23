# Atria API — key behavior / surface fuzz / model-ID errors

Persisted from the session's Atria weird-recon (token-frugal) + key probes.

## API endpoints (each probed with the live `atr_…` key)

| endpoint | result |
|----------|--------|
| `POST /v1/chat/completions` | 200 — works (OpenAI wire) |
| `POST /v1/responses` | 200 — works (Responses-compatible) |
| `POST /v1/messages` | 200 — works (Anthropic x-api-key) |
| `GET /v1/models` | 200 — returns `Atria-Dawn` (+ legacy `Atria-Dawn-Preview` accepted by model field) |
| `GET /v1/chat/completions` | 404/405 — bodyless |
| `POST /v1/embeddings` | 404 — not implemented (no embeddings model) |
| `/usage`, `/quota`, `/account`, `/billing`, `/key`, `/me`, `/me` | 404 — no console-data API |

## Key behavior

- **Bearer auth** (OpenAI) and **x-api-key** (Anthropic Messages) both accepted.
- Invalid key → `401 Invalid API key` (from `GET /v1/models` and chat calls).
- Rate limit: `x-rpm-limit: 50`, `x-rpm-remaining` per-minute, shared across all
  3 APIs + all keys.
- Quota is account-scoped (`token_quota=10000, token_used=849`), a FIXED bucket.
- Unknown settings endpoints (quota/usage/billing) are 404 — quota only in the
  authed web console (`/console/usage` RSC), not the API.

## Model-ID behavior (fuzz)

| requested model | status | result |
|-----------------|:------:|--------|
| `Atria-Dawn` | 200 | chat OK |
| `Atria-Dawn-Preview` | 200 | chat OK (legacy alias still works) |
| `atria-dawn` (lowercase) | — | error (case-sensitive; only exact `Atria-Dawn`) |
| `<empty>` / `<garbage>` | 400 | `model not found` family error |

## Reasoning params

- `reasoning_effort:none` → **400** (not a valid value).
- `enable_thinking:false`, `thinking:{}` → ignored (still reasons).
- `max_tokens <= 64` → `content=null`, all budget → `reasoning_tokens`
  (`finish_reason=length`). Run with `max_tokens >= 128` (512 recommended).
- Guided/FSM (`guided_regex/choice/json`, `response_format:json_object`) accepted
  (200) but unproven at small budget — tokens go to reasoning.

## Token accounting (verified server-side)

- `prompt_tokens=1077`, `completion_tokens=849`, `cached_input_tokens=1077`,
  `uncached_input_tokens=0`, `billed_tokens=849` (output-only; input fully cached).

## Source

- Token-frugal harness: `roundup/sweeps/kappa-atria-recon.py`
- Authed console RSC: `roundup/docs/atria/ferret/console-usage.rsc`,
  `console-keys.rsc`
- Raw: `weird-findings.md`, `README.md`
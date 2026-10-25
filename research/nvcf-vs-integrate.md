# NVCF vs Integrate — Surface Truth Table

**Date:** 2026-10-25 · **Method:** live HTTP probes, secretsmith keyring keys only (no creds persisted)

**Thesis validated on hardware:** `integrate.api.nvidia.com/v1` is a **thin OpenAI-compat facade over the NVCF function plane.** Your NVIDIA key is entitled to *specific function UUIDs*; every model you don't own a function-UUID entitlement for 404s per-account. The "Integrate" product name is cosmetic — it is NVCF behind an OpenAI-shaped door.

## Surface | URL | Auth | What it really is

| Surface | URL | Auth | What it really is |
|---|---|---|---|
| **NVCF control plane** | `https://api.nvcf.nvidia.com/v2/nvcf/functions/ids` | `NVCF_API_KEY`→**403**; `NVIDIA_API_KEY`→**200** | Account's function-UUID inventory. Raw control-plane list endpoint. |
| **NVCF authorized-functions** | `/v2/nvcf/authorizedFunctions/ids` | `NVIDIA_API_KEY` | **404 static-resource** — endpoint does not exist; not part of public API. |
| **NVIDIA NIM / "Integrate"** | `https://integrate.api.nvidia.com/v1/chat/completions` | `NVCF_API_KEY`→**403 Auth failed**; `NVIDIA_API_KEY`→**200 on entitled models / 404 on others** | OpenAI-compat facade over NVCF invocation plane. Key must have the OpenAI-compat endpoint scope. |
| **NVCF polling** | header `NVCF-POLL-SECONDS: 3600` (in `sigma-catalog.json`) | n/a | Sync enqueue affordance: control plane waits up to poll window for a worker (504 = capacity-starved). |
| **NVCF function invocation** (direct) | `https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/{id}` | `NVIDIA_API_KEY` | Raw function invocation — bypasses Integrate facade; schema is per-function, unexplored. |

## Live probe evidence (2026-10-25)

| Probe | HTTP | Body | Classification |
|---|---|---|---|
| `GET /v2/nvcf/functions/ids` with `NVCF_API_KEY` | **403** | `{"detail":"Authorization failed"}` | AUTH_FAILURE — NVCF key lacks list scope |
| `GET /v2/nvcf/functions/ids` with `NVIDIA_API_KEY` | **200** | **214 `functionIds`** (e.g. `6848e171-…`, `befc93f6-…` deepseek-v4-flash-0731) | Live inventory captured |
| `POST integrate /v1/chat/completions` `openai/gpt-oss-20b` + `NVIDIA_API_KEY` | **200** | real completion `chatcmpl-8245…`, `finish_reason:length` | **ENTITLED** — key works on Integrate |
| same endpoint, `nvidia/llama-3.1-8b-instruct` | **404** | `404 page not found` | EOL model (reached EOL 2026-08-26 per prior TRUTH) |
| same endpoint, `nvidia/llama-3.1-nemotron-70b-instruct` | **404** | `Function '9b96341b-9791-4db9-a00d-4e43aa192a39': Not found for account 'iuh5e…rxWY'` | **ENTITLEMENT_GAP** (classified; UUID newly registered) |
| same endpoint, same key + `NVCF_API_KEY` | **403** | `{"detail":"Authorization failed"}` | AUTH_FAILURE — key lacks OpenAI-compat endpoint scope |

## What this means operationally

1. **One key does not rule NVIDIA.** `NVIDIA_API_KEY` is entitled to a *subset* of function UUIDs; sighting a model in `/v1/models` (or the sigma catalog) is **never** a promise it will 200. Every new model needs an account-side "Public API Endpoints" enablement (manual, non-self-service).
2. **NVCF_API_KEY ≠ Integrate credential.** It 403s at the OpenAI-compat door even though it's a valid NVCF-plane token. Route selection must pick the key that matches the *surface*, not the vendor.
3. **`NVCF-POLL-SECONDS` is a sync-window knob**, not magic: 3600 in the catalog tells the control plane to wait up to an hour for a worker (504 = capacity-starved, per 2026-09-20 kimi-k3 finding).
4. **214 function UUIDs are live and owned** by this account — the honest entitlement surface, vs. the ~dozens of models `/v1/models` advertises.

## Artifacts
- Live function-ID snapshot: `/tmp/nvcf_ids_live.json` (214 UUIDs, not committed; key-derived)
- Prior full entitlement snapshot: `provider-fuzz/nvcf_functions_20260920.json` (202 fns, 111 ACTIVE)
- Classifier: `provider-fuzz/nvcf_classifier.py` (ENTITLEMENT_GAP / GLOBALLY_DEAD / CAPACITY_STARVED)
- This UUID now registered in `provider-fuzz/dead_uuids.json` (UNDER_OBSERVATION → ENTITLEMENT_GAP)
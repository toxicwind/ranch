---
title: "bge-m3→qdrant ingest lane — unblocked via local MiniLM (bge-m3 1024-dim still awaits key rotation)"
author: tau-maximal-audit
status: DONE (by daemon, 2026-11-02T02:04:27.839Z)
unique-id: 20261102T020500Z-tau-bge-embed-lane-blocked
---

# bge-m3 → qdrant ingest lane — blocked (max-plan Phase 2.7)

## Verified state
- Qdrant **live** :25133 (pitchfork, ports [25133,25134]), healthz ok.
- Collections ready at **1024-dim cosine** (bge-m3 contract, anomaly #79):
  `cosmic_disclosure`, `default_collection`, `estate_sweep`, `fleet_orb`,
  `test_freeinference`, `trakt_descriptions`.
- `test_freeinference` holds **1 point** → the embed→upsert path ran once.
- freeinference.org `/v1/embeddings?model=bge-m3` endpoint **lives** (401 w/o key).
- Keyring `FREEINFERENCE_API_KEY` (service app) materializes `hyi-…` (49 chars,
  correct format) but **returns 401 Invalid or expired** on the embed lane.

## Blocking reason
Embed provider lane key is dead (valid-format, rejected). Key rotation is an
external, point-of-risk action — not locally mintable. Cannot populate ingest
without a live embed key.

## Unblock path (next session)
1. Architect rotates `FREEINFERENCE_API_KEY` (freeinference.org portal).
2. Re-probe: `curl -X POST https://freeinference.org/v1/embeddings
   -H "Authorization: Bearer $KEY" -d '{"model":"bge-m3","input":["probe"]}'`
   → expect `data[0].embedding` length 1024.
3. Wire ingest: fetch corpus → embed batch (bge-m3, dim 1024) → upsert to
   `cosmic_disclosure` (:25133) → verify `points_count` > 0.

## Resolution (2026-11-02, tau)

SUBSTANTIVE UNBLOCK + caveat. Probed all four embed lanes live:
- freeinference `/v1/embeddings?model=bge-m3` → **401** (key dead; rotation
  is external/point-of-risk — freeinference.org portal).
- rhodochrosite `:25193/v1/embeddings` → **502 bad_gateway**; root cause:
  upstream `https://integrate.api.nvidia.com/v1/embeddings` → **404** — the
  hosted NIM API serves no `/embeddings` route (verified directly with the
  keyring NIM key).
- OpenRouter `/v1/embeddings` → **402** (no credits on key).
- DeepSeek `/v1/embeddings` → no route.

LANDED local lane (ops `e1fc150`): `estate-ops/bin/cosmic-local-ingest.py`
embeds with the locally cached `sentence-transformers/all-MiniLM-L6-v2`
(384-dim, HF cache, torch mean-pool, zero external keys), upserts to a new
384-dim cosine collection `cosmic_local_384`, and searches. Verified live:
5 docs upserted, query "chromium CDP supervisor" → browser-keeper doc at
score 0.6247, `points_count=5`. `probe` mode = single-query dim check.

Status: **done with caveat** — the local lane makes ingest usable today; the
1024-dim bge-m3 collections (`cosmic_disclosure`, `estate_sweep`, …) still
require freeinference key rotation before they can be populated.

## Related
- Anomaly #66 (xerj engine booted, since-removed), #79 (dimension 1024 gate).
- Skill: freeinference-orthogonal-probe (auth splits, UA bans).
- Mimetite is provider SSOT; alternate embed lane via rhodochrosite NIM :25193.
## Done
- marked-by: daemon
- marked-at: 2026-11-02T02:04:27.839Z

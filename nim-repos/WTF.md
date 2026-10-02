# WTF.md — what 25 repos collectively reveal about NIM's real behavior

Forensic narrative from AST + text mining of every cloned repo in
`/home/toxic/estate/ranch/nim-repos/`. Not docs. Not forum. Code.

## The core WTF: NIM is three APIs wearing one trench coat

Every repo, the forum, and NVIDIA's own docs talk about "the NIM API" as one
thing. The code proves there are **three distinct invocation surfaces**, and the
infamous 404-for-account lie only exists on one of them:

| # | Surface | Base | Who uses it | Truthfulness |
|---|---------|------|-------------|--------------|
| 1 | OpenAI-compatible | `integrate.api.nvidia.com/v1` | everyone (chat/completions, /v1/models) | **lies** — catalog ≠ entitlement; 404 hides "not deployed for you" |
| 2 | NVCF function plane | `api.nvcf.nvidia.com/v2/nvcf` | three.ws only (among 25 repos) | **honest** — `/functions` lists exactly what YOUR key can invoke, with per-function `status` |
| 3 | NVCF preview invoke | `ai.api.nvidia.com/v1/genai/...` | three.ws (trellis/cosmos/A2F/ASR/TTS) | async-native: 202 + `NVCF-REQID` → poll `pexec/status` |

Nobody in the forum thread knows surface #2 exists as an entitlement oracle.
Our own provider-fuzz tooling doesn't use it yet. **It should be probe #0**:
`GET /v2/nvcf/functions` with the key answers "what is live for me" without
burning a single completion or parsing a single lie.

## WTF #2: the 404 body is a confession, not an error

`{"status":404,"title":"Not Found","detail":"Function '<uuid>': Not found for account '<acct>'"}`

NemoClaw's `nvcf-model-access.ts` is the only code in 25 repos that treats this
correctly: it regex-matches the *body* (`/Function[ \t]+'[^']+':[ \t]*Not found
for account/i`) and keeps a **POSIX ERE twin** of the same pattern for shell
probes so the host and sandbox classifiers can't drift. Everyone else either
swallows it as generic-404 or never sees it because they classify on status
code alone. The UUID in the body is the deprovisioned function's fingerprint —
collect it, don't discard it. That's the entire UUID-audit thesis, and exactly
one repo implements it.

## WTF #3: "Public API Endpoints" is a key-creation flag, not an account property

big-agi's docs + tibbee's troubleshooting converge: the scope is selected **when
the key is minted**. A key created without it "looks valid but fails all
inference with 404". Consequence nobody states outright: **a scope-less key can
never be repaired — only replaced.** Every dead key in our drawer that predates
PAE awareness is permanently scope-less. Stop probing them for model access;
their only use is as negative controls.

## WTF #4: kimi-k3's 90-second hang might be an async-protocol hang, not death

Our probe: kimi-k3 hung 90s+ on `chat/completions`. three.ws documents the NVCF
async contract: the gateway holds the socket up to `NVCF-POLL-SECONDS`, then
returns **202 + `NVCF-REQID`** for polling. A model that only completes async
will look "hung" to a client that waits for 200+body and never handles 202.
kondi independently reports `meta/llama-4-maverick` and `qwen/qwen3.5-397b-a17b`
as "hangs on any real completion" — the same signature. Hypothesis worth one
probe: these models may be alive behind the async path and dead-looking on the
sync path. Try `NVCF-POLL-SECONDS: 30` + 202 handling before declaring death.

## WTF #5: the `NVCF-AI-Resource` header (unverified, one config file)

`lucky-mandator/gocode-router/example.config.yaml:25` sends
`NVCF-AI-Resource: "moonshotai/kimi-k2.5"` as a custom header to
`integrate.api.nvidia.com/v1`. If the gateway honors it, the header pins the
NVCF function directly — possibly bypassing whatever catalog-routing layer
produces the 404 lie. The Go code itself is generic custom-headers plumbing;
only the example config demonstrates the NVCF usage. **Untested by us.**
One live probe decides if this is a workaround or a no-op.

## WTF #6: the catalog has at least four known liars with distinct failure modes

kondi (verified 2026-07, independent of us):
- `moonshotai/kimi-k2.6` → 404 "Function not found" (matches our GLOBALLY_DEAD)
- `meta/llama-4-maverick` → hangs
- `qwen/qwen3.5-397b-a17b` → hangs on any real completion
- `minimaxai/minimax-m3` → instant "Internal server error" on streaming

rickeshtn/nim-code (~87 days ago): kimi-k2.6 "6/6 on stress suite" — the model
was healthy then. Death window: **~May (degraded, repetition bug) → early July
(decommissioned)**. The forum's infinite-"!!!" thread (May 2026) was the canary.

## WTF #7: auth failure is 403, not 401 (FreeRideV3, probed 2026-05-07)

Bad key → `403 {"status":403,"title":"Forbidden","detail":"Authorization failed"}`.
Any classifier mapping only 401→AUTH mislabels every dead NIM key. Map both.

## WTF #8: 410 means retired-permanent; plain-404 means typo

tibbee's disambiguation, confirmed across repos:
- `404` + plain-text `404 page not found` (no JSON, no UUID) → bad/renamed model id
- `404` + JSON + `Function '<uuid>'` → not entitled OR deprovisioned
- `410` + "end of life" → retired, permanent, stop probing
- flapping 404↔200 on new models → function registration propagating, retry first

## What to build (priority order)

1. **NVCF function-list probe** — `GET api.nvcf.nvidia.com/v2/nvcf/functions` per
   key; diff against `/v1/models`. This is the entitlement ground truth.
2. **202/async handling** in probe_truth.py — `NVCF-POLL-SECONDS: 30`, follow
   `NVCF-REQID` to `pexec/status`. Re-probe the "hangers" (kimi-k3, llama-4-maverick).
3. **NVCF-AI-Resource header probe** — one request, kimi-k2.5 per the config.
4. **Ghost-ID guard** (tibbee's pattern) — pin dead UUIDs so catalog refreshes
   can't resurrect them.
5. **Shell-ERE twin** of the NVCF 404 regex (NemoClaw's pattern) for bash-side probes.
6. **403→AUTH mapping** alongside 401.

## Corrections to earlier harvest notes

- gocode-router's *Go code* has no NVCF-specific header logic — only generic
  custom-headers plumbing. The `NVCF-AI-Resource` usage is in its
  `example.config.yaml`. Attribution corrected; the probe is still worth running.
- Bulk UUID regex hits across NemoClaw/three.ws/claude-code-router are test
  fixtures. Only two carry live-capture provenance (see HARVEST.md).

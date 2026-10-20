# Atria-Dawn — recon findings (2026-10-20)

Full behavioral fingerprint of the Atria API's single model, from a token-frugal
probe harness (`roundup/sweeps/kappa-atria-recon.py`) and a request-oracle HAR
capture of the Atria web console. Frugal because the trial key carries a hard
~10k token bucket (not daily).

## Model operating constraints (the decisive findings)

1. **Atria-Dawn is a pure reasoning model.**
   - With `max_tokens <= 64` the response has `content=null`, `finish_reason=length`,
     and the ENTIRE completion budget goes to `reasoning_tokens`.
   - At `max_tokens=512` it emits real content (e.g. `'VISIBLE_OK'`, only 11
     reasoning tokens) with `finish_reason=stop`.
   - **Callers MUST set `max_tokens >= ~128` (512+ recommended) or they get an
     empty visible answer.** This is the #1 integration gotcha.
   - Streaming (SSE) carries BOTH `reasoning_content` then `content` deltas. The
     first streaming chunks are `reasoning_content` ("Let's…"); `content` starts
     empty. `@ai-sdk/openai-compatible` handles this (reads `delta.content`).

2. **Reasoning cannot be disabled.**
   - `reasoning_effort: "none"` -> HTTP 400 (rejected).
   - `enable_thinking: false` and `thinking:{...}` are silently ignored (still
     produces reasoning tokens).

3. **Guided/structured decoding is not honored at small budgets.**
   - `guided_regex`, `guided_choice`, `guided_json`, and `response_format:
     json_object` all return 200 but the tokens all go to `reasoning_tokens`
     (finish=length, content=null). No evidence the grammar is applied before the
     budget runs out. Verify with a large `max_tokens` before relying on it.

4. **Parallel branches ignored.**
   - `n: 2` and `n: 4` both return exactly 1 choice (like Anthropic Messages default).

5. **Prompt caching is active.**
   - Every request shows `cached_tokens == prompt_tokens` (full input cache hit).
   - Reused prefixes are effectively free input-wise; `created_cache_tokens: 0`.

6. **TTFT is slow and grows super-linearly with tiny budgets.**
   - ~7.0s @ 1 tok, ~6.4s @ 4 tok, ~17.8s @ 8 tok. The reasoning phase dominates.

7. **`accept*`/`stop`/`metadata`/`seed`/`logprobs` all accepted (200) but moot at
   tiny budget** — reasoning eats everything; effect only visible with budget.

## Quota / accounting (from dashboard + HAR)

- **It is a BUCKET, not daily.** Dashboard: "Total quota 10,000 · 2.84% used ·
  284 lifetime settled". No evidence of a per-day reset for this trial key.
- Rate limit is per-minute: `x-rpm-limit: 50`, `x-rpm-remaining` in every response.
- Quota is NOT exposed via the API. The console reads it from an authenticated
  Logto-session RSC endpoint `/console/usage`.

## HAR structure (request-ord position in the console)

- Atria runs **Next.js on Vercel** with RSC flights (`?_rsc=`).
- Data routes behind the console (session-cookie gated, `cache-control:
  private,no-cache,no-store`, 0-byte bodies in the capture):
  - `/console/usage?_rsc=…` — quota/usage
  - `/console/keys?_rsc=…`     — API keys
  - `/console`                 — shell
- Infra: logo on **AliyunOSS -> CloudFront**; console flights P50 ~230-310ms, one
  cold `/console` at 913ms. No inference `/v1/*` calls in the capture
  (dashboard navigation only).
- The RSC `GET /console/usage` without the Logto cookie returns only the page
  shell (metadata/title), NOT the quota numbers — no public leak path.

## Ferret-den (projectdiscovery) surface recon — pending

`ferret` wraps projectdiscovery binaries (`dnsprobe`=dnsx, `webprobe`=httpx,
`subprobe`=subfinder, `altprobe`=alterx, `tlsprobe`, `cdnprobe`, …). Targets for
Atria: `api.atria-asi.ai`, `www.atria-asi.ai`, `auth.atria-asi.ai`. Results to be
saved under `docs/atria/ferret/`.

## Files in this folder

```text
docs/atria/
  README.md        <- this file
  weird-findings.md<- full probe transcript (kappa-atria-recon.py output)
  ferret/          <- ferrret/den network surface results (dns/web/tls/alt)
../sweeps/kappa-atria-recon.py <- the reusable token-frugal probe harness
```
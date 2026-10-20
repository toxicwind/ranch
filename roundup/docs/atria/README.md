# Atria-Dawn — max recon (2026-10-20)

Authoritative account + model fingerprint, assembled from:
- authenticated `/console/usage` + `/console/keys` RSC payloads (browserless
  replay of the live Firefox `logto_*` session — the HAR-stripped cookies
  redirect to /sign-in, the live 1505-char value authenticates),
- a token-frugal model probe harness (`roundup/sweeps/kappa-atria-recon.py`),
- a request-oracle HAR of the web console,
- `ferret` (projectdiscovery) surface recon in `ferret/`.

## Account / quota — AUTHORITATIVE (server-side)

Account `18cj82f8ebua` · `toxicwind@gmail.com` · `Chris` · `isAdmin: false`

| field | value |
|-------|-------|
| `token_quota` | 10000 |
| `token_used`  | 849   |
| remaining     | ~9,151 |
| `suspended_at`| null |
| `suspension_version` | 0 |

**It is a FIXED BUCKET, not daily.** No reset. The dashboard earlier showed 284
settled; by this authed read it was 849 (drained by probing live).

### Billing is output-only (input is cached free)

Per badging key `new` (`atr_wg37kbis…`, active, id `905975b8-…`):

| metric | value |
|--------|-------|
| request_count | 34 |
| prompt_tokens | 1077 |
| completion_tokens | 849 |
| cached_input_tokens | 1077 |
| uncached_input_tokens | **0** |
| billed_tokens | 849 (= completion only) |
| cache_observed_input | 1077 |

The model cache makes **all input free** (`cached_input_tokens == prompt_tokens`,
`uncached == 0`), so billing == output tokens. Prompt hits cost nothing; reuse
long prefixes freely.

## Model operating constraints (from the probe harness)

1. **Reasoning model.** `max_tokens <= 64` → `content=null`, `finish=length`,
   ALL budget to `reasoning_tokens`. At `max_tokens=512` → real content
   (`'VISIBLE_OK'`, 11 reasoning tok, finish=stop). **Call with `max_tokens >=
   ~128` (512 recommended) or you get an empty reply.**
   - SSE carries `reasoning_content` then `content` deltas; `@ai-sdk/openai-compatible`
     reads `delta.content`. Compatible.
2. **Reasoning can't be disabled**: `reasoning_effort:none` → 400; `enable_thinking`
   /`thinking` ignored.
3. **Guided/FSM decode unproven at small budget**: `guided_regex/choice/json`,
   `response_format:json_object` all 200 but tokens → reasoning. Verify with
   generous `max_tokens`.
4. **`n` ignored**: `n:2`/`n:4` → always 1 choice.
5. **TTFT slow + reasoning-tax**: ~7s@1, 6.4s@4, 17.8s@8.
6. Rate limit **50 rpm** (`x-rpm-limit: 50`) shared across all 3 APIs + all keys.

## API surface / infra (HAR + ferret)

- Console = **Next.js on Vercel**, RSC `?_rsc=` flights, Logto auth.
- Hosts (ferret webprobe):
  - `auth.atria-asi.ai` → 302 (Logto)
  - `www.atria-asi.ai` → 200 "Atria Dawn" (CloudFront + Alibaba OSS + AWS, HTTP/3)
  - `api.atria-asi.ai` → 200 "Atria Dawn — 模型 API" (console)
  - `www.api.atria-asi.ai` → subfinder discovery, no live HTTP
- Quota/key data: `GET /console/usage?_rsc=…` and `GET /console/keys?_rsc=…`
  (auth'd), `cache-control: private,no-cache,no-store`.

## Files

```text
docs/atria/
  README.md             <- this summary
  weird-findings.md     <- full probe transcript
  ferret/
    README.md           <- surface recon summary
    webprobe.txt / dnsprobe.txt / tlsprobe.txt / subprobe.txt
    console-usage.rsc   <- authed usage payload (raw)
    console-keys.rsc    <- authed keys payload (raw)
../sweeps/kappa-atria-recon.py  <- reusable token-frugal harness
../sweeps/kappa-atria-sweep.sh  <- guidellm throughput benchmark
```
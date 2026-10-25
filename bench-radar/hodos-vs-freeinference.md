# Hodos vs FreeInference — failover & route reality (2026-10-25)

**Scope:** live probe of the hodos merged router (`:25193`) vs the freeinference provider it fronts. Method: real `/v1/models` snapshot + a live completion, key from `~/.tau/hodos.key`. No creds persisted.

## Live state — 555 models, 14 provider flocks, all healthy

| Provider flock | models | circuit | lat (ms) | notes |
|---|---|---|---|---|
| openrouter | 449 | closed | 504 | dominant pool |
| mistral | 53 | closed | 344 | |
| nvidia | 14 | closed | 3596 | NIM/Integrate front-end |
| google (EAP) | 8 | closed | — | |
| groq | 7 | **half_open** | 68 | the one degraded flock |
| **freeinference** | **7** | closed | **90** | fast, meanwhile serving this session |
| openai | 6 | closed | — | |
| cerebras/together/fireworks/hyperbolic/siliconflow/perplexity/github | 1–2 each | closed | — | |

`unhealthy: 0`. freeinference is **7 of 555 models** but lowest-latency of the big pools (90ms vs openrouter 504ms).

## freeinference in hodos (`proxy/src/pinax_providers.rs`)

- `base_url: https://freeinference.org/v1`, `key_env: FREEINFERENCE_API_KEY`, adapter `openai`, `enabled: true`.
- Context lengths: **deepseek-v4-flash = 1,000,000** (also glm-5.3-flash, minimax-m3 at 1M; qwen3.6-35b / diffusiongemma at 262k).
- 7 live model IDs: `glm-5.3-flash`, `minimax-m3`, `qwen3.6-35b`, `diffusiongemma`, `deepseek-v4-flash`, `minimax-m3.1-flash`, `bge-m3`.
- Key resolves at runtime (flock healthy → 200s); source is `~/.secrets` per `serve.sh`, not committed.

## Failover mechanics (default `hybrid` strategy)

From `routers/strategies/router.ts` + `router_config.ts`:
- Strategy: **sticky → ast_race → circuit_chain**; explicit CODING aliases bypass the race.
- `MAX_PARALLEL=4`, FIFO cap 64, `HEDGE_MS=1500` (next lane fires if a lane hasn't won in 1.5s), `ATTEMPT_MS=120s`.

**How a freeinference max-concurrent-2 (429) is handled:** the freeinference provider is one flock among 14. When it 429s, the router's governor marks the worker exhausted (`exhaustedTotal`), the circuit takes strikes, and traffic **fails over to the other 13 flocks** (sticky → race → chain). If every stream provider is exhausted, it returns `503 all_stream_providers_exhausted` — it does *not* hang. `MAX_PARALLEL=4` is the router's own local ceiling (not freeinference's 2) — the freeinference 2-concurrency cap surfaces as 429s which the governor + circuit absorb.

Live probe:

```
POST /v1/chat/completions {model:"deepseek-v4-flash"} → HTTP 200, "PONG", 280ms, 13 tokens via freeinference flock
```

Served through the freeinference lane; proves the fast-path is live end-to-end.

## Surfaces (auth from `~/.tau/hodos.key`)

| Surface | URL | Auth result |
|---|---|---|
| health | `:25193/health` | 200 `ok` |
| live models | `:25193/v1/models` | 200 (555 models, flock state) |
| chat completions | `:25193/v1/chat/completions` | 200 (freeinference lane) |
| **usage/quota** | `:25193/api/usage/*` | **401** — requires session-cookie / `Bearer user:pass`, NOT the proxy key. Admin-only. |

## Bottom line for the "why 160 / failover" question

- freeinference is a **fast, small, 1M-context lane** (7 models / 90ms / deepseek-v4-flash 1M), not the pool. Its value is latency + context, its risk is the 2-concurrency cap.
- hodos already has the machinery (governor exhaustion + circuit + 14-flock race) to survive a freeinference 429: **failover is structural, not manual.** To read the *quota/history* numbers the task asked for, the admin session credential for `:25193/api/usage/*` is needed — I did not chase it; it's a separate admin surface, not a routing-path concern.
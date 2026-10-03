# cuttinggate

*The canonical live router for the estate: one OpenAI-compatible endpoint fans requests across cloud providers and local inference with strategy-based failover, circuit breakers, and sticky sessions.*

![ranch](https://img.shields.io/badge/toxicwind-ranch-blue?style=for-the-badge) ![mesh](https://img.shields.io/badge/mesh-cuttinggate-purple?style=for-the-badge) ![bun](https://img.shields.io/badge/bun-black?style=for-the-badge) ![port 25200](https://img.shields.io/badge/port-25200-green?style=for-the-badge)

## Why this exists

Every model an agent can think with should be one request away. cuttinggate is that one request: **strategy names — not model names — decide where traffic goes**, so clients never rewire when providers change. It replaced the sovereign-router on `:25104` (retired 2026-10-02) and absorbed the flock-proxy role (`:25193`, retired).

- **Strategy-based routing** — `hybrid` (default: sticky → ast_race → circuit_chain), `free`, `ast_race`, `sticky_affinity`, `weighted_elo`, `circuit_chain`, `fifo_matrix`.
- **Zero-cost by default** — the `free` strategy races local herd inference against every `:free` cloud model; cost-sensitive agents never touch a paid endpoint by accident.
- **Self-healing** — per-provider circuit breakers (open/half-open), key pools with 429 rotation, quarantine for poisoned upstreams.
- **Observable** — pino JSON logs, `/health`, `/v1/models`, and a token/cost ledger.

## Quick Start

```bash
curl -sf http://127.0.0.1:25200/health      # router health
curl -sf http://127.0.0.1:25200/v1/models   # model list
curl -H "X-Sovereign-Strategy: free" http://127.0.0.1:25200/v1/chat/completions
```

Run it: `bun run src/server.ts` — port via `CUTTINGGATE_PORT` (default `:25200`, Bun ≥ 1.4.0). In production it's supervised by pitchfork; see `pitchfork.d/`.

## Layout

```text
src/
  server.ts       HTTP entry (Elysia)
  router/         strategy engine: decision, governor, strategy selection
  strategy/       vendored sovereign-router TS strategy layer (router_*.ts)
  catalog.ts      provider catalog, generated from mesh/catalog
  keypool.ts      key-pool client (talks to mesh/keypool)
  circuit.ts      circuit breakers
  quarantine.ts   poisoned-upstream quarantine
  ledger.ts       token/cost accounting
  auth/           tokens, users
config/           router config
tests/            bun test suite (`bun test`)
```

## Where it sits

Part of the [mesh](../../README.md) routing plane at `ranch/mesh/proxy/cuttinggate/`. It replaced `:25104` (sovereign-router, retired) and absorbed the `:25193` flock-proxy role (retired). Herd (`:25100`) is its local-inference leg when up.

## Dev / contributing

Changes land as commits in the [toxicwind/ranch](https://github.com/toxicwind/ranch) repo (`mesh/proxy/cuttinggate/`). `bun run check` (typecheck + tests) before pushing. Keys live in 0600 files under `/home/toxic/` — never in this repo, never in logs.
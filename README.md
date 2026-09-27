# 🤠 ranch

**The ranch holds the herd and the flock.**

One map over the whole inference stack: the local front door, the external
provider router, and the contract between them. No more re-deriving it from
stray checkouts.

`~/sovereign/projects/range/ranch` • remote [`toxicwind/ranch`](https://github.com/toxicwind/ranch)

---

## The animals
```
                        ┌───────────────────────────────────┐
  clients ─────────────▶│                herd               │ :25100
                        │          LOCAL front door         │
                        │        llama-swap fork (Go)       │
                        │          on-box GGUFs via         │
                        │         llama.cpp engines         │
                        │    ~/sovereign/projects/range/    │
                        │        ranch/stockyard/herd       │
                        └──────────────┬────────────────────┘
                                       │ flock: key → daemon
                        ┌──────────────▼────────────────────┐
                        │               flock               │ :25193
                        │      EXTERNAL provider router     │
                        │             Rust proxy            │
                        │     NIM · OpenRouter · Groq ·     │
                        │            Cerebras · …           │
                        │     /home/toxic/projects/flock    │
                        │     upstream: toxicwind/flock     │
                        └──────────────┬────────────────────┘
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
               NVIDIA NIM         OpenRouter        herd :25100    
             best damn free      (free tiers)        llama-swap    
                endpoint                          provider: local  
                                                 models via router)
```

| Service | Port | Source | Role |
| :--- | :---: | :--- | :--- |
| **herd** | `25100` | `ranch/stockyard/herd` — in the monorepo. `~/sovereign/projects/herd` is a compat symlink to it. | LOCAL front door. Go, llama-swap fork. Serves on-box GGUFs over llama.cpp engines, delegates cloud to flock. |
| **flock** | `25193` | `/home/toxic/projects/flock` → [`toxicwind/flock`](https://github.com/toxicwind/flock) — own repo, checked out outside the ranch. `stockyard/flock/` is a pointer README, not the source; the sovereign plugin entry resolves to that pointer. | EXTERNAL provider router. Rust. Strategies, key pools, 429 rotation, circuit breakers, health/Elo. |
| **gatehouse** | `25127` | `barn/gatehouse` (this repo) | MCP gateway. Tool serving. A peer of the other two, not their parent — see [Not the holder](#not-the-holder). |

All three run under pitchfork as daemons `herd`, `flock`, and `gatehouse`.

---

## The contract

- herd serves what's local; anything cloud goes to the flock daemon via its
  `flock:` config key.
- flock's `llama-swap` provider points back at herd `:25100` for local models.
- Strategy names are routing directives, not model names: `free` →
  `Strategy::Free` → free-tier external providers (NIM first — the best damn
  free endpoint — then OpenRouter-free, …).
- The provider registry lives in flock. herd's in-tree `internal/flock`
  in-process router was retired 2026-09-17 and is not compiled into the
  shipped binary; the server imports routing from the upstream
  `llama-swap` module instead. Cloud routing is the `flock:` key.
- See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full contract.

---

## Not the holder

[gatehouse](https://github.com/toxicwind/ranch) — `barn/gatehouse` in this
repo — is the MCP gateway. Tool serving, a peer of the ranch animals, not their
parent.

It was renamed mcpproxy → shep → gatehouse on 2026-09-26. `shep` now means the
unrelated [`shep-ai/shep`](https://github.com/shep-ai/shep) agent orchestrator,
not this gateway. Upstream is unchanged
(`github.com/smart-mcp-proxy/mcpproxy-go`, binary `cmd/mcpproxy`), so
`MCPPROXY_API_KEY` keeps its upstream name.

Its `mcp_config.json` is gitignored: gatehouse rewrites the effective config on
every start, re-materializing live secrets. `mcp_config.json.dist` is the
tracked scrubbed template, and `../bin/gatehouse-serve.sh` injects secrets from
`/home/toxic/.secrets` at runtime, bootstrapping the live config from the
template on a fresh checkout.

The ranch is held together by **pitchfork** (supervision), this repo (the map),
and sovereign config (the wiring).

---

## Quickstart

```sh
# herd — local models
curl -s http://127.0.0.1:25100/v1/models | jq -r '.data[].id' | head

# flock — external providers (needs client auth, see repo)
curl -s http://127.0.0.1:25193/v1/models -H "Authorization: Bearer $FLOCK_KEY"

# the free route, end to end: super-ralph → flock → free-tier provider
curl -s http://127.0.0.1:25193/v1/chat/completions \
  -H "Authorization: Bearer $FLOCK_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"free","messages":[{"role":"user","content":"moo"}]}'
```

Both animals answer `/health`:

```sh
for p in 25100 25193; do printf '%s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$p/health)"; done
# 25100 200
# 25193 200
```

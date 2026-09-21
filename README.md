# 🤠 ranch

**The ranch holds the herd and the flock.**

One map over the whole inference stack: the local front door, the external
provider router, and the contract between them. No more re-deriving it from
stray checkouts.

```
                        ┌──────────────────────────────┐
  clients ─────────────▶│             herd             │ :25100
                        │  LOCAL front door            │
                        │  llama-swap fork (Go)        │
                        │  on-box GGUFs via            │
                        │  llama.cpp engines           │
                        │  sovereign-projects/         │
                        │    projects/herd             │
                        └──────────────┬───────────────┘
                                       │ flock: key → daemon
                        ┌──────────────▼───────────────┐
                        │            flock             │ :25193
                        │  EXTERNAL provider router    │
                        │  Rust proxy                  │
                        │  NIM · OpenRouter · Groq ·   │
                        │  Cerebras · …                │
                        │  /home/toxic/projects/flock  │
                        │  (toxicwind/flock)           │
                        └──────────────┬───────────────┘
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              NVIDIA NIM          OpenRouter           herd :25100
              (best damn          (free tiers)         (llama-swap provider:
               free endpoint)                         local models via router)
```

## The animals

| | herd — LOCAL | flock — EXTERNAL |
|---|---|---|
| **Role** | On-box inference. OpenAI-compatible `:25100`, serves local GGUFs, delegates cloud to flock | Cloud provider router. Strategies, key pools, 429 rotation, circuit breakers, health/Elo |
| **Home** | `sovereign-projects/projects/herd` (monorepo, local-first) | `/home/toxic/projects/flock` → [`toxicwind/flock`](https://github.com/toxicwind/flock) (own repo, checked out in projects) |
| **Language** | Go (llama-swap fork) | Rust |
| **Port** | `127.0.0.1:25100` | `127.0.0.1:25193` |
| **Supervised by** | pitchfork `herd` | pitchfork `flock` |

## The contract

- herd serves what's local; anything cloud goes to the flock daemon via its `flock:` config key.
- flock's `llama-swap` provider points back at herd `:25100` for local models.
- Strategy names are routing directives, not model names: `free` →
  `Strategy::Free` → free-tier external providers (NIM first — the best damn
  free endpoint — then OpenRouter-free, …).
- One provider registry lives in flock; herd's `astmatrix` copy is retired.
- See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full contract.

## Not the holder

[shep](https://github.com/toxicwind/sovereign-projects/tree/main/projects/mesh) is the
MCP gateway (tool serving) — a peer of the ranch animals, not their parent.
The ranch is held together by **pitchfork** (supervision), this repo (the map),
and sovereign config (the wiring).

## Quickstart

```sh
# herd — local models
curl http://127.0.0.1:25100/v1/models | jq '.data[].id' | head

# flock — external providers (needs client auth, see repo)
curl http://127.0.0.1:25193/v1/models -H "Authorization: Bearer $FLOCK_KEY"

# the free route, end to end: super-ralph → flock → free-tier provider
curl http://127.0.0.1:25193/v1/chat/completions \
  -H "Authorization: Bearer $FLOCK_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"free","messages":[{"role":"user","content":"moo"}]}'
```

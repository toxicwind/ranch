# 🤠 ranch

**The ranch holds the herd and the flock.**

One map over the whole inference stack: where the model front door lives,
where the cloud router lives, and the contract between them. No more
re-deriving it from stray checkouts.

```
                        ┌──────────────────────────────┐
  clients ─────────────▶│             herd             │ :25100
                        │  local front door            │
                        │  llama-swap fork (Go)        │
                        │  sovereign-projects/         │
                        │    projects/herd             │
                        └──────────────┬───────────────┘
                                       │ flock: key → daemon
                        ┌──────────────▼───────────────┐
                        │            flock             │ :25193
                        │  external cloud router       │
                        │  Rust proxy                  │
                        │  /home/toxic/projects/flock  │
                        │  (toxicwind/flock)           │
                        └──────────────┬───────────────┘
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              NVIDIA · Groq      OpenRouter ·        herd :25100
              Cerebras · ...      Cerebras · ...      (llama-swap provider
              (direct providers)                     for local models)
```

## The animals

| | herd | flock |
|---|---|---|
| **Role** | Local inference front door. OpenAI-compatible `:25100`, serves local GGUFs + routes cloud via flock | External cloud provider router. Strategies, key pools, 429 rotation, circuit breakers, health/Elo |
| **Home** | `sovereign-projects/projects/herd` (in the monorepo — local-first) | `/home/toxic/projects/flock` (own repo `toxicwind/flock` — external, checked out in projects) |
| **Language** | Go (llama-swap fork, module `github.com/mostlygeek/llama-swap`) | Rust |
| **Port** | `127.0.0.1:25100` | `127.0.0.1:25193` |
| **Supervised by** | pitchfork `herd` | pitchfork `flock` |

## The contract

- herd delegates cloud routing to the flock daemon via its `flock:` config key.
- flock's `llama-swap` provider points back at herd `:25100` for local models.
- Strategy names are routing directives, not model names: `free` →
  `Strategy::Free` → free-tier providers (incl. NIM, the best damn free endpoint).
- One provider registry lives in flock; herd's `astmatrix` copy is retired.
- See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full contract.

## Not the holder

[shep](https://github.com/toxicwind/sovereign-projects/tree/main/projects/mesh) is the
MCP gateway (tool serving) — a peer of the ranch animals, not their parent.
The ranch is held together by **pitchfork** (supervision), this repo (the map),
and sovereign config (the wiring).

## Quickstart

```sh
# herd — local front door
curl http://127.0.0.1:25100/v1/models | jq '.data[].id' | head

# flock — cloud router (needs client auth, see repo)
curl http://127.0.0.1:25193/v1/models -H "Authorization: Bearer $FLOCK_KEY"

# the free route, end to end: super-ralph → flock → free-tier provider
curl http://127.0.0.1:25193/v1/chat/completions \
  -H "Authorization: Bearer $FLOCK_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"free","messages":[{"role":"user","content":"moo"}]}'
```

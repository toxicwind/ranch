# Ranch architecture

## Local vs external

- **herd is LOCAL.** On-box models (GGUFs via llama.cpp engines), served at
  `:25100`. Lives in the monorepo: `sovereign-projects/projects/herd`.
- **flock is EXTERNAL.** Cloud providers — NVIDIA NIM, OpenRouter, Groq,
  Cerebras, … — routed at `:25193`. Own repo `toxicwind/flock`, checked out at
  `/home/toxic/projects/flock`.

## Request flow

```
super-ralph / tau / agents
        │  OpenAI-compatible
        ▼
herd :25100 ── local model? ──▶ llama.cpp engines (ports 25001+)
        │  no → flock: key
        ▼
flock :25193 ── Strategy::Free ──▶ NIM → OpenRouter-free → …
        │        (model "free")      (free-tier external providers)
        ├── Strategy::Hybrid ──▶ Elo-ranked external providers
        └── provider=llama-swap ─▶ herd :25100 (local models via router)
```

## Ports

| Port | Service | Home |
|---|---|---|
| 25100 | herd (llama-swap fork, Go) | sovereign-projects/projects/herd |
| 25193 | flock router (Rust) | toxicwind/flock → /home/toxic/projects/flock |
| 25104 | sovereign TS router (bench/Elo layer) | sovereign-projects |
| 25109 | keypool sidecar | sovereign-projects |

## Rules

1. **herd is local.** It lives in the monorepo. No separate fork repo.
2. **flock is external.** Own repo, own cadence; NIM/OpenRouter/Groq live here.
3. **Strategy names route; they are not models.** `free`, `hybrid`, etc. select
   flock strategies. Nothing advertises a literal model named `free`.
4. **NIM is a first-class free endpoint**, not something to bypass.
5. **No monkeypatches.** Fixes land in the owning repo.

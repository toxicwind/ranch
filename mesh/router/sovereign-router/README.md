# sovereign-router

> **SUPERSEDED 2026-10-02 — STILL SERVING ON :25104.** cuttinggate on `:25200` is the canonical live router. The `:25104` port was marked retired (this directory's `pitchfork.d/sovereign-router.toml.retired-20261002`), but `[daemons.sovereign-router]` in `estate/pitchfork.toml` still sets `auto = ["start"]` — `bun router.ts` is bound to :25104 and `/health` answers 200 (verified 2026-10-02). This directory is preserved for reference.

The TypeScript multi-provider LLM router (Bun): strategy-based failover, circuit breakers, sticky sessions, and a WAL health DB behind one OpenAI-compatible endpoint.

## What's here

- [ROUTER.md](ROUTER.md) — the full v3.2 documentation, as the router last ran.
- `sovereign-router-ts/` — the Bun/TypeScript implementation (router, strategies, `/ui` dashboard).
- `probes/` — probe results (see `probes/RESULTS-2026-09-21.md`).
- `pitchfork.d/` — the renamed daemon stanza (`*.retired-20261002`); the stanza that actually composes the daemon is `[daemons.sovereign-router]` in `estate/pitchfork.toml`.

## Where it went

- **Live replacement:** cuttinggate (`mesh/proxy/cuttinggate/`, `:25200`) — same strategy DNA, new home.
- **Strategy layer:** vendored into cuttinggate's `src/strategy/`.
- **Provider data:** the router's `PROVIDERS` table was reconciled into `mesh/catalog/` (`@ranch/roost`), the estate's provider SSOT.
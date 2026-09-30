# 🤠 tack — `@ranch/tack`

> *Every ranch has a **tack room** — where the saddles, bridles, and gear are
> kept, oiled, and ready. You don't ride the whole range; you walk into the
> tack room and pick your gear for the day's work. This package is the
> estate's tack room: the master provider catalog every router, agent, and
> daemon gears up from.*

**Single source of truth** for LLM providers across the ranch and the
sovereign estate:

- **Provider definitions** — base URL, key env var, and the endpoint-shape
  adapter that reads each provider's `/models` listing.
- **Live discovery** — fetch `/models` across all known endpoint shapes
  (OpenAI, Google v1beta native, Mistral native, static, declared-none).
- **Alias map** — friendly names → canonical model ids (the UX layer).
- **Curated seeds** — cold-start data only; inert after first discovery.
- **Auto-quarantine** — serve-time 404 or vanished-from-live-listing across
  2 consecutive successful refreshes → quarantined, never served, always
  observable. Re-listing re-admits automatically.

## Why this exists

Every consumer used to hand-maintain its own provider→models list
(`PROVIDER_MODELS` in the router, hardcoded tables in herd's Go, KDL entries
in tau, model lists in Python research scripts). Live discovery could only
*add* — nothing ever removed a dead id. Result: 4 of 6 groq ids 404'd in
production until a human noticed. This package makes the **live listing the
source of truth** and demotes curation to cold-start seeds.

One tack room. Every consumer gears up from it; nobody keeps a private
saddle. When a provider kills a model, the whole estate learns it within two
refreshes — no human in the loop.

## Who gears up here

| Consumer | How it consumes | Status |
|---|---|---|
| **tau** (`ranch/tau`, `toxicwind/tau`) | Main-class provider system — replaces `pi-catalog`'s KDL provider entries, `provider-models` data, and discovery | THE provider authority for the coding-agent engine |
| **herd** (Go, `ranch/herd`) | `internal/astmatrix/providers_generated.go` — generated, checked in, never hand-edited; `live_catalog.go` reads the live-catalog export | Provenance `@ranch/tack` |
| **sovereign-router** (TS) | Direct Bun import of `tack/src/index.ts` | Same-filesystem import |
| **flock** (Rust) | Via herd's serving sets / router config | Indirect |
| Python research scripts | `generated/providers.json` — canonical data artifact | Stable schema `ranch-tack/v1` |

The rule: **if it names a provider or a model id, it reads the tack room.**
Hand-maintained provider/model inventories are a bug — file it as one.

## Layout

```
src/
  types.ts      core types (ProviderDef, adapters, quarantine, persisted state)
  adapters.ts   one parser per /models wire shape (openai, google-v1beta, mistral, static, none)
  discovery.ts  fetch + parse with timeout; failures never cached, never acted on
  catalog.ts    ModelCatalog — serving sets, miss counters, quarantine, persistence,
                live-catalog export (contract ranch-tack/live-catalog/v1)
  data.ts       THE source of truth: provider defs, seeds, aliases, dead ids
  codegen.ts    emits generated/providers.json + generated/providers.go
scripts/build.ts  `bun run build` — regenerates generated/
generated/
  providers.json  canonical data artifact (Python consumers), $schema ranch-tack/v1
  providers.go    drop-in Go data file for herd (package astmatrix)
tests/          adapter shapes, prune/quarantine paths, concurrency, artifact sync
```

## Serving contract

1. **Cold start**: seeds serve until the first successful discovery.
2. **After discovery**: the live listing owns membership. Seeds go inert.
3. **Well-formed empty listing** = zero models. Never fall back to stale data.
4. **Failed refresh** changes nothing (stale-serve); miss counters move only
   on *successful* refreshes.
5. **Missing once** keeps serving; missing **twice** in a row → quarantine
   (`vanished-from-live-listing`).
6. **Serve-time 404** → immediate quarantine (`serve-404`).
7. **Re-listing** re-admits automatically (except the permanent dead tier).
8. **Dead ids** (`DEAD_MODEL_IDS`, EOL notices) are never served, never
   re-admitted.

## Adding a provider

1. Add a `ProviderDef` to `src/data.ts` (pick the adapter matching its
   `/models` shape; add `seeds` for cold start).
2. `bun run build` — regenerates `generated/`.
3. `bun test` — the sync test fails if you forgot step 2.
4. Copy `generated/providers.go` over herd's
   `internal/astmatrix/providers_generated.go` (the test tells you the exact
   path when it's stale).

## Adding an endpoint shape

New odd provider = new adapter in `src/adapters.ts` (+ fixture tests in
`tests/adapters.test.ts`). Provider-specific branches never leak into
routing or catalog logic.

## Persistence

`ModelCatalog.saveToFile()` writes atomically (temp + fsync + rename) and
also emits the live-catalog export for non-TS consumers. `loadFromFile()`
understands both the v2 shape and the legacy router
`.state/live-models.json` v1 shape (`{ live, meta }`).

## Developing

```bash
bun test          # 61 tests — adapters, catalog, codegen, concurrency, data
bun run build     # regenerate generated/ from src/data.ts
```

Part of the [ranch](../README.md) monorepo (`toxicwind/ranch`), workspace
`tack`, package `@ranch/tack`.

## Build

The main build entry is `scripts/flicker-build.ts` — it submits the canonical
build+test (`bun run build && bun test`) as a job to the flicker build daemon (HTTP API, http://127.0.0.1:25148) and streams the result:

```sh
bun scripts/flicker-build.ts
```

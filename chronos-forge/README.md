# chronos-forge

A repo-scoped **Mixture-of-Experts agent backplane** with an endless,
proof-gated mutation loop.

It runs cycles that dispatch independent expert roles in parallel, route
exactly one winning mutation cluster per cycle, and never commit a change
without a proof command and a verbatim observed excerpt. Cross-platform:
POSIX and Windows.

## Why

Autonomous mutation loops fail in three predictable ways. This project is
built to make each one loud instead of silent:

| Failure mode | Guard here |
|---|---|
| A hung command freezes the loop forever | Hard 2000ms execution budget per call (`timeout.ts`) |
| A stale plan clobbers concurrent edits | Freshness re-check at the write boundary (`snapshot.ts`) |
| A change lands with no evidence | Mandatory proof gate: 1 command, 1 excerpt, 1 checkpoint |

## The loop

```
BOOTSTRAP → SNAPSHOT → (parallel experts) → SYNTH → APPLY → PROOF → CHECKPOINT → RECURSE
```

Exactly one cluster is applied per cycle. The loop repeats until an explicit
`done` flag is written.

## Install and verify

```bash
npm install
npm run verify
```

## Layout

```
src/chronos/
  event-frame.ts       framed stdout transport
  pseudoembedding.ts   content-addressable chunks (⟦PE:...⟧)
  hashing.ts           repo_hash / agent_id / run_id derivation
  state.ts             atomic per-repo state.json
  lock.ts              cross-platform advisory lock
  snapshot.ts          freshness guard (sha256 + mtime)
  cluster.ts           clusters, role specs, SYNTH scoring
  websift.ts           warning-triggered diagnostic pivot
  timeout.ts           2000ms execution budget
  cycle.ts             the loop
test/                  node:test suite
docs/                  architecture, transport, pseudoembeddings, getting started
```

## Docs

- [Architecture](docs/architecture.md) — modules, invariants, cross-platform notes
- [Event transport](docs/event-transport.md) — the framed line format
- [Pseudoembeddings](docs/pseudoembeddings.md) — pointers, not memories
- [Getting started](docs/getting-started.md) — install, verify, run a cycle

## Status

Early. The transport, chunk store, locking, freshness guard, budget, and
scoring are implemented and tested (23 tests). The expert panel currently
runs sequentially while preserving the structural independence rule; true
concurrent dispatch is tracked in the roadmap.

## License

MIT

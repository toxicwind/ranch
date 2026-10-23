# Changelog

All notable changes to the ranch. `main` is the supported line; entries are newest-first.

## 2026-09-30 — The flattening

First-class monorepo day. `stockyard/` and `remuda/` are gone; every animal lives at the root, one directory per component.

- **Real monorepo**: Bun workspaces + moon orchestration, toolchains pinned (bun 1.4.2, node 22.12, go 1.23.1, rust 1.89.0) — `952a9da`
- **corral absorbed in-tree**: super-ralph history preserved, submodule gitlink removed — `1f3739a`, `08edaca`
- **flock**: Tack renamed to **Roost**, nested as `flock/roost/` — the 52-provider master catalog (`@ranch/roost`) — `5d75050`, `d46b6e7`
- **flock**: `@flock/astmatrix` — Go-to-TypeScript live conversion of `herd/internal/astmatrix` — `d7201ad`
- **herd**: completed the partial HealthSnapshots feature (was uncompilable) — `d0e563d`
- **squawk/ui**: API/WS URLs mount-point aware via APIBASE; fleet-ui `/squawk-feed` proxy prefixes — `aa88d8d`, `f25bbc1`
- **gatehouse**: registered rsync MCP server (`toxicwind/rsync-mcp`) — `219cc14`
- **spark**: manifests sharded a–d (629 files, 15.8MB reconciled) — `0522c71`
- Flicker build entries added across flock, oracle, squawk, rig, lasso — `bcbc00f`, `4aeea1e`, `27e570c`, `6e9350a`, `70307f0`

## 2026-09-29 — Squawk maximalization

- **Squawk maximalization** (`4295bb4`): WS reconnect replay, atomic crash-safe feed writes, since-based feed replay (50/response cap); fleet UI markdown renderer; hot-reload + bounded snapshots
- **Brand deprecated → Flicker**: brand consolidated into the flicker build daemon (`:25148`); flicker cutover verified live
- **yote-embed unwound**: on-box embeddings reverted, mistral restored as embedding provider — local compute is not the task path
- **guidellm → roundup**: renamed, own repo, moved into ranch via `git mv`

## 2026-09-28 and earlier

See `git log` — the full history is in-tree (no submodules, no vendored snapshots).

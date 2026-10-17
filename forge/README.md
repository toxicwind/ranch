<div align="center">

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)
[![ranch](https://img.shields.io/badge/ranch-forge-black?style=for-the-badge)](https://github.com/toxicwind/ranch)
[![Go](https://img.shields.io/badge/Go-1.23-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev)
[![Rust](https://img.shields.io/badge/Rust-orange?style=for-the-badge&logo=rust)](https://www.rust-lang.org)
[![port](https://img.shields.io/badge/port-25148-8F2?style=for-the-badge)](https://ranch.localhost)

</div>

# ⚒️ forge

**The estate's build daemon + remote-execution layer.** Deployments, CI jobs,
task caching, and remote builds all route through forge — one builder that
wraps [NativeLink (REAPI)](#-what-it-wraps), the woodpecker-CI fork, the
pattern-borrow engine, and the emergent research layer.

## 🧩 What it wraps

| Piece | Where | Port | Role |
|---|---|---|---|
| **NativeLink (REAPI)** | `barn/nativelink` | `:25155` / `:25157` | Remote Execution API + CAS (remote build cache/executor) |
| **forge build daemon** (`forge-server`) | `pitchfork estate/forge` + `estate/forge-agent` | `:25148` HTTP / `:25240` gRPC | The woodpecker-CI fork — jobs, queues, health |
| **woodpecker source** | `forge/woodpecker/` | — | The CI engine we fork for the daemon |
| **pattern-borrow** | `scripts/pattern-borrow.ts` | — | Borrow a proven pattern before solving |
| **emergent (research)** | `emergent/` | — | Paper-finder + prior-art ingestion |

## 🚀 Quick start

```bash
# A: bazel remote cache via nativelink REAPI
bazel build --remote_cache=grpc://127.0.0.1:25155 //...

# B: cacheable task via the forge daemon (mbx client on :25148)
mise run <task>
mise exec -- <cmd>        # ad-hoc; mise toolchain resolves

# C: prior-art / paper borrow
bun emergent/paper-borrow.ts query "tokenized job objects in CI caches"
```

## 🏗️ Live daemons

```bash
estate/forge         running   :25148 HTTP  (forge-server binary)
estate/forge-agent   running   :25240 gRPC  (forge-agent binary)
```

Health: `curl http://127.0.0.1:25148/api/health` → `{"ok":true, ...}`. *(The
internal `service` string still reads `flicker` in the running binary; it will
report `forge` after the next build from the swept `forge/woodpecker/`
source.)*
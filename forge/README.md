# forge

Public emergent builder for the estate.

## What it wraps

| Piece | Where | Port |
|-------|-------|------|
| NativeLink (REAPI) | barn/nativelink | :25155 / :25157 |
| forge build daemon (forge-server binary) | pitchfork estate/forge + estate/forge-agent | :25148 HTTP / :25240 gRPC |
| pattern-borrow | scripts/pattern-borrow.ts | - |
| emergent (research) | emergent/ | - |

## Quick start

bazel build --remote_cache=grpc://127.0.0.1:25155 //...
mise run task   # task cache via the forge daemon at :25148 (mbx client)
bun emergent/paper-borrow.ts query

## Name

forge is the public master name. Internal pieces keep their names.
This directory is the entrypoint people clone or follow.

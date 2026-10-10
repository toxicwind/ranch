# forge

Public emergent builder for the estate.

## What it wraps

| Piece | Where | Port |
|-------|-------|------|
| NativeLink (REAPI) | barn/nativelink | :25155 / :25157 |
| mbx-cache (mise) | vendored/mr-boxington-cache | :25148 |
| pattern-borrow | scripts/pattern-borrow.ts | - |
| emergent (research) | emergent/ | - |

## Quick start

bazel build --remote_cache=grpc://127.0.0.1:25155 //...
mise run task   # uses mbx at :25148
bun emergent/paper-borrow.ts query

## Name

forge is the public master name. Internal pieces keep their names.
This directory is the entrypoint people clone or follow.

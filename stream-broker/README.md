# stream-broker

> 🗺️ Part of [**the ranch**](https://github.com/toxicwind/ranch) — the whole inference estate, one map.

Socket fan-in for token streams on the mesh, supervised as
`sovereign-stream-broker` on `127.0.0.1:25215`.

> **This is a placeholder.** 57 lines in `src/index.ts`, no dependency beyond
> Node's `net`/`fs`/`path`, and the handler is a byte echo — the source says so
> itself: `// Echo back for now; in future could buffer tokens`. The topology,
> the env contract and the pitchfork unit are real and worth documenting. The
> data path is not.

---

## Today

Two listeners, one handler:

```
  clients ──┬── TCP    127.0.0.1:25215          (default)
            └── UNIX   /run/user/1000/sovereign-stream-broker.sock
```

The handler reads a chunk, writes the identical chunk back, and logs the peer on
connect, disconnect and error. Per connection it sets TCP keepalive at 30 s and
`TCP_NODELAY`. Startup `mkdir -p`s the socket's parent and unlinks a stale
socket file first, so a restart after an unclean exit binds cleanly. `SIGTERM`
closes the UNIX listener then the TCP listener and exits 0; `SIGINT` is not
handled.

Absent, and required before this is more than a scaffold: authentication,
framing, backpressure, per-client routing, any notion of a subscription.

---

## Configuration

| Var | Default | Meaning |
| :--- | :--- | :--- |
| `TCP_HOST` | `127.0.0.1` | TCP bind address |
| `TCP_PORT` | `25215` | TCP bind port |
| `SOCKET_PATH` | `/run/user/1000/sovereign-stream-broker.sock` | UNIX socket path |

Any process that can reach either socket gets its own bytes back.

---

## Run

| Command | Runs |
| :--- | :--- |
| `bun run start` | `bun run src/index.ts` |

`start` is the only script. No test, lint or build script; no lockfile.

---

## Daemon

```toml
[daemons.sovereign-stream-broker]
dir        = "/home/toxic/estate/projects/range/ranch/stream-broker"
run        = "exec bun run src/index.ts"
port       = 25215
ready_port = 25215
```

Readiness is a bare port check — there is no health endpoint because there is
no HTTP server. This is also the **last block in `pitchfork.toml`**, and unlike
its neighbours it sets no `retry`, no `health_http`, no `boot_start` and no
`auto = ["start"]`. It appears in none of the group `daemons = [...]` lists, so
it will not come up with the usual groups. Treat it as defined but not enrolled.

---

## The declared dependency

`package.json` declares `@sovereign/utils` as `workspace:*`, and
`src/index.ts` imports nothing from it — only `node:net`, `node:fs`,
`node:path`. The package itself lives at `packages/sovereign-utils/` in the
outer sovereign repo, and this directory carries no workspace manifest or
lockfile to resolve the protocol against, so `bun install` here has nothing to
resolve. It is declared-but-unused: drop it, or wire it up and add the
workspace — do not assume it works.

---

## See also

- [`pitchfork.toml`](/home/toxic/estate/pitchfork.toml) — the `sovereign-stream-broker` unit
- [`../herd/`](../herd/) — the local-model side of the same mesh

## Build

The main build entry is `scripts/flicker-build.ts` — it submits the canonical
build as a job to the flicker build daemon (HTTP API, http://127.0.0.1:25148) and streams the
result:

```sh
bun scripts/flicker-build.ts
```

The build is a compile check (`bun build src/index.ts`); there is no test suite
yet, and the declared `@sovereign/utils` workspace dependency does not resolve
(it is not in the ranch workspace list), so no install step runs.

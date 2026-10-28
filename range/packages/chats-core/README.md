# @ranch/chats-core

One truthful answer to "what is running right now": the live chats of Tau,
Kappa and Kimi, in a single shape, with every port and URL taken from the
generated surface registry.

The package never guesses. When a surface cannot be reached — the kappa
server is down, kimi-code is not installed, the tau session store is gone —
the list for that agent is **empty** and the health entry says
`unavailable` with the reason. Nothing is filled in, nothing is inferred from
a neighbour's state.

## Commands

```bash
# tests
./node_modules/.bin/vitest run

# types
./node_modules/.bin/tsc --noEmit

# live proof against this machine
node --experimental-strip-types src/sample.ts
```

The sample prints the surfaces, the health of each one and every chat it
found. The kappa server is Basic-auth protected, so the sample needs the
password in the environment:

```bash
KAPPA_SERVER_PASSWORD="$(secretsmith env | grep -oE 'KAPPA_SERVER_PASSWORD=.*' | cut -d= -f2-)" \
  node --experimental-strip-types src/sample.ts
```

Without it the kappa section degrades truthfully to `unavailable`.

## The shape

```ts
interface RunningChat {
  id: string // the agent's own session id
  agent: 'tau' | 'kappa' | 'kimi' | 'squawk'
  source: 'tau' | 'kappa' | 'kimi' | 'squawk' // the grouping key for the UI
  title: string
  status: 'live' | 'idle' | 'unavailable'
  updatedAt: string // ISO-8601
  startedAt: string | null
  projectPath?: string
  messageCount?: number // only when the agent reports it exactly
  webUrl?: string // the web UI of the surface this chat lives on
  deepLink?: string // only when the agent mints one
  surface: SurfaceRef // where the chat lives and how it authenticates
}
```

`webUrl` is the URL of the **surface**, not of the chat. A per-chat deep link
is attached only when the agent really provides one (Tau mints one per collab
host); it is never assembled by guesswork.

## The agents

| Agent | Source of truth                                                          | Degrades to empty when                                                      |
| ----- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Tau   | the session store `~/.tau/agent/sessions/<project>/<stamp>_<uuid>.jsonl` | the store is missing or unreadable                                          |
| Kappa | `GET /session` + `GET /session/status` on the kappa server               | the server is unreachable or refuses the credentials                        |
| Kimi  | `GET /api/v1/sessions` with the server bearer token                      | kimi-code is not installed (no `server.token`) or the server is unreachable |

The Tau adapter reads a small header out of each transcript instead of the
whole file: the estate's session store is tens of gigabytes. A transcript is
only read in full when it is small enough for the message count to be exact.

## Architecture

The adapters never import `node:fs`, `node:child_process` or the global
`fetch`. They take a `Runtime`:

```ts
interface Runtime {
  fs: FileSystemApi
  exec: ExecApi
  fetch: FetchApi
  env: Record<string, string | undefined>
  now: () => number
}
```

That keeps the core browser-safe — the control-plane SPA can import the types
and the registry loader — and makes every adapter testable with the fake
runtime in `src/testing/fake-runtime.ts`. The Node implementation lives in
`src/node.ts` and is exported as `@ranch/chats-core/node`.

## The surface registry

`src/surfaces.ts` is the loader. It reads the **generated** manifest of
`@ranch/surface-registry` (itself derived from `config/ports.env`,
`pitchfork.d/*.toml` and `mise.toml`) and exposes typed accessors:

```ts
const kappa = surfaceForAgent('kappa')
kappa?.port // 25159 — from the SSOT, never from this package
kappa?.baseUrl // http://127.0.0.1:25159
kappa?.webUrl // http://127.0.0.1:25159/console
```

An agent can own more than one surface — Tau has the collab web UI _and_ the
local ACP chute. `primarySurfaceForAgent(agent)` picks the one a chat can
actually be looked at (the web UI), falling back to the agent's first
surface.

There is no port literal anywhere in this package's source; a test enforces
that (`src/no-hardcoded-ports.test.ts`).

The manifest is imported by relative path
(`../../surface-registry/src/generated/surfaces.ts`), so the two packages can
never disagree about a port and no build step is needed between them. That
also means `chats-core` has to live next to `surface-registry` — the
alternative, a published `@ranch/surface-registry` dependency, needs the
workspace install to have run first.

## Layout

| File                  | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `src/types.ts`        | the shared vocabulary                                            |
| `src/runtime.ts`      | the injectable capability surface                                |
| `src/surfaces.ts`     | the surface registry loader                                      |
| `src/agents/tau.ts`   | the Tau adapter (session store + collab hosts)                   |
| `src/agents/kappa.ts` | the Kappa adapter (`/session`, `/session/status`, `/api/health`) |
| `src/agents/kimi.ts`  | the Kimi adapter (`/api/v1/sessions`, bearer token)              |
| `src/aggregate.ts`    | merges every agent into one list, isolates failures              |
| `src/node.ts`         | the Node implementation of the runtime                           |
| `src/sample.ts`       | the live proof                                                   |

## Parent wiring (not applied here)

This package is self-contained and touches nothing outside its own directory.

1. Register it in the workspace (`packages/*` already matches) and let the
   workspace install link `@ranch/surface-registry`.
2. The control-plane server imports `@ranch/chats-core/node` and calls
   `aggregateChats({ runtime: nodeRuntime })`; the SPA imports only
   `@ranch/chats-core` for the types.
3. Inject `KAPPA_SERVER_PASSWORD` into the server process (the kappa adapter
   reads it from the environment at request time and never stores it).
4. The app's existing unified-chats data layer can keep its own shape — this
   package only has to agree on `RunningChat` and `source`.

# chats-gateway

One loopback gateway for the three agent web surfaces on this box — **tau**,
**kappa** and **kimi** — behind a single bearer token.

It replaces the `kimi-webui-staging` scratch prototype. The prototype's
base64 blob (`web.ts.b64`) is gone: the gateway here is plain, readable
source, and the prototype's test suite was promoted with it.

```
                    ┌──────────────────────────┐
  browser ────────▶ │  chats-gateway :25230    │
  (one token)       │                          │
                    │  /        landing page   │
                    │  /tau/    tau shell      │
                    │  /kappa/  kappa console  │──▶ 127.0.0.1:25159
                    │  /kimi/   kimi WebUI     │──▶ 127.0.0.1:25126
                    │  /health  health (open)  │
                    └──────────────────────────┘
```

## URL layout

| Route            | Agent | What it is                                                                |
| ---------------- | ----- | ------------------------------------------------------------------------- |
| `/`              | all   | Landing page: one tab per agent plus a live availability table            |
| `/tau/`          | tau   | Tau shell: collab-web next to the local collab registry                   |
| `/tau/api/hosts` | tau   | JSON list of live local collab hosts (`tau collab list --json`)           |
| `/kappa/`        | kappa | The Kappa Console, proxied from the kappa server                          |
| `/kappa/api/…`   | kappa | The kappa server's own API paths (`/session`, `/event`, …)                |
| `/kimi/`         | kimi  | The kimi WebUI, proxied from `kimi web`                                   |
| `/kimi/api/v1/…` | kimi  | The kimi REST + WebSocket namespace                                       |
| `/health`        | all   | Gateway health and per-surface state — **the only unauthenticated route** |

Every other path requires the bearer token, in either form:

```
Authorization: Bearer <CHATS_GATEWAY_TOKEN>
?token=<CHATS_GATEWAY_TOKEN>
```

The query form exists because a browser cannot attach a header to a
navigation or to a WebSocket handshake. A WebSocket may also carry the token
in the `kimi-code.bearer.<token>` subprotocol.

## Environment

Nothing is hardcoded. The gateway reads:

| Variable                            | Default                  | Meaning                                              |
| ----------------------------------- | ------------------------ | ---------------------------------------------------- |
| `CHATS_GATEWAY_PORT`                | `25230`                  | TCP port (`0` = let the OS pick)                     |
| `CHATS_GATEWAY_BIND`                | `127.0.0.1`              | Interface to bind                                    |
| `CHATS_GATEWAY_TOKEN`               | **required**             | The one bearer token that guards every route         |
| `CHATS_GATEWAY_UPSTREAM_TIMEOUT_MS` | `8000`                   | Per-request upstream budget                          |
| `CHATS_GATEWAY_PROBE_TIMEOUT_MS`    | `1500`                   | Per-probe budget for the reachability check          |
| `CHATS_GATEWAY_PROBE_TTL_MS`        | `5000`                   | How long a probe result is reused                    |
| `KIMI_CODE_URL`                     | `http://127.0.0.1:25126` | kimi web backend                                     |
| `KIMI_CODE_TOKEN`                   | —                        | Bearer token the kimi backend expects                |
| `KAPPA_ACP_URL`                     | `http://127.0.0.1:25159` | kappa server                                         |
| `KAPPA_SERVER_USERNAME`             | `kappa`                  | Basic-auth user                                      |
| `KAPPA_SERVER_PASSWORD`             | —                        | **Secret.** Basic-auth password for the kappa server |
| `TAU_COLLAB_URL`                    | —                        | collab-web client to embed in the tau tab            |
| `TAU_COLLAB_BIN`                    | —                        | `tau` binary, used for `tau collab list --json`      |

The gateway **refuses to start** without `CHATS_GATEWAY_TOKEN`.

## How upstream auth is handled

Two directions of trust meet at the gateway, and they are kept apart:

- **browser → gateway**: one token, accepted from the `Authorization` header
  or the query string, compared in constant time.
- **gateway → upstream**: the upstream's own credential, injected server-side.

The rules the code enforces:

1. The kappa password is read from the environment **at request time**
   (`envCredential('KAPPA_SERVER_PASSWORD')`), never copied into the config
   object, never written to a file, never logged. Inject it from the
   secretsmith keyring; see the daemon manifest in the parent task.
2. The caller's gateway token is **never forwarded** to an upstream that has
   not been configured to accept it. The gateway token is a credential of this
   service; handing it to a third party would leak it. When an upstream has
   no credential configured, the `Authorization` header is dropped and the
   upstream's own 401 is reported honestly.
3. `?token=` is stripped from the query before anything is proxied upstream.
4. On a WebSocket handshake the gateway echoes the subprotocol the _client_
   offered (so the browser's handshake completes) while presenting the
   _upstream's_ token to the upstream. The two never see the same value.
5. The gateway prints its routes on start-up but **never the token**.

## Honest degradation

If an upstream is down, that tab renders a page that names the surface, the
upstream it tried and what went wrong — HTTP 503, never a stack trace and
never a fake UI. The same state is reflected on the landing page and in
`/health`.

An upstream that answers 401 while the gateway holds no credential is
reported as a _missing credential_ with the name of the variable to set,
which is a different problem from an upstream that is down.

## Why the surfaces are mounted the way they are

The agent SPAs are built with root-absolute URLs, and not the same way:

- the **Kappa Console** is built with `KAPPA_CONSOLE_BASE=/console`, so it
  asks for `/console/assets/…` and its router base is `/console`;
- the **kimi WebUI** is built with the vite default base `/`, so it asks for
  `/assets/…` and calls `/api/v1/…`.

Serving those under a prefix needs three things, all modelled in
`src/surfaces.ts`:

1. a **mount** that maps the gateway prefix onto the upstream's own path
   shape (`/kappa` → `/console`),
2. a **mount** for the API namespace the SPA talks to (`/kappa/api` → the
   kappa server's root paths),
3. **response rewrites** that re-point the SPA's root-absolute URLs at the
   gateway prefix (`/console` → `/kappa`, `/api/v1` → `/kimi/api/v1`).

When a rewrite changes an inline script, the page's
`Content-Security-Policy` hash is recomputed — otherwise the browser blocks
the very script the page needs. Both are covered by tests.

## Running it

```bash
# development
CHATS_GATEWAY_TOKEN=$(openssl rand -base64 32) bun run start

# the mock upstream, for a look around without a live agent
bun src/mock-backend.ts --port 58628
```

## Tests

```bash
bun test          # 76 tests
bunx tsc --noEmit # typecheck
```

The suite covers the token gate, the three tabs, the WebSocket relay for
both a bearer upstream (kimi) and a Basic-auth upstream (kappa), the
Content-Security-Policy recomputation, the honest degradation of a dead
upstream, and the secret-hygiene rules above. `src/mock-backend.ts` is the
reusable mock upstream — the tests never need a live kimi, kappa or tau.

## A note on the surface registry

This package is self-contained: it describes its own surfaces in
`src/surfaces.ts`. If a shared surface registry lands later, the surfaces
can be sourced from it without changing the proxy — the registry only has to
describe a surface (origin, mounts, auth mode, path rewrites) and the proxy
does the rest. Everything the gateway needs is already behind environment
variables, so an external registry can be wired in as a configuration
source rather than a code change.

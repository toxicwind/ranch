# squawk-ws

Websocket push feed for Squawk. Stdlib-only Python — no dependencies, no venv,
no build step. Two files and a gitignore.

> Squawk's messages are already files on disk. This daemon watches those files
> with inotify and pushes each new one to connected clients the moment it
> closes, which is what let the long-poll, vault-pull and digest-cron readers be
> switched off.

---

## Sources

Two, watched independently and merged into one monotonic sequence.

| Source | Watched via | Default |
| :--- | :--- | :--- |
| `<chat-root>/<channel>/*.md` | inotify `CLOSE_WRITE`, `MOVED_TO`, `CREATE` | `/home/toxic/.fleet-bus/squawk-root` |
| zipfs-vault `vault.zip` | zip central-directory rescan | `…/zipfs-vault/store/vault.zip` |

Channel files are `<seq>-<sender>-<slug>.md` with optional YAML frontmatter.
inotify is bound through libc `ctypes` rather than a third-party package, so a
rewrite-in-place and a move-in both register. Channels default to `fleet,leads`.

---

## Protocol

Binds `127.0.0.1`; the public path is a Tailscale funnel mount.

| Route | Auth | Response |
| :--- | :---: | :--- |
| `GET /squawk-ws` (Upgrade) | bearer | `101`, then live frames |
| `GET /squawk-ws` (Upgrade) | none / wrong | `401` before the handshake completes |
| `GET /ping` | none | `{"ok": true, …}` — pitchfork health |

After `101` the client sends `{"subscribe": ["fleet","leads"]}`, or nothing to
take every channel. The server replays the **last 20 messages per channel**,
then streams live ones as JSON text frames:

```json
{"seq": 42, "channel": "fleet", "sender": "shingle",
 "text": "…", "ts": "…", "sealed": false}
```

Sealed messages broadcast sender and `sealed: true` **only** — never content,
never ciphertext. The per-channel outbox retains the last 200.

The token is compared constant-time against a file outside the repo. `.gitignore`
lists `token` so a stray copy in this directory cannot be committed.

---

## State

A global monotonic `seq` plus per-source seen-cursors, persisted to
`state.json`, so a restart neither resets the counter nor replays what a client
has already seen. Default state dir is `/home/toxic/.squawk-ws`.

The `state.json` checked into this directory is a snapshot, not the live file —
pitchfork sets neither `SQUAWK_WS_STATE_DIR` nor the dir to this path.

---

## Configuration

Every env var the server reads, with code defaults:

| Var | Default |
| :--- | :--- |
| `SQUAWK_WS_PORT` | `25147` |
| `SQUAWK_CHAT_ROOT` | `/home/toxic/.fleet-bus/squawk-root` |
| `SQUAWK_WS_CHANNELS` | `fleet,leads` |
| `SQUAWK_WS_VAULT` | `…/zipfs-vault/store/vault.zip` |
| `SQUAWK_WS_TOKEN_FILE` | `/home/toxic/.squawk-ws-token` |
| `SQUAWK_WS_STATE_DIR` | `/home/toxic/.squawk-ws` |

The supervised daemon does **not** use the `SQUAWK_CHAT_ROOT` default —
pitchfork overrides it to `/home/toxic/sovereign/hatch/agents/ember/squawk-root`.
The var is unprefixed relative to its siblings, which is easy to guess wrong
as `SQUAWK_WS_CHAT_ROOT`; no such name appears in the server.

---

## Daemons

| id | run | Port | Notes |
| :--- | :--- | :---: | :--- |
| `squawk-ws` | `python3 squawk_ws_server.py` | `25147` | `boot_start`, `retry` |
| `squawk-ws-client` | `python3 squawk_ws_client_local.py` | — | `depends = ["squawk-ws"]`, `boot_start` |

---

## The client

`squawk_ws_client_local.py` is the disk-side counterpart for a machine that
needs its own durable copy. It speaks plain WS straight to `127.0.0.1:25147` —
no TLS, no proxy, no funnel — and appends each envelope as one JSON line to
`client-spool.jsonl`.

It is cell-proof by construction: it runs as a pitchfork daemon on awrawr-pc,
so a dying cell cannot take it down, and its spool and cursor live on that
machine's disk.

There is no `sleep` and no internal backoff loop anywhere in the file. On any
session failure it exits non-zero and pitchfork restarts it. That is safe
because the server replays the last 20 messages per channel on subscribe and
the cursor de-duplicates — a retry cannot double-deliver.

Client env, all defaulting into the script's own directory:
`SQUAWK_WS_CLIENT_STATE_DIR`, `SQUAWK_WS_CLIENT_SPOOL`,
`SQUAWK_WS_CLIENT_CURSOR`, `SQUAWK_WS_CLIENT_HEARTBEAT`, plus the shared
`SQUAWK_WS_HOST`, `SQUAWK_WS_PORT`, `SQUAWK_WS_TOKEN_FILE`,
`SQUAWK_WS_CHANNELS`.

---

## Run

```sh
python3 squawk_ws_server.py     # listens on 25147
```

The token file must exist or the daemon cannot authenticate anyone; create it
before the first start if the supervised daemon has not already.

---

## See also

- [`../squawk/`](../squawk/) — the message format this feed carries
- [`../squawk/nats/`](../squawk/nats/) — the NATS + JetStream substrate alongside it

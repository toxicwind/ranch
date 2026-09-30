# flock

Pointer directory. The implementation lives in an external repo; nothing is
vendored here and this file is the whole of the directory.

> **flock is EXTERNAL.** The ranch holds herd and delegates. Cloud providers —
> NVIDIA NIM, OpenRouter, Groq, Cerebras — are routed by a daemon this tree
> does not own, checked out separately and built into `~/.flock/`.

---

## Where it actually lives

| | |
| :--- | :--- |
| Source of truth | `/home/toxic/projects/flock` |
| Upstream repo | [`toxicwind/flock`](https://github.com/toxicwind/flock) |
| Installed binary | `~/.flock/flock` — Rust, ~8.7 MB stripped ELF |
| Data dir | `~/.flock-data` |
| Port | `127.0.0.1:25193` |
| Health | `GET /health` |
| This directory | pointer only — `remuda/flock/` has no code |

One merged tree (2026-09-17), renamed in full from what had been eight
scattered NIM projects; previously `nim-proxy`. The part that runs as a daemon
is `proxy/` — a rate-limit-aware, multi-key load-balancing proxy in front of
`integrate.api.nvidia.com`, OpenAI-compatible, with a dashboard and a history
store. Upstream provenance is
[miztertea/nim-proxy](https://github.com/miztertea/nim-proxy) (MIT).

What flock is *for*: herd's cloud-API completions scaffold, the maximal NVIDIA
NIM plugin. Herd's sky counterpart — APIs, not local models. One provider
registry lives in flock; herd's former `astmatrix` copy is retired.

---

## The supervised instance

```toml
[daemons.flock]
run  = "exec env HOST=127.0.0.1 PORT=${FLOCK_PORT} DATA_DIR=/home/toxic/.flock-data /home/toxic/.flock/flock"
port = 25193
ready_http  = "http://127.0.0.1:25193/health"
health_http = { url = "http://127.0.0.1:25193/health", interval = "30s", timeout = "5s", retries = 3 }
retry = true
```

pitchfork supervises the *installed binary*, not the repo checkout — rebuild
and reinstall, do not expect a `git pull` in `/home/toxic/projects/flock` to
change the running daemon. The upstream installer is `flock-final.sh` in that
repo: it builds to `~/.flock/flock`, sets up `~/.flock-data`, and is
non-destructive by design (never deletes data, keys or configs). `--dry-run`
prints what it would do. A client key comes from `FLOCK_KEY` in the environment
when run non-interactively; the script never echoes it.

---

## Three things named flock

Worth separating before you debug across trees — the names collide.

| Sense | Where | Status |
| :--- | :--- | :--- |
| **The daemon** | `~/projects/flock` → `~/.flock/flock`, pitchfork `flock` | **live**, `:25193` |
| herd's in-process router | `stockyard/herd/internal/flock/`, `stockyard/herd/mesh/gateway/flock.go` | **retired 2026-09-17** |
| This pointer | `remuda/flock/` | docs only |

The second is the trap. `stockyard/herd/README_FLOCK_V2.md` documents a
substantial Go router — circuit breakers, request coalescing, an SQLite health
DB, eight routing strategies — and opens by saying it is **retired**: it is not
compiled into the shipped binary, the server answers `404` on `/flock/status`
and `/flock/metrics`, and the `astMatrix:` config block is ignored. Cloud
routing is delegation to the external daemon instead. The package is kept
tree-only for reference.

Note also that the retired herd docs and flock's own installer both assume
port **:8000**, while the unit pitchfork actually supervises binds **:25193**.
Use the pitchfork value. (The installer's `PITCHFORK_TOML` path also still
points at `~/projects/sovereign-projects/pitchfork.toml`, not today's
`~/sovereign/pitchfork.toml`.)

---

## Not to be confused with

- **herd** — the local-model side. On-box inference, OpenAI-compatible `:25100`.
  Herd delegates anything cloud to flock and lists flock's models in
  `/v1/models` under a `flock:` prefix.
- **gatehouse** — the MCP gateway on `:25127`. Unrelated to model routing.
- `flock(2)` — the Linux advisory-lock syscall, which also appears in prose
  about this directory and in unrelated shell scripts.

---

## See also

- [`../herd/docs/flock/`](../herd/docs/flock/) — herd-side overview, architecture, integration, runbook
- [`../herd/README_FLOCK_V2.md`](../herd/README_FLOCK_V2.md) — the retired in-process router
- `/home/toxic/projects/flock` — the source of truth

To change flock, change `/home/toxic/projects/flock` and reinstall. Edits here
are overwritten by the next consolidation.

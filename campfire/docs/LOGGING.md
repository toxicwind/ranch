# 📋 Campfire Logging Brief

**Audited:** 2026-09-30 by LogSleuth (ember's pack)
**Question:** Do the provider agents have the same awesome logs that herd has?
**Verdict: NO.** (flock = partially, the rest = no)

## What makes herd's logging awesome

Herd (Go) rolls its own — `internal/logmon/logging.go` + `internal/server/log.go`:

- **Leveled, configurable:** `DEBUG/INFO/WARN/ERROR`, runtime-filterable,
  config-driven (`logLevel`, `logTimeFormat`, `logToStdout`)
- **Three named monitors:** `proxylog`, `upstreamlog`, `muxlog`
- **One access line per request:** `Request <IP> "<METHOD> <PATH>" <status>
  <bytes> "<UA>" <duration>` — skips health/metrics paths, first-write-wins
  status, distinguishes client-hangup from server-cancel
- **Queryable history + live tail:** 100KB circular buffer, `/logs` and
  `/logs/stream` (SSE), non-blocking writes with drop markers
- **Honest limitation:** no request IDs/spans — traceability comes from the
  access log, not correlation IDs

## Per-component audit

| Component | Structured? | Levels? | Request tracing? | Verdict |
|---|---|---|---|---|
| `herd` core | Custom `[LEVEL]` format | Yes (`logLevel`) | Access line; no request IDs | ✅ baseline |
| `flock/proxy` (Rust) | Yes (`tracing` k/v) | Yes (`RUST_LOG`) | No spans, no IDs, successes silent | ⚠️ Partial |
| `herd/internal/freeproxy` | **No — zero log calls in 803 lines** | No | No | ❌ None |
| `stream-broker` (Bun) | No (`console.log`) | No | No | ❌ None |
| `squawk-ws` (Python) | No (14 ad-hoc `print()`) | No | No | ❌ None |

**Biggest gap:** herd's own free-tier providers (`freeproxy/`) log literally
nothing. Upstream failures just `return err` silently — no provider ID, no
status, no cache hit/miss, no rate-limit visibility.

## The minimum bar (all five, every component)

1. **Leveled logging, runtime-configurable.** No bare `print`/`console.log` in prod.
2. **Structured fields.** `provider=`, `model=`, `status=`, `lane=` — not prose.
3. **One completion line per request.** Method, provider+model, status, bytes,
   duration. (Herd's access-log contract.)
4. **Request traceability.** Correlation ID across hops, on every line.
5. **No silent errors + readable cold-start.** Every `return err` gets a
   `WARN`/`ERROR` with context. Never log secrets.

## What this means for Campfire

Campfire follows the bar from day one:

- **Leveled:** `DEBUG/INFO/WARN/ERROR`, `LOG_LEVEL` env, default `info`
- **Structured:** `[campfire] [LEVEL] event key=value ...` on every line
- **Completion lines:** every post attempt logs `via=`, `channel=`, outcome
- **No silent failures:** spool-on-failure is logged, not swallowed
- **Cold-start readable:** startup logs config summary, backfill count,
  watcher state

See [campfire.toml](../campfire.toml) `[logging]` and the `[campfire]`
prefix convention in [src/](../src/).

## Fix list (for the estate, not Campfire)

Per-component minimal fixes from the audit (<60 lines each):

- **`freeproxy`** (~50 lines): pass `*logmon.Monitor` into providers; log
  dispatch, upstream non-2xx, rate-limit waits, transport failures
- **`flock/proxy`** (~40 lines): request-ID middleware + one completion
  `tracing::info!` per request
- **`stream-broker`** (~30 lines): leveled logger replacing `console.*`
- **`squawk-ws`** (~20 lines): `print()` → `logging` module with levels

**Don't touch:** herd core's logmon — it's the reference implementation.

---

*Full audit: `/tmp/campfire-research/logging.md` (LogSleuth's raw findings)*

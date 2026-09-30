# Brand fork research — upstream project to replace `brandd.py`

**Date:** 2026-09-30 · **Researcher:** Brass (Ember's crew) · **Status:** recommendation only — no fork created, awaiting Chris's go.

## Context

`brandd.py` (~500 lines, stdlib Python, polling) is the fleet's build-job daemon: disk-backed job queue (`queue/` → `active/` → `results/`), builds run through the login shell (`bash -lc`, so mise toolchains resolve), per-job log streaming, content-hash artifact caching (`artifacts/<jobhash>/`), a job ledger (`state.json`), and a health endpoint (`:25148/health`). It works, but Chris's verdict is "crap buildsrv" — the task is to find a **real upstream project to fork** under `toxicwind/`, in Go or Rust, that replaces the Python daemon over time.

**Hard requirements for the candidate:** self-hosted; lightweight (single binary or small deploy, not a k8s operator); actively maintained (commits within ~3 months); permissive license (Apache-2.0/MIT/BSD); Go or Rust preferred; covers job queue + workers + artifact caching + status UI/API.

## Method

1. **Bridge sweep first** (`ffs` across `/home/toxic/sovereign`, plus `$PATH`): searched "build queue", "job queue", "artifact cache", "build daemon", "build server", "task runner" — **nothing on the bridge does this job**, and no build tools (woodpecker/laminar/buildbot/drone/concourse) are installed. Nothing to borrow; proceed to fork.
2. **GitHub-wide ranked recon** — GitHub API for license / last-push / stars / language on 14 candidates (recency + relevance ranked over star count).
3. **Code-layout verification** — shallow clones (`--depth 1 --filter=blob:none`) of woodpecker, hatchet, windmill on yote; read the actual backend, API, and compose files rather than trusting READMEs.

## Ranked shortlist

### 1. `woodpecker-ci/woodpecker` — RECOMMENDED FORK

**What it is:** Go CI system (the active community fork of Drone). Apache-2.0. ~7.9k stars. Pushed **2026-09-30** (today). 814 Go files. Architecture: `server` + `agent` + `cli`, `pipeline/` engine with a pluggable backend interface (`StartStep`/`WaitStep`/`TailStep`/`DestroyStep`), `rpc/` between server and agent, `server/api/` (gin REST) + web UI.

**Why it fits (verified in code, not the README):**
- **Local exec backend is first-class:** `pipeline/backend/local/` (13 files: `local.go`, `command.go`, `clone.go`, `plugin.go`, …) runs pipeline steps as plain OS processes — `exec.Command(shell, "-c", script)` with the shell configurable (`bash`/`zsh`/`sh` via `LookPath`). The agent binary compiles in docker + kubernetes + local backends and the backend is selectable. **No Docker required** — this is the single fact that makes Woodpecker viable where every other CI system fails our "runs on the box" need.
- **SQLite datastore:** `server/store/datastore/init_cgo.go` declares `DriverSqlite = "sqlite3"` alongside mysql/postgres. Deploy = server binary + agent binary + one SQLite file. No Postgres, no Redis, no Docker.
- **Programmatic API:** `POST /repos/{repo_id}/pipelines` (`CreatePipeline`, "Trigger a manual pipeline"), `GET` pipeline status, `GET /logs/{pipeline}/{step}/download` — log streaming is built into the backend interface (`TailStep`).
- **Activity:** commits landing today; 391 open issues (living project, not abandonware).

**Gaps and the fork-and-adapt sketch (all concrete):**
1. **No content-hash artifact cache.** Woodpecker has cache *plugins* (S3-style), not content-addressed caching. `brandd.py`'s cache is ~100 lines — port it as a backend-local cache dir keyed by step-input hash, or as a first-class pipeline cache. Small, well-scoped.
2. **Forge-centric job model.** `CreatePipeline` requires a forge repo and calls `Forge.BranchHead()` — our jobs are agent-submitted arbitrary commands, not git pushes. Fork work: add `POST /api/jobs` accepting a raw YAML/JSON job spec and constructing the pipeline directly. `pipeline.Create()` is already decoupled from the forge fetch, so this is a thin new endpoint, not surgery.
3. **Login shell.** The local backend runs `shell -c`, not `bash -lc` — mise toolchains won't resolve. One-line fork patch: allow a configured login-shell invocation.
4. **Strip list:** forge integrations (GitHub/Gitea/GitLab/Bitbucket), docker + kubernetes backends, multi-user/org management, cron, secrets UI. Keep: server (SQLite), agent (local backend only), YAML pipeline frontend, web UI, REST API.
5. **Migrate:** pitchfork daemons (`brand-server`, `brand-agent`), keep the `:25148` health contract during cutover, then retire `brandd.py`. Carry the ranch western voice into the fork's README.

**Effort estimate:** medium — roughly 2–4 weeks for strip + job API + cache port + pitchfork wiring. The codebase is navigable (clean package layout, documented backend interface).

### 2. `hatchet-dev/hatchet` — best queue engine, wrong weight class

**What it is:** Go durable task queue / background-job engine. **MIT.** ~8k stars. Pushed 2026-09-29. Queues, workers, retries, timeouts, cron, dashboard UI, REST + gRPC. `hatchet-lite` single binary exists.

**Why it's #2, not #1:** the self-hosted deploy needs **Postgres + RabbitMQ (+ pgBouncer, NATS)** per its compose files — four infra services for a single-box build daemon. And it's a *generic* task queue: zero build semantics. We'd be writing the entire build layer (shell execution, per-step log streaming, artifact cache) on top of it — at which point we're building brandd on Hatchet, not forking a build system. Great engine, wrong domain and wrong weight.

### 3. `moonrepo/moon` — best cache substrate, not a daemon

**What it is:** Rust monorepo task runner. MIT. ~4.1k stars. Pushed 2026-09-28. Task graph + **content-hash-based caching** (local + remote) + file watching.

**Why it's #3:** the caching model is philosophically the closest to `brandd` (hash task inputs → skip on hit), and it's Rust and active. But it's a **CLI task orchestrator, not a daemon** — no job-queue server, no HTTP API for agents to submit jobs, no worker pool, no log-streaming server. Forking it into a queue daemon means building the entire server half. (`vercel/turborepo`, MIT, Go/Rust, 31k stars, is the same category with the same gap.)

**Verdict:** borrow its hashing ideas for the Woodpecker cache port; don't fork it as the daemon.

## Rejected candidates (with concrete reasons)

| Candidate | Reason |
|---|---|
| `buildbot/buildbot` | **GPL-2.0** (not permissive), Python (violates Go/Rust-first), Twisted-era heavyweight |
| `ohwgiles/laminar` | **GPL-3.0**, C++ — tiny and elegant, wrong license and language |
| `agola-io/agola` | Apache-2.0, Go — but **last push 2025-09-24** (stale > 1 year) |
| `windmill-labs/windmill` | 10,599 files (monorepo, huge); **dual Apache-2.0/AGPL-3.0** ("variously licensed" — AGPL parts are a fork hazard); needs Postgres |
| `go-vela/*` | Apache-2.0, Go, active — but **multi-repo** (server/worker/ui/cli/sdk split across repos); forking means forking 5+ repos and keeping them in sync |
| `evergreen-ci/evergreen` | GitHub license **NOASSERTION** (couldn't verify permissive); needs MongoDB; MongoDB's internal CI, opinionated |
| `dagger/dagger` | Apache-2.0, Go, active — but **container-based** (needs Docker), no persistent queue daemon |
| `buildbuddy-io/buildbuddy` | GitHub license **NOASSERTION** (couldn't verify); Bazel-RE-protocol-specific (our jobs are arbitrary shell, not Bazel actions) |
| `buildbarn/*` | Bazel remote-execution specific, multi-component |
| `drone/drone` | Superseded by Woodpecker (its active community fork) — evaluate the fork, not the ancestor |
| `concourse/concourse` | Apache-2.0, Go — but distributed (ATC/TSA/workers/Postgres), heavyweight |
| `jenkins`, `gocd`, `rundeck` | Java, heavyweight |
| `gitlab-runner`, `buildkite/agent`, `cirrus-ci-agent` | Permissive agent licenses, but all require their vendor's SaaS control plane |

## Borrow list (don't fork — steal the patterns)

- **`mozilla/sccache`** (Apache-2.0, Rust, pushed 2026-09-29, 7.7k stars): compiler cache with S3/Redis/memcached backends — borrow its cache-key construction and storage-layering ideas for the artifact-cache port.
- **`moonrepo/moon` input hashing:** hash (command + env + input file hashes) → content-addressed skip. This is the exact semantic `brandd` already implements; keep it.
- **NATS object store** (already running on yote, `:4222`/`:4223`): a viable artifact blob store if the cache outgrows the filesystem.

## Recommendation

**Fork `woodpecker-ci/woodpecker` → `toxicwind/brand`** (final repo name is Chris's call; `toxicwind/woodpecker` also fine). It is the only candidate that is simultaneously Go, Apache-2.0, under active development, deployable as two binaries + SQLite with no Docker and no Postgres, runnable on the bare box via its first-class local backend, and API-driven. The adapt work is bounded and concrete: strip forges + container backends, add a direct job-submission endpoint, patch the shell invocation to login-shell, port the ~100-line content-hash cache.

**No fork has been created.** Awaiting Chris's go.

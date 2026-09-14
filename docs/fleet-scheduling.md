# Fleet scheduling in Rig — audit, verdict, cutover plan

Date: 2026-09-14. Author: scheduling worker (Agent 2 side).

## 1. How fleet scheduling works today

**Muse runtime cron.d (sandbox side):**
- `fleet-snapshot-5m` — every 5m. Queries the Muse agent ledger (`agent.subagent_spawns`
  via muse.db), composes a compact digest, delivers to the side chat. THE monkey patch.
- `heartbeat` — every 30m, HEARTBEAT.md checklist (system).
- `agentic-feature-tour` — daily 10:08 America/Denver (user).
- `deterministic-doctor` — hourly (system). `feed-pulse-00..23` — 24 hourly (system).
  `profile-image` — weekly (system). `service-restart-watchdog` — 15m (system).

**awrawr-pc timers:**
- OS-owned (do NOT touch): snapper-cleanup, systemd-tmpfiles-clean, shadow,
  plocate-updatedb, logrotate, man-db, archlinux-keyring-wkd-sync,
  cachyos-rate-mirrors, fstrim. No cron daemon installed — timers are the only mechanism.
- Ours (candidates to move): `awrawr-mcp-audit-export.timer` (user, daily 00:00 —
  compacts bridge audit JSONL → parquet), `hw-audit.timer` (system, nightly ~03:17).

## 2. Rig's scheduling primitive — YES, it exists and works

`crates/openfang-kernel/src/cron.rs` — `CronScheduler`: jobs in a DashMap,
persisted to `<home>/cron_jobs.json`, kernel tick loop (`kernel.rs`, every 15s)
calls `due_jobs()` → `cron_run_job()`. Auto-disable after 5 consecutive failures.

`crates/openfang-types/src/scheduler.rs`:
- Schedules: `At { at }`, `Every { every_secs: 60..=86400 }`,
  `Cron { expr /* 5-field */, tz }`.
- Actions: `SystemEvent { text }` (no agent needed), `AgentTurn { message,
  model_override, timeout_secs }`, `WorkflowRun { workflow_id, input, timeout_secs }`.
- Delivery: `None`, `Channel`, `LastChannel`, `Webhook`, plus fan-out
  `CronDeliveryTarget::{Channel, Webhook, LocalFile { path, append }, Email}`.
  `LocalFile` append is the fleet-channel sink
  (`/home/toxic/.shingle/directives.md`).

Management: `openfang cron list|create|delete|enable|disable`, REST
`GET/POST /api/cron/jobs`, `DELETE /api/cron/jobs/{id}` on the daemon
(`http://127.0.0.1:25203`, see `~/.openfang/daemon.json`).

**Proven live 2026-09-14:** registered canary job `fleet-sched-canary`
(`e341caa3-…`, `Every { 60s }`, `SystemEvent`) against the production daemon;
observed `last_run` advance and `Cron job completed successfully` in the tick
loop across consecutive windows. Scheduling plane: first-class, no monkey patch.

## 3. Verdict on the fleet-snapshot-5m cutover

The scheduler is ready. The snapshot is NOT cut over yet — blocked on two
things, neither of which is scheduling:

1. **No working LLM provider in the Rig daemon.** AgentTurn/WorkflowRun need a
   live agent. Daemon provider keys are stale (nvidia 401, anthropic invalid,
   groq/cerebras 403, deepseek 402) and the only local model (`fast`) cannot
   tool-call. Owner: Rig pilot worker (227de461).
2. **The snapshot's data source is unreachable from awrawr-pc.** Today's digest
   queries `agent.subagent_spawns` in the Muse runtime's Postgres. The sandbox
   is not on the tailnet (verified `tailscale status` — peers are only
   github-mcp-host, almalinux-server, offline pixel-9-pro-xl), so no Rig agent
   can see the Muse subagent fleet. This resolves itself when fleet workers
   become persistent Rig agents: Rig's own registry becomes the ledger, and the
   snapshot prompt queries it instead.

Do NOT register the real job until both are green: 5 consecutive failures
auto-disable the job, and a dead job is worse than the cron.

## 4. The job definition (ready to register)

`docs/fleet-snapshot-job.json` — POST to `/api/cron/jobs` when unblocked:

- `agent_id`: the persistent Shingle/Agent-2 agent id (pilot worker owns it)
- `name`: `fleet-snapshot`
- `schedule`: `{ "kind": "every", "every_secs": 300 }`
- `action`: `{ "kind": "agent_turn", "message": "<snapshot prompt>",
  "timeout_secs": 180 }`
- `delivery_targets`: `[ { "type": "local_file",
  "path": "/home/toxic/.shingle/directives.md", "append": true } ]`

Snapshot prompt (agent must produce — keep to ~6 lines, prefixed
`## [snapshot HH:MM MDT]`):
"Produce the fleet snapshot: list every running Rig agent (name, age, current
task), every agent that finished/failed in the last 30 minutes (one-line
outcome), and flag anything stuck or failed. Read state from the kernel agent
registry and today's fleet channel. Compact, phone-readable, no prose."

## 5. Cutover runbook

1. Pilot green: Shingle agent answers an agent_turn with a real digest.
2. `curl -X POST http://127.0.0.1:25203/api/cron/jobs` with
   `docs/fleet-snapshot-job.json` (fill in agent_id).
3. Watch two consecutive firings: `openfang cron list` shows `last_run`
   advancing; digest lines append to directives.md.
4. Only then: `cron.remove fleet-snapshot-5m` (Muse runtime side).
5. If the job auto-disables (5 failures): leave the cron up, debug, re-enable.

## 6. Deterministic timers (audit-export, hw-audit)

Both are shell scripts with no LLM content, but Rig cron has no shell action —
only SystemEvent/AgentTurn/WorkflowRun. They move via AgentTurn (agent runs
the script through its shell tool) once the agent plane is green, or not at
all. No action until then; the systemd timers stay.

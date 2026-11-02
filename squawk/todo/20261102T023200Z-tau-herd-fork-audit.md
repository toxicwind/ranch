---
title: "audit: herd-fork mentions in last 3 months of fleet history (max-plan 5.30)"
author: tau
status: DONE (by daemon, 2026-11-02T03:49:51.187Z)
unique-id: 20261102T023200Z-tau-herd-fork-audit
urgency: normal
---

# Herd-fork mentions — 3-month fleet history audit

**Context:** AGENTS.md §1.6 + flock/herd pairs ("flocks/herd pairs noted in
loom-visor", tau 6d5a6d0bcf) — the concurrent-writer doctrine. This docket
audits how herd/fork mentions appeared in fleet history over the last 3 months
to surface any un-reconciled split.

## Task
1. Scan fleet message history (squawk daemon :25120) + git logs for
   `herd`, `fork`, `flock`, `subagent` mentions since ~2026-08-01.
2. Classify: peer coordination (fine) vs un-reconciled divergence (action).
3. For any divergence: file a resolution ticket or fold forward; record.

## Notes
- Read-only audit (message + git log history), no tree writes.
- $HOME/AGENTS.md §1.6 is the doctrine to hold findings against.

## Findings (2026-11-02, tau) — ALL peer-coordination, no un-reconciled divergence

Scanned: fleet /v1/state (presence+activity, 568 agents), estate + tau + barn
git logs since 2026-08-01 for `herd|flock|fork` (case-insensitive).

1. **loom fork** (estate 6d4fe94cc3/5e47515662): rjwalters/loom fork = the
   visor-lane product — PEER COORDINATION (product mapping, Loom docs/visor-lane).
2. **tau broker fork storm** (tau 30dca32d1c, 2026-10-30): auto-join broker
   respawned full TUI copies (90+ procs/min) — was a REAL divergence, FIXED at
   root: `TAU_DAEMON_CHILD` env marker + skip registration when present +
   detached-keeper (d62c395cab). Landed; not open.
3. **flock/herd mentions** (loom-visor arc, tau 6d5a6d0bcf): flagged as noted
   coordination doctrine (AGENTS.md §1.6 concurrent-writer), 60s lock + fold-
   forward — procedure, not divergence.
4. **fork-storm recovery skill** (tau fork-storm-recovery.md): operational
   guard (ps/restart watches), not a defect.
5. **lease-guard / ghost-path** (estate 41494224fc): `/home/toxic/estate` lease
   guard — estate singletruth, not herd conflict.

VERDICT: 0 unresolved herd/fork divergences. All instances are either product
forks (loom), fixed-at-root storms (tau broker), or coordination procedure.
No resolution tickets needed. Audit closed 2026-11-02.
## Done
- marked-by: daemon
- marked-at: 2026-11-02T03:49:51.187Z

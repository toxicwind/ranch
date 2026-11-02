---
title: "UNRELIABLE-NARRATOR LIVE AUDIT → 3 collab gaps: estate-map drift loop dead, .bak credential leaks, bge-oracle unlanded"
author: tau
status: pending
unique-id: 20261102T103600Z-tau-unreliable-narrator-drift-loop
urgency: CRITICAL
---

# Unreliable-Narrator live audit (2026-11-02) — 3 open collab gaps

8-probe audit executed against the live estate (see
`pens/agentic-moment/products/audit/moments/20261102-unreliable-narrator-8-probe-live-audit.md`,
commit `62ee6ee`). Every self-report layer was measured vs runtime. Three gaps
need a fleet owner — none is a tau-only job, and all three are the "drift
detectors drift" failure mode:

## GAP 1 (CRITICAL) — estate-map drift loop is DEAD at the source
- `projects/ops/bin/estate-map.ts` (the generator CONVENTIONS.md + estate-map.md
  tell us to rebuild with, `--check` mode) **does not exist** — removed by the
  Oct reorg, no relocated replacement lives anywhere in `pens/estate`.
- `docs/estate-map.json` is committed but **30 days stale** (generatedAt
  2026-10-03T07:22:51Z) and carried forward verbatim by a retro commit,
  still claiming 33 `port-ssot-dead` + 1 `daemon-path-dead` + 1
  `duplicate-checkout`.
- **Live EXP3 proves the real gap is WORSE:** `ports.env`(108) ∧ `ss`(106) =
  only **45** matched; **63 declared-not-running**, **61 running-not-declared**.
  The stale report understates the drift.
- Action: resurrect the generator (rewrite or relocate to `ops/bin/`), wire it
  into the boot/CI loop, regenerate `estate-map.json`/`.md`, then triage the
  live 63/61.

## GAP 2 (CRITICAL) — real credential values in TRACKED `.bak` files
- `config/tau/config.yml.bak-npkkey-20261013`, `config/tau/rhodochrosite.key.bak-20261013`,
  `config/tau/agent/extensions/tau-hodossync/settings.json.bak-stalekey` +
  `.bak-synckey` carry live keys **inside the git-tracked estate** — the exact
  "repair narrative is the leak" vector. Rule 10.1 (never commit a credential)
  is violated by the backups themselves.
- Action: confirm each key is dead (401 probe) or rotate, then `git rm` the
  `.bak` files + scrub history (or move to secretsmith keyring; never leave
  `.bak-*` with keys in tracked config).

## GAP 3 (MEDIUM) — the BGE-M3 drift detector is built but UNLANDED
- `/home/toxic/tmp/bge-oracle/{experiments.ts, full-output.txt}` already ran
  W1–W8 (the whitepaper §14 / forward-TODO #9 proposal): protocol dialect
  fingerprinting `dsml` as a distinct cluster, 18/18 hold-out. But it lives in
  `/tmp` — uncommitted, no product home.
- Action: relocate into a real product (`pens/geode/products/…`), wire to
  keyring for the freeinference `bge-m3` embed lane, and add a `W9`
  narrative↔runtime asymmetry ranking over the EXP3 port pairs.

## Done
- (none yet — all pending, seeking collab owner from #fleet)
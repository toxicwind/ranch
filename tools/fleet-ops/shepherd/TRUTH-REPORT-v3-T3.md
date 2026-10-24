# T3 — Herd closure + smithers ghost: ROOT CAUSE FOUND AND FIXED (2026-10-23)

## The ghost
Oct 19 15:28 MDT: a smithers/corral run (scout research-1792445323109) launched
with `--model nvidia/nemotron-3-ultra-550b-a55b` — a model that FAILED the Oct 19
codegen bench (67s reasoning burn, demoted) — even though no config file on the
box references it.

## Root cause
The model IDs lived in the **systemd user manager's runtime environment**
(`systemctl --user show-environment`), inherited by EVERY user process:
```
CLAUDE_CODE_SUBAGENT_MODEL=nvidia/nemotron-3-ultra-550b-a55b
NIM_MODEL / NIM_MODEL_DEEP / FLOCK_MODEL = nvidia/nemotron-3-ultra-550b-a55b
ANTHROPIC_DEFAULT_HAIKU/OPUS/SONNET_MODEL = nemotron ids
ANTHROPIC_CUSTOM_MODEL_OPTION = deepseek-ai/deepseek-v4-pro-0813 (EOL)
SCOUT_MODEL / SCOUT_MODEL_1 = openai/gpt-oss-20b (DEAD per osprey 2026-10-13)
```
No file source: `~/.config/environment.d/`, `~/.bashrc`, `~/.profile` are all
clean — pure runtime state, same pattern as the stale GitHub tokens (Mole-Env,
2026-10-04). smithers' BaseCliAgent reads CLAUDE_CODE_SUBAGENT_MODEL from the
inherited env → ghost model picks.

## Fix (Chris approved 2026-10-23, "fix it all")
`systemctl --user unset-environment` on all 9 stale vars, live, no restart
(same procedure as the token fix). Remaining: MODEL_GUARD_PORT, COPILOT_MODEL
(both current, kept). Existing shells keep residuals until re-login — documented,
not a leak. New processes are clean. Verified: show-environment lists no stale
MODEL vars.

## Herd closure
- :25100 FREE (ss clean), nothing listens. llama-swap gone.
- ffs sweep of ranch+estate: no LIVE config references :25100. Remaining refs:
  ranch/dashboard/index.html (dashboard cosmetic config), barn/archguard
  seedEstate.ts (already marks svc-herd 'retired'), docs/ARCHITECTURE.md
  (historical). No live consumer anywhere.
- estate/herd pitchfork unit: was `errored unknown exit code` → DISABLED
  (config preserved, noise stopped). Matches the awrawr-mcp pattern.
- Gatehouse: estate/gatehouse stopped, :25127 intentionally reassigned to
  estate/thresher (its own config listen=127.0.0.1:25127). Not a squat.
  Review item: confirm gatehouse MCP retirement or relaunch on new port.

## T2 matrix row (probe task-1792812234324, 2026-10-23)
intake → 5 bids (vesper/finch/raccoon 0.94, forge 0.92, scout 0.91) →
assigned bidder-vesper → bond_released_infra → SETTLED → label_excluded.
End-to-end bidder chain PROVEN live on the new model chain (gpt-oss-120b
judge panel, ranch 5dc1442). super-ralph binary still missing — rebuild
belongs to the super-ralph lane (no source on box); bidder.py RALPH_BIN
fallback lane stays broken until then.

Reports: /home/toxic/kite/vesper-20261023T2111-bridgeback/
Ranch: tools/fleet-ops/shepherd/

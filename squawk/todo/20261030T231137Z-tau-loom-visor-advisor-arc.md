# Forge → stencil cutover plan (loom-visor arc; ground truth 2026-11-02)

GOAL: rename forge → stencil (brand semantics: "emergency prototype seam" →
"sharp tool that survives"), carry the emergent seam, zero downtime.

## Live surface (verified 2026-11-02)

| Surface | Evidence | Cutover |
|---|---|---|
| daemon `forge` | `estate/pitchfork.d/forge.toml` | rename key `[daemons.stencil]`, restart (next-reboot window) |
| daemon `forge-agent` | `estate/pitchfork.d/forge-agent.toml` | same |
| daemon `bidder-forge` | `estate/pitchfork.d/bidder-forge.toml` | same |
| systemd user unit | `~/.config/systemd/user/forge-server.service` | rename unit file + `daemon-reload` |
| bin `pattern-forge` | `~/.local/bin/pattern-forge → barn/products/forge/bin/forge.ts` | new link `pattern-stencil → bin/stencil.ts` (keep old as alias 1 cycle) |
| bin `forge-router` | `~/.local/bin/forge-router → /home/toxic/pens/forge/products/router` — **GHOST path (dual checkout)** | repoint to barn canonical or drop; fix in rename |
| bin `delend-forge-audit` | `~/.local/bin/delend-forge-audit → estate-ops/delend-forge-audit` | rename to `delend-stencil-audit`, update gateway plugin ref |
| ops scripts | `looper-forge.sh`, `ops/*forge*`, `maximal-host-pack.sh` | string sweep `forge`→`stencil` in non-live scripts; live ones next reboot |
| thresher gateway plugin | hephaistos `forge-audit` plugin (mcp_config + hodos) | repoint plugin path/name + gateway restart |
| dual checkout | `/home/toxic/pens/forge` (root dir) vs `barn/products/forge` | topology defect (#74 class): archive `pens/forge`, canonical stays barn |

## Execution order (restart-window, forward-only)

1. `pens/forge` ghost checkout → archive `pens/estate/archive/2026-11-02-tau-forge-ghost-checkout/`
2. barn `forge` repo: `git mv` dirs + string sweep (README/package/moon.yml/WEAVE.md/releases) via `rename-roundup` pairs; keep repo remote `toxicwind/forge` (renaming remote = re-auth + page churn; note in README)
3. `bin/forge.ts` → `bin/stencil.ts`; `pattern-stencil` + `stencil` links; keep `pattern-forge` alias 1 cycle
4. pitchfork: rename 3 daemon keys + repoint `run`/`dir`; `pitchfork reload`
5. systemd: `forge-server.service` → `stencil-server.service`
6. gateway: `forge-audit` plugin → `stencil-audit`; thresher restart
7. verify: `pitchfork list | grep stencil` all running; `ss -tlnp` ports same; `bin-verify.sh` green

## Consolidation (arc task: orphans → stencil)

- `ranch/products/forge-mcp`: fold MCP server into stencil `mcp/` dir, delete orphan (no symlink)
- `corral/src/cli/index.ts` (taskforge link): keep — corral owns taskforge lane
- `router/stoat`: stays (estate-router-ts, separate line; already var/state-correct)

## Revert

Every step is a committed, pushable change; revert = `git revert` the step commit
+ keep 1-cycle aliases. No force-push anywhere.
- status: DONE (by daemon, 2026-11-02T01:55:52.326Z)

## Done
- marked-by: daemon
- marked-at: 2026-11-02T01:55:52.326Z
---
### bge-xref (2026-11-05T00:16Z)
touches: /home/toxic/pens/ranch/products/flicker/server/forge/refresh_test.go (0.62), /home/toxic/pens/ranch/products/flicker/server/forge/refresh.go (0.62), /home/toxic/pens/ranch/products/flicker/server/forge/common/status_test.go (0.59)

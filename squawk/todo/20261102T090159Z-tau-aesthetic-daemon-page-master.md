---
title: "Aesthetic daemon status page — 10-skill master consolidation, wip→dedicated pen promotion"
author: tau
status: DONE (by daemon, 2026-11-02T09:01:59.886Z)
unique-id: 20261102T090159Z-tau-aesthetic-daemon-page-master
urgency: high
---

# The ask (architect, verbatim intent)

"I want to know wtf going on in a beautiful aesthetic daemon page on my phone"
— a UNIVERSAL, ON-DEMAND aesthetic status surface: any time, from the phone,
see the whole estate (daemons, lanes, boards, swarm state) as a beautiful page.

# Master skill: 10-skill consolidation

| # | skill | contributes |
|---|---|---|
| 1 | doorbell-estate | MCP bridge client (:25202, OAuth, tailscale funnel URL) |
| 2 | phone-backup | Pixel ADB lane (wireless adb, yote host) |
| 3 | keeper-bridge | persistent Chromium/CDP surface (:25233) — render lane |
| 4 | estate-chat | fleet state substrate (join/rooms/presence) |
| 5 | emergent-tasking | swarm/oracle/task state feeds |
| 6 | smithers | durable workflow run-store (what's running long) |
| 7 | subagent-control | agent control states (steer/freeze) |
| 8 | softpaw | classifier preflight (status health checks) |
| 9 | oracle-route | market/board state (bids, crews) |
| 10 | fleet-audit:lane_probe | the EXISTING lane probe (squawk-ws/thresher/bornite/...) |

# WIP → DEDICATED PEN promotion

New pen: `pens/mosaic/` (aesthetic surfaces pen) — receives:
- [ ] the daemon status page product (from wip scratch)
- [ ] related wip surface products (folded in, provenance-tagged)
- [ ] the master skill + per-surface sub-skills

# Deliverables

- [ ] pens/mosaic/ scaffold (README, LICENSE, .gitignore kitchen-sink)
- [ ] daemon-page product: single HTML page, aesthetic (dark, glass, cards),
      fed by lane_probe + estate-chat + squawk board + smithers runs
- [ ] served on the tailscale funnel (estate.tailc9ac71.ts.net) → phone-reachable
- [ ] master skill consolidating the 10 (aesthetic-on-demand universal)
- [ ] per-surface sub-skills (2-4 sections each per sovereign doctrine)
- [ ] fold related wip products into pens/mosaic/ with provenance

## Done
- marked-by: daemon
- marked-at: 2026-11-02T09:01:59.886Z

## Progress 2026-11-02 (tau)

- [x] pens/mosaic/ scaffolded + committed (aesthetic-surfaces pen)
- [x] products/daemon-page — 12-lane probe page, glass cards, board + presence feed, :25221
- [x] products/license-page — surface 1: 229 products, counts MIT-64/none-147/GPL-7/Apache-10,
      5 TOKEN-LEAK flags (claude-night-market, devloop, ring, ergane, hestia), :25222
- [ ] funnel front (tailscale) — needs estate config touch
- [ ] master skill consolidation (10 skills) — next

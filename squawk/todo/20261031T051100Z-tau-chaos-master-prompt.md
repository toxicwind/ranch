---
title: "Master prompt (chaos-forward autonomous engineer) from chaos/protot-engineering skills + typo-audit closeout pre-step"
author: tau
status: DONE (by daemon, 2026-11-02T05:54:12.884Z)
unique-id: 20261031T051100Z-tau-chaos-master-prompt
---

# Master prompt — chaos-forward autonomous engineer

Build a single master system prompt from the estate's chaos + prompt-engineering
skills, then save the plan + todo to the squawk todo board. Typo-audit page
closeout runs as a PRE-STEP (it was left unfinished in the prior session).

## Pre-step — close out typo-audit (DONE ✅)
- [x] Fix `products/site/compare/index.html` stub link label (empty → "mobile near-miss signatures by input mechanism")
- [x] Verify page committed in Pages repo `agentic-moment-2026` (tree has `typo-audit.html`)
- [x] Verify live: `https://toxicwind.github.io/agentic-moment-2026/typo-audit.html` → HTTP 200
- [x] Headless render verify: dark bg `(13,12,10)` + card `(20,19,16)` + accent text = renders

## Research skills (DONE ✅)
- Used `azurite:skills_search` (local catalog) — `azurite:skills_registry_search` is a CLI-help stub, not a real search
- **Root-caused + fixed `azurite:skills_registry_search`**: it called `["registry", query]` but azurite.js had NO `registry` subcommand — printed help + exited nonzero. Added the command (searches vendored upstream/skills-hub + local catalog) and resolved roots from module path (thresher spawns without a dir). Commit `ead2c4c`, pushed.
- Selected **6 skills** (verified via the fixed search):
  | # | Skill | Source | Contribution |
  |---|-------|--------|-------------|
  | 1 | `system-prompts` | local | RFC 2119 house style, tags, positioning, anti-patterns |
  | 2 | `capability-fuzz` | local | "A 'can't' is a hypothesis" — narrator-diff chaos discipline |
  | 3 | `race` | local | latency-as-correctness, race-not-queue, fail-fast |
  | 4 | `emergent-mcts-graph` | local | MCTS test-time compute + subgraph induction |
  | 5 | `chaos` | upstream/skills-hub.ai (qa) | failure-surface mapping, chaos-test generation, resilience score |
  | 6 | `prompt-engineering` | upstream/skills-hub.ai (education) | specificity, STAR, context budget, constraints |

## Draft master prompt (DONE ✅)
- Wrote `/home/toxic/pens/agentic-moment/products/site/chaos-master-prompt.md` (6.7KB, 6-skill synthesis)
- Sections: Role / Stance / Directives (6 skills) / Completeness / Verification / Yielding / Stakes / Critical-recap
- Pushed to Pages repo (`caec185`) → live on github.io; azurite fix pushed (`ead2c4c`)

## Remaining
- [x] Push chaos-master-prompt.md to Pages repo — DONE (`caec185`)
- [x] Mirror `chaos-master-prompt.md` into `pens/dedicated/docs/` — DONE 2026-11-02 (fold-tracked pen namespace)

## Evidence
- typo-audit.html live HTTP 200 on github.io (2026-10-31)
- `azurite:skills_registry_search "chaos"` → returns upstream `chaos` skill (fixed)
- 6 skill bodies read: 4 from azurite/skills + `chaos`, `prompt-engineering` from upstream/skills-hub
- chaos-master-prompt.md written (6668 bytes), pushed `caec185`
## Done
- marked-by: daemon
- marked-at: 2026-11-02T05:54:12.884Z

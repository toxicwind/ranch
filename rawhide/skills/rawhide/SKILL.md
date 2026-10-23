---
name: rawhide
description: Engine + default Gwern pack. Loads additional packs from RAWHIDE_PACKS or discovered skills. One engine, composable rule modules.
---

# Rawhide

Rawhide is the engine. Skills supply composable rule packs.

- Default pack: `gwern` (epistemic scales, 75-word dense prose, anti-slop + hedge, markdown-aware).
- Optional packs: `airspeak` (STE mechanical lineage absorbed), `epistemic` (Kesselman calibration).
- Activate via `RAWHIDE_PACKS=gwern,airspeak,epistemic` or skill discovery.
- Markdown-aware: skips code fences, tables, headings.

Enable or disable packs without touching the engine.

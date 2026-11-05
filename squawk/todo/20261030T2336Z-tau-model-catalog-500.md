---
title: "tau catalog shows 16 neuralwatt models, not 500+ — geode routers/provider SSOT broken"
author: tau
status: DONE (by daemon, 2026-10-31T09:39:51.520Z)
unique-id: 20261030T2336Z-tau-model-catalog-500
---

# tau catalog shows 16 neuralwatt models, not 500+ — geode routers/provider SSOT broken

## Symptom
`tau models --kind all --json` returns 49 models: 13 local tiny/stt/tts, 16 neuralwatt chat, 20 web search. The estate has 500+ models. Advisor model `nvidia/nemotron-3.5-super-vl-120b-a12b` resolves to NOTHING (`tau models find nemotron` → "No models matching"), so the live tauvisor advisor is running on a dead model.

## Root-cause lead
- Provider SSOT = `ranch/pinax/src/data.ts` (estate-provider-catalog-ssot skill): `cd ranch/pinax && bun run build` regenerates `~/.tau/models.yml`, `estate/config/tau/models.yml`, `estate/config/kappa/kappa-models.json`, `ranch/pinax/generated/*`. NEVER hand-edit generated files.
- geode routers / pinax build not federating the full catalog into tau model discovery — only 16 neuralwatt chat models visible.
- RED-HERRING WARNING: some docs/memory claim the catalog is fine or that providers are limited to a fixed set — that is wrong and is actively blocking the fix. There ARE 500+ models; tau just can't see them.

## Fix scope
1. Confirm 500+ model source (ranch/pinax/src/data.ts).
2. Trace tau model discovery → geode router → provider catalog; find where the list is clipped to 16 neuralwatt.
3. Restore full catalog; re-verify `tau models` shows 500+ and nemotron resolves.
4. Remove/annotate the red-herring doc or stale memory once root cause is confirmed.

## Evidence
- `tau models --kind all --json` → 49 models, 16 neuralwatt chat (2026-10-30)
- `tau models find nemotron` → no match
- TAUVISOR.yml advisor model = nvidia/nemotron-3.5-super-vl-120b-a12b (dead)
## Done
- marked-by: daemon
- marked-at: 2026-10-31T09:39:51.520Z
---
### bge-xref (2026-11-05T00:16Z)
touches: /home/toxic/pens/ranch/products/gito/documentation/troubleshooting.md (0.57), /home/toxic/pens/ranch/products/estate-monitor/repo-radar.ts (0.56), /home/toxic/pens/ranch/products/estate-monitor/repo-radar.test.ts (0.55)

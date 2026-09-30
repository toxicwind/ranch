# SPARKFALL phase 3 — dedupe + rename decisions (Rune, 2026-09-30)

All diffs run on yote with `diff -rq` before naming. Nothing deleted; shards pristine.

## DualSpace triple (all `@sovereign/dual-space-code-retriever`, all genuinely different)
- `Sovereign_Star_Repo_DualSpace_AST_BM25_20260928T134531` -> `repos/dualspace-ast-bm25` (earlier snapshot)
- `Sovereign_Star_Repo_DualSpace_AST_BM25_20260928T134642` -> `repos/dualspace-ast-bm25-v2` (later; different notebooks + src differ)
- `Sovereign_AST_BM25_Hybrid_Engine_20260928T134500` -> `repos/dualspace-ast-bm25-hybrid` (rewritten API: src/index.js, rrf_fusion.js, bm25.js vs bm25_retriever.js/dual_space_engine.js)

## Postal-spectre quad (all `@sovereign/postal-spectre`, four genuinely different modules)
- `Sovereign_PostalSpectre_Engine_20260929T141600` (shard-c) -> `repos/postal-spectre` — consolidated engine: pipeline + contradiction-engine + demographic-profiler + entity-graph + synthetic-detector + README
- `Sovereign_Postal_Spectre_ESM` (shard-b) -> `repos/postal-spectre-detector` — generative-AI diffusion artifact detector + semantic contradiction scorer
- `Sovereign_Postal_Spectre_ESM_20260929` (shard-d) -> `repos/postal-spectre-correlator` — capital/corporate registry correlator + demographic receptivity profiler
- `Sovereign_Political_Ad_Intel_Engine_20260929T134500/postal_spectre` (nested) -> `repos/postal-spectre-usps` — pure USPS presort/indicia module; ALSO kept in place inside political-ad-intel-engine (original tree preserved, 9 files duplicated by design since both were repo candidates)

## KeyPool trio (all genuinely different)
- `Sovereign_Star_Repo_Universal_KeyPool_Bun_20260929T141500` -> `repos/universal-keypool-bun` (pkg "keypool", Bun+Node hedged racing)
- `Sovereign_Star_Repo_Universal_KeyPool_Gateway_20260929T141000` -> `repos/universal-keypool-gateway` (TS sources)
- `Sovereign_Star_Repo_Herd_KeyPool_Gateway_20260929T134600` -> `repos/herd-keypool-gateway` (JS sources + bin/adapters/config — differ)

## Ghosts (inventory entries with no physical bytes)
- `/Sovereign_Live_Execution_Bundle_2026` (empty folder in Dropbox) -> `organized/bundles/live-execution-bundle-2026/` (empty dir)
- `/.version` (8 bytes, 2023-11-02Z, never extracted) -> `organized/misc/dropbox-version-marker.txt` (provenance note only)
- Note: physical `/Apps/Tampermonkey/.version` exists but is NOT in the Dropbox inventory; its content (5.0.6189) preserved as `organized/misc/tampermonkey-app-version.txt`.

## Leftovers
- `/Sovereign_Master_Orchestrator` minus the 5 carved candidates -> `organized/misc/sovereign-master-orchestrator/` (research archive: dossiers, PoCs, audits)
- `/Sovereign` (ARCHITECTURE.md + m3u_toolkit) -> `organized/misc/sovereign-m3u/`
- `/Sovereign_Artifacts_Bundle` -> `organized/bundles/sovereign-artifacts-bundle/` (as-is)
- Chat backups -> `organized/docs/chat-backups/` (dir/file stems kebab-cased; inner data filenames kept)
- Scala PDF -> `organized/docs/functional-programming-in-scala.pdf`

## Name sources
Repo dirs named from package.json `name` where sane (hyper-racer, gatehouse, toolchain-doctor, sovereign-mesh, etc.); descriptive names where package names collided or were meaningless.

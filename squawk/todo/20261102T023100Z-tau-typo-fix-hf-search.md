---
title: "fix: typo-fix HuggingFace search — embedded for mobile (max-plan 5.30)"
author: tau
status: DONE (by daemon, 2026-11-02T02:55:38.043Z)
unique-id: 20261102T023100Z-tau-typo-fix-hf-search
urgency: normal
---

# Typo-fix HF search (mobile) — embedded repo search

**Context:** the estate's HF/repo search surfaces (freeinference-orthogonal-probe
skill, xerj-class engines) do not tolerate typos/transposed letters; a
misspelled model/repo name returns zero. Mobile (Pixel) typo-fix embedding
means correcting the query BEFORE racing sources.

## Task
1. Locate the search input path(s): freeinference-orthogonal-probe skill,
   any qdrant-backed repo search (cosmic_local_384 lane is a candidate consumer).
2. Add a typo-correction step: against the local catalog of known model/repo
   names (bge-m3/MiniLM embed + edit-distance fallback).
3. Prove: "nemotron" → "nemotron", "qwen3.5" → "qwen3.5" via a distance-1
   correction with an embed-rank tiebreak; TDD it.

## Notes
- Reuses the landed cosmic local embed lane (ops 9f7fb4d) — no new keys.
- Mobile-first: the correction must run in-process, no round-trips.
## Done
- marked-by: daemon
- marked-at: 2026-11-02T02:55:38.043Z

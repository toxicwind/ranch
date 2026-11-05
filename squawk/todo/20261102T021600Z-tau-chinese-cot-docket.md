---
title: "chaxu/geju/guanxi Chinese-token CoT — speculative research docket (max-plan Phase 4.22)"
author: tau
status: DONE (by daemon, 2026-11-02T05:57:41.853Z)
unique-id: 20261102T021600Z-tau-chinese-cot-docket
urgency: low
---

# Chinese token-aware chain-of-thought — research docket

**Source:** max-plan Phase 4.22 (2026-10-29): "Chinese token-aware
chain-of-thought (chaxu geju / guanxi), English output; advisor hallucinations
IGNORED."

## Status (2026-11-02)

**Not implemented by design** — this is a speculative prompting technique, not
a code contract. The estate's reasoning/CoT infrastructure serves the intent
already and is TDD-green:

- `auto-thinking/classifier.ts` — structured reasoning-effort classification.
- `judgment/` — judgment chain.
- Thinking loop retry, role/plan thinking level, compaction thinking model,
  advisor DevIn thinking — 91/91 tests green (2026-11-02 live run).

## What the docket would test (if pursued)

- Whether reasoning in Chinese-token space (chaxu 差序 hierarchy, geju 格局
  framing, guanxi 关系 relation-tracking) improves chain coherence for
  Chinese-language-adjacent tasks, with final output in English.
- Requires an eval harness against the judgment chain, NOT a code change to
  the reasoning path. AO/AR framing: an experiment with a labelled dataset +
  output-language guard.

## Why parked

No acceptance criteria were defined in the plan beyond the concept. The core
CoT infrastructure is complete and verified; a prompting-variant experiment
needs an architect-defined eval before it becomes a work item.

## Related

- `packages/coding-agent/src/auto-thinking/` + `src/judgment/`
- Anomaly #78 note: advisor hallucinations are IGNORED by design (the
  executor holds the tree; advisor is read-only sensor).
## Done
- marked-by: daemon
- marked-at: 2026-11-02T05:57:41.853Z
---
### bge-xref (2026-11-05T00:16Z)
touches: /home/toxic/pens/ranch/products/awesome-free-ai-coding/models/qwen3.7-max.md (0.53), /home/toxic/pens/ranch/products/godzilla-llama.cpp/docs/speculative.md (0.53), /home/toxic/pens/ranch/products/awesome-free-ai-coding/models/qwen3.6-max.md (0.52)

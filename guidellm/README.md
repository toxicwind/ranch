# guidellm — GuideLLM benchmark estate

Consolidated 2026-09-29: everything GuideLLM-related lives here, in the ranch
ecosystem. Full moves, no symlinks.

## Layout

- `fork/` — working copy of `toxicwind/guidellm` (fork of `vllm-project/guidellm`).
  Nested repo with its own `.git`; git-ignored here, managed independently.
  Carries our 4 benchmark-quality commits: pluggable response-quality scoring
  (`instruction_following`), HF tokenizer error taxonomy, empty-output scoring
  semantics, completed-only quality aggregates.
- `sweeps/` — sweep and bench scripts. Keys are read from `/home/toxic/.secrets`
  in-process on yote, never printed. Ranking inputs: quality desc, p50 latency asc.
  Cost is not a factor (Chris directive).
- `docs/` — eval plan (`GUIDELLM_EVAL_PLAN.md`) and the 2026-09-20 upstream audit.
- `results/` — sweep outputs (`*.json`, `*.tsv`, `ranking.md`). Git-ignored;
  generated artifacts, never committed.

## Standing order

Ranking runs THROUGH the fork. `probe_abstract.py` (still in
`projects/openrouter-probe/`) is the correctness/quality layer GuideLLM
structurally lacks — it is kept, not superseded. Two-layer design: abstract
instruction-following score -> free-on-provider -> GuideLLM p50 latency.

## Running

```bash
./sweeps/guidellm_sweep.sh        # short sweep, OpenRouter free models
./sweeps/guidellm_herd_sweep.sh   # herd-routed sweep, live model discovery
./sweeps/guidellm-bench-v3.sh     # full multi-provider bench + ranking
```

Venv: `/home/toxic/.venv-guidellm` (editable install of `fork/`).
Binary: `/home/toxic/.local/bin/guidellm`.

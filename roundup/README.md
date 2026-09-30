# roundup — benchmark estate

A cattle roundup gathers and assesses every head; this one gathers and
assesses every model. Renamed from `guidellm/` on 2026-09-30 (repo
`toxicwind/guidellm` → `toxicwind/roundup`). The benchmarking tool under the
hood is still GuideLLM — roundup is the estate brand.

Consolidated 2026-09-29: everything benchmark-related lives here, in the ranch
ecosystem. Full moves, no symlinks.

## Layout

- `fork/` — the `toxicwind/roundup` codebase (fork of `vllm-project/guidellm`),
  vendored in-tree as real tracked files. No nested repo, no gitignore carve-out.
  Carries our benchmark-quality work: pluggable response-quality scoring
  (`instruction_following`), HF tokenizer error taxonomy, empty-output scoring
  semantics, completed-only quality aggregates, plus the 2026-09-30 maximal
  upstream sync (20 upstream commits: per-turn metrics, OTel tracing, backend
  per-request metrics passthrough). Standalone repo stays complete and
  independent at `toxicwind/roundup`.
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
./sweeps/roundup_sweep.sh        # short sweep, OpenRouter free models
./sweeps/roundup_herd_sweep.sh   # herd-routed sweep, live model discovery
./sweeps/roundup-bench-v3.sh     # full multi-provider bench + ranking
```

Venv: `/home/toxic/.venv-guidellm` (editable install of `fork/`).
Binary: `/home/toxic/.local/bin/guidellm`.

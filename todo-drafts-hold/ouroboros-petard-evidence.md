# OUROBOROS-PETARD — Evidence Chain (live, 2026-11-08) — PART I VERDICTS

Epistemic class: KETER-RECURSIVE.

## Petard #1 — headline dataset numbers: BRIEF MISMATCH (CONFIRMED)
- brief: 11,964 sessions / 1,186,601 requests / 1,214,404 tool calls / 205.4B input tokens
- paper Table 1 (fetched): 12,002 / 1,186,582 / 1,213,347 / 209.2B (input); 552.5M output; 197.1B cached; "13 (+1)" harnesses
- HF dataset card (fetched): "12,002 agent sessions ... 14 agent harnesses, 1,186,582 LLM requests and 1,213,347 tool calls"
- verdict: paper == HF card; brief disagrees on 4/4 → the brief's numbers are stale/unverified (from an earlier draft or hallucinated). [CONFIRMED MISMATCH]

## Petard #2 — "trace contains user prompts / message text" (CONFIRMED FALSE)
- brief implies prompts/session text as substrate. HF card verbatim: "**No message text is released.**"; fields = timings, tokens, tools, mutations, block prefixes (hashed).
- verdict: releasing a trace with prompts is impossible on THIS dataset; any audit promising prompt-level forensics is hoisted. [CONFIRMED]

## Petard #3 — harness "Oh-My-Pi" identity (OPEN)
- paper lists "Pi 1,499 sessions 61.2B" AND "Oh-My-Pi 719 sessions 17.4B" as SEPARATE harnesses; brief treats them in one breath. Check: are they distinct products or one? (Oh-My-Pi <= the project name; Pi <= 'pi' harness?) [TODO verify against harness docs + user-agent strings]

## Petard #4 — provider/tokenizer/cost narrative (checking)
- paper: request input tokenized with o200k_base; provider_tokens also recorded; cached tokens 197.1B; cost model = "Claude Fable 5 pricing" [6] ($1 cached / $10 uncached / $50 output per M) — "Fable 5" naming needs live verification (Anthropic docs).
- 15-min retention rule; infra cost min at 15 min (0.42x); API cost min ~30 min; day = 25.6x storage.
- verdict: internally consistent; external citations [6] upstream-verify needed. [PARTIALLY VERIFIED]

## Paper key numbers (cross-check table, for reuse)
- median session 30.2m, median turn 61s; per-session medians: 4 user, 36 tool, 42 LLM steps
- median req input 129.1k tokens, uncached ~500, output ~200
- cached = 97.4% token volume / 72.9% cost; mutations 4.0% steps / 56.4% sessions; 62% new-prefill share
- 84.5% reqs single tool call; subagents 10.4% sessions; 33% async
- tool exec 21.7% / user idle 50.3% / decode 18.1% / prefill 9.9% session time; tool 2x = 1.38x speedup
- SWE-Bench vs human: turn 188s vs 61s; session 3.2m vs 30.2m; req input 25k vs 129k; retention 5m vs ~1d
- harness table: Hermes 3953, OpenCode 1733, Pi 1499, SWE-Bench 1035, Kilo 797, Codex 763, Oh-My-Pi 719, Claude Code 639, Copilot 295, Zcode 197, OpenClaw 189, Cline 86, Zoo 75, OpenHands 22

## References bank (for later substrate 4)
- dataset: https://huggingface.co/datasets/harvardMadsys/freeinference_agentic_trace
- github: https://github.com/HarvardMadSys/freeinference_agentic_trace (+ hybridInference, hybridInference-cloud-agent, RouteWise llm-routewise live)
- explorer: trace.agentic-system.org; blog: systems.seas.harvard.edu/blog/agentic-traces-freeinference/
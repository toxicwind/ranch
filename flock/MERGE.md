# Flock Maximal Merge — Pattern Absorption Record

**Date:** 2026-09-30
**Agent:** Anvil (maximal-flock-merge lane)
**Base:** Phase 2 commit 952a9da

This document records what was borrowed from each of the six source routers,
what was left behind, and why. The goal: flock becomes the one maximal router
by absorbing worth-keeping patterns, not by deleting the others.

## Phase A: fastllm-proxy — Context-Window Auto-Demotion

**Source:** `Fastllm-proxy/src/routing.rs` (~line 1170)

**Pattern:** When a request needs N tokens (prompt + max_tokens), models whose
declared context window cannot hold N are demoted (not dropped) to the back
of the candidate chain via stable sort. Undeclared windows are never demoted.

**Taken:**
- `needed_tokens()` = estimated prompt tokens (chars/4) + max_tokens
- Stable-sort demotion in `select_with_budget()`
- `context_lengths: BTreeMap<String, u64>` on ProviderDef
- Roost seeds context windows for 17 providers

**Left:** fastllm's routing table structure (flock's strategy system is superior).

**Commit:** 75e9a31

## Phase B: AstrLink — Routing Decision Records

**Source:** `AstrLink/core/contract/routing_decision.go`

**Pattern:** Every routing decision produces a structured record explaining
WHY a provider was chosen and which were skipped, bounded at 64 skips.

**Taken:**
- `decision.rs`: `SelectionReason` (6 variants), `SkipReason` (12 variants)
- `RoutingDecision` with bounded `push_skip()`, `validate()`
- `select_with_decision()` returns `(candidates, decision)`
- `execute()` emits decision as structured tracing event

**Left:** WS-specific reasons kept as variants but not populated (flock doesn't
do WS routing yet). Header deferred.

**Commit:** 75a86f7

## Phase C: BrighTO_Router — Overhead Header

**Source:** `BrighTO_Router/src/proxy/mod.rs:1034`

**Pattern:** `x-router-overhead-ms` response header measuring ingress→dispatch.

**Taken:** Header in `relay()` using `Ctx.started.elapsed()`.

**Left:** `BackendLease` RAII — flock already has scopeguard equivalent.

**Commit:** 7a6c2b5

## Phase D: modelmux + GenPark — Attempts Ledger (DEFERRED)

**Status:** Deferred. Flock tracks `attempts: usize` already. Full ledger
(per-attempt provider + status + latency) needs retry-loop instrumentation.
Recommended follow-up extending `RoutingDecision` with `attempts` field.

## Phase E: Streaming Commit + Probe Isolation (DEFERRED)

**Status:** Deferred pending audit of `circuit.rs` (probe isolation) and
`proxy.rs` (first-chunk commit). Small, high-value if missing.

## Phase F: VansRouter — Provider Model Audit (PARTIAL)

**Findings:** VansRouter uses subscription-OAuth (not API-key), so providers
don't map. But model IDs are current:
- `claude-opus-4-5-20251101`, `claude-sonnet-4-5-20250929`
- `gpt-5.2-codex`, `gpt-5.1-codex-max`
- `gemini-3-flash-preview`, `gemini-3-pro-preview`
- `qwen3-coder-plus`, `kimi-k2-thinking`, `deepseek-v3.2-chat`

**Recommendation:** Audit against Roost `data.ts`, add missing IDs (data-only).

## Summary

| Phase | Source | Status | Commit |
|-------|--------|--------|--------|
| A | fastllm-proxy | Done | 75e9a31 |
| B | AstrLink | Done | 75a86f7 |
| C | BrighTO_Router | Done | 7a6c2b5 |
| D | modelmux/GenPark | Deferred | — |
| E | modelmux | Deferred | — |
| F | VansRouter | Partial | — |

**Tests:** 263 passing (259 baseline + 4 new
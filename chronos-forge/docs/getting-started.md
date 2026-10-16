# Getting Started

## Requirements

- Node.js >= 20.11 (developed against 22 and 24)
- npm
- Optional: `flock` on PATH for the POSIX lock fast path (falls back automatically)

## Install

```bash
npm install
```

## Verify

```bash
npm run verify    # typecheck + build + tests
```

Individual steps:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # emit to dist/
npm test            # compile + run node:test
npm run clean
```

## Run a dry-run cycle

```ts
import { ChronosForge } from './dist/chronos/cycle.js';

const forge = new ChronosForge({
  repoRoot: process.cwd(),
  dryRun: true,              // never executes proof commands
  maxCycles: 3,
  executionBudgetMs: 2000,   // hard per-execution ceiling
});

forge.run([{
  id: 'A',
  goal: 'example cluster',
  files: [],
  commands: [],
  patchPlan: 'no-op',
  proof: { command: 'echo ok', expectedExcerpt: 'ok' },
  rollback: 'git reset --hard HEAD',
  risk: 'none',
}]);
```

## The proof gate

Every cycle ends with exactly:

1. one proof command (`proof_cmd`)
2. one observed excerpt (`proof_pe` — a chunk pointer)
3. one checkpoint append to `state.json.actions[]`

If proof fails, the cycle performs a **diagnostic pivot**: capture the error
plus ±20 lines of surrounding source, run WebSIFT on the exact excerpt, patch
minimally, re-run proof.

## Execution budget

The proof gate runs under a hard deadline so a hung subprocess cannot freeze
the endless loop. The budget is **model-aware**: `MODEL_BUDGET_MS` in
`src/chronos/timeout.ts` maps each model to a ceiling derived from live
latency measurements (2026-10-15, NIM `chat/completions`).

- `stepfun-ai/step-5-preview` → 2000ms (measured 0.63s)
- `z-ai/glm-5.3-flash` → 45000ms (measured 30.3s)
- `nvidia/nemotron-3-ultra-550b-a55b` → 0 — known-broken (HTTP 400 DEGRADED);
  proof fails fast instead of stalling

Pass `model` in `ChronosConfig` to derive the budget, or set
`executionBudgetMs` to override it explicitly. The default for unknown
models is `DEFAULT_BUDGET_MS` (2000ms).

Note: every NIM model here is a reasoning model — low `max_tokens` budgets
are consumed by `reasoning_content` before any user-visible content is
emitted, so budget your tokens accordingly.

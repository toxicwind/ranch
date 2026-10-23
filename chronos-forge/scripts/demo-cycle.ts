/**
 * Dry-run demo: bootstraps the control plane, runs one cycle, prints the
 * framed event stream, and checkpoints. Mutates nothing real.
 *
 * Pass a model id to see the budget derive from measured latency:
 *
 *   node scripts/demo-cycle.ts                          # default budget
 *   node scripts/demo-cycle.ts z-ai/glm-5.3-flash       # 45s budget
 *   node scripts/demo-cycle.ts nvidia/nemotron-3-ultra-550b-a55b   # fail fast
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChronosForge } from '../dist/chronos/cycle.js';
import { modelBudget, modelIsKnownBroken, DEFAULT_BUDGET_MS } from '../dist/chronos/timeout.js';

const repoRoot = mkdtempSync(join(tmpdir(), 'chronos-demo-'));
const model = process.argv[2];

const budget = modelBudget(model, DEFAULT_BUDGET_MS);
console.error(`[demo] model=${model ?? '(default)'} budget=${budget}ms${modelIsKnownBroken(model) ? ' (known-broken: proof will fail fast)' : ''}`);

const forge = new ChronosForge({
  repoRoot,
  dryRun: !modelIsKnownBroken(model),
  maxCycles: 1,
  model,
  ...(modelIsKnownBroken(model) ? {} : { executionBudgetMs: 2000 }),
});

const results = forge.run([
  {
    id: 'A',
    goal: 'demo: replace hardcoded constant with a registry lookup',
    files: [],
    commands: [],
    patchPlan: 'no-op (dry run)',
    proof: { command: 'echo demo-proof', expectedExcerpt: 'demo-proof' },
    rollback: 'git reset --hard HEAD',
    risk: 'none — dry run',
  },
]);

const r = results[0];
console.error(`\n[demo] cycle=${r.cycle} winner=${r.winner?.id} rc=${r.proof?.rc}`);
console.error(`[demo] state root: ${forge.repoStateRoot()}`);

/**
 * Dry-run demo: bootstraps the control plane, runs one cycle, prints the
 * framed event stream, and checkpoints. Mutates nothing real.
 *
 *   npm run chronos:cycle
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChronosForge } from '../dist/chronos/cycle.js';

const repoRoot = mkdtempSync(join(tmpdir(), 'chronos-demo-'));

const forge = new ChronosForge({
  repoRoot,
  dryRun: true,
  maxCycles: 1,
  executionBudgetMs: 2000,
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

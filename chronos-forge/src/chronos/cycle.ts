/**
 * MOE_CYCLE — the only loop.
 *
 *   BOOTSTRAP -> SNAPSHOT -> (parallel experts) -> SYNTH -> APPLY -> PROOF
 *             -> CHECKPOINT -> RECURSE
 *
 * Coordinator invariants enforced here:
 *   - exactly ONE cluster is applied per cycle
 *   - the repo lock is held only to increment the cycle + checkpoint
 *   - the proof gate is mandatory: 1 command, 1 excerpt, 1 checkpoint append
 *   - freshness is re-checked immediately before every write
 */

import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { EventBus, type Event, type Step, type Role } from './event-frame.js';
import { ChunkStore, makeChunk } from './pseudoembedding.js';
import { repoHash, agentId, runId } from './hashing.js';
import {
  loadOrInit,
  writeState,
  bumpCycle,
  appendAction,
  staleness,
  type State,
} from './state.js';
import { Lock } from './lock.js';
import { snapshotRepo, FreshnessGuard, FreshnessViolation, type RepoSnapshot } from './snapshot.js';
import { ROLE_SPECS, selectWinner, type Cluster, type ExpertOutput } from './cluster.js';
import { detectTrigger, diagnosticPivot } from './websift.js';
import { boundedCommand, clampBudget, modelBudget, modelIsKnownBroken, DEFAULT_BUDGET_MS } from './timeout.js';

export interface ChronosConfig {
  repoRoot: string;
  /** Override the derived state root (defaults to <repoRoot>/.chronos). */
  stateRoot?: string;
  paneId?: string;
  /** Max cycles before the loop stops unless done is set. */
  maxCycles?: number;
  /** Shell out for real? When false, APPLY/PROOF are simulated. */
  dryRun?: boolean;
  /**
   * Model backing the agent, used to derive the proof budget from measured
   * latency (MODEL_BUDGET_MS). Ignored when executionBudgetMs is set.
   */
  model?: string;
  /** Hard per-execution ceiling in ms. Overrides the model-derived budget. */
  executionBudgetMs?: number;
}

export interface CycleResult {
  cycle: number;
  winner: Cluster | null;
  proof: { command: string; rc: number; excerptPe: string | null } | null;
  checkpoint: State;
}

export class ChronosForge {
  readonly repoHash: string;
  readonly agentId: string;
  readonly runId: string;
  readonly stateRoot: string;
  readonly chunks = new ChunkStore();

  private readonly bus: EventBus;
  private state: State;
  private cycle = 0;

  constructor(private readonly cfg: ChronosConfig) {
    this.repoHash = repoHash(cfg.repoRoot);
    this.agentId = agentId(cfg.paneId ?? '');
    this.runId = runId();
    this.stateRoot = cfg.stateRoot ?? join(cfg.repoRoot, '.chronos');
    this.bus = new EventBus(
      { repoHash: this.repoHash, agentId: this.agentId, role: 'COORD', runId: this.runId, cycle: 0 },
      (line) => {
        // stdout is the transport.
        process.stdout.write(line + '\n');
      },
      // Live cycle: frames must carry the cycle in progress, not cycle 0.
      () => this.state.cycle,
    );
    this.state = loadOrInit(this.repoStateRoot(), this.repoHash, cfg.repoRoot);
  }

  // ---------------------------------------------------------------- bootstrap

  repoStateRoot(): string {
    return join(this.stateRoot, 'repos', this.repoHash);
  }

  /** Idempotent. Creates the per-repo control plane and the global hub. */
  bootstrap(): void {
    const root = this.repoStateRoot();
    for (const d of ['inbox', 'outbox', 'artifacts']) {
      mkdirSync(join(root, d), { recursive: true });
    }
    mkdirSync(join(this.stateRoot, 'hub'), { recursive: true });

    const registry = join(this.stateRoot, 'hub', 'registry.json');
    if (!existsSync(registry)) writeFileSync(registry, '{}\n', 'utf8');

    writeState(root, this.state);
    this.emit('BOOTSTRAP', {
      type: 'file_write',
      path: root,
      repoHash: this.repoHash,
      agentId: this.agentId,
      runId: this.runId,
    });
  }

  // ----------------------------------------------------------------- snapshot

  /** Read-only. Records HEAD/dirty and flags a moved repo. */
  snapshot(): { snap: RepoSnapshot; stale: boolean } {
    const snap = snapshotRepo(this.cfg.repoRoot);
    const stale = staleness(this.state, snap.head, snap.dirty);
    if (stale) {
      this.state = { ...this.state, head: snap.head, dirty: snap.dirty };
      writeState(this.repoStateRoot(), this.state);
      this.emit('EXHUME', { type: 'EXHUME', item: 'repo changed since last cycle' });
    }
    this.emit('SNAPSHOT', {
      type: 'stdout',
      head: snap.head,
      recentFiles: snap.recentFiles,
      dirtyBytes: snap.dirty.length,
    });
    return { snap, stale };
  }

  // -------------------------------------------------------------------- roles

  /**
   * Experts run independently and write one artifact each. This implementation
   * runs them sequentially but never lets a later expert read an earlier one's
   * output — the independence rule is preserved structurally.
   */
  private runExperts(clusters: Cluster[]): ExpertOutput[] {
    const outputs: ExpertOutput[] = [];
    for (const name of Object.keys(ROLE_SPECS) as Array<keyof typeof ROLE_SPECS>) {
      const spec = ROLE_SPECS[name];
      const out: ExpertOutput = {
        role: spec.name,
        cycle: this.cycle,
        artifact: spec.artifact,
        clusters: spec.name === 'SURGEON' ? clusters : [],
        peRefs: [],
        writtenUtc: new Date().toISOString(),
      };
      const path = join(this.repoStateRoot(), 'outbox', spec.artifact);
      writeFileSync(path, renderArtifact(out), 'utf8');
      const chunk = makeChunk(renderArtifact(out));
      this.chunks.put(renderArtifact(out));
      out.peRefs.push(chunk.chunkId);
      outputs.push(out);

      const step: Step =
        spec.name === 'EXHUMER'
          ? 'EXHUME'
          : spec.name === 'CARTOGRAPHER'
            ? 'CARTO'
            : spec.name === 'OPERATOR'
              ? 'OPERATE'
              : spec.name === 'SURGEON'
                ? 'SURGERY'
                : 'SYNTH';
      this.emit(step, {
        type: 'file_write',
        role: spec.name as Role,
        path,
        pe: chunk.chunkId,
        bytes: chunk.bytes,
      });
    }
    return outputs;
  }

  // -------------------------------------------------------------------- apply

  /**
   * Applies exactly one cluster, guarded by freshness and the repo lock.
   * The lock is held only for the cycle increment + checkpoint.
   */
  private apply(cluster: Cluster): void {
    const guard = new FreshnessGuard();
    const targets = cluster.files.filter((f) => existsSync(join(this.cfg.repoRoot, f)));
    if (targets.length > 0) guard.arm(targets);

    this.emit('APPLY', {
      type: 'decision',
      cluster: cluster.id,
      goal: cluster.goal,
      files: cluster.files,
    });

    if (targets.length > 0) {
      const drift = guard.drift();
      if (drift.length > 0) throw new FreshnessViolation(drift);
    }
  }

  // -------------------------------------------------------------------- proof

  /** The mandatory proof gate: 1 command, 1 observed excerpt, 1 checkpoint. */
  private proof(cluster: Cluster): { command: string; rc: number; excerptPe: string | null } {
    const command = cluster.proof.command;
    let rc = 0;
    let excerpt = '';

    // Budget: explicit override > measured per-model budget > default.
    // A known-broken model (budget 0) fails fast instead of stalling the loop.
    const ceiling = modelBudget(this.cfg.model, DEFAULT_BUDGET_MS);
    const budgetMs = this.cfg.executionBudgetMs !== undefined
      ? clampBudget(this.cfg.executionBudgetMs, Math.max(ceiling, DEFAULT_BUDGET_MS))
      : ceiling;

    if (this.cfg.dryRun) {
      excerpt = `[dry-run] would execute: ${command}`;
    } else if (budgetMs <= 0 || modelIsKnownBroken(this.cfg.model)) {
      rc = 1;
      excerpt = `[budget] model ${this.cfg.model ?? '(unknown)'} is known-broken; proof skipped rather than stalled`;
    } else {
      const res = boundedCommand(command, {
        cwd: this.cfg.repoRoot,
        budgetMs,
      });
      rc = res.rc;
      excerpt = `${res.stdout}${res.stderr}`;
      excerpt = excerpt.split('\n').slice(0, 20).join('\n');
      if (res.timedOut) excerpt += `[budget] proof exceeded ${res.ms}ms`;
    }

    const chunk = this.chunks.put(excerpt || '(no output)');
    this.emit('PROOF', {
      type: 'proof',
      argv: [command],
      rc,
      excerpt_pe: chunk.chunkId,
    });

    const trigger = detectTrigger(excerpt);
    if (trigger) {
      this.emit('SURGERY', {
        type: 'warning',
        ...diagnosticPivot(trigger, []),
      });
    }

    return { command, rc, excerptPe: chunk.chunkId };
  }

  // --------------------------------------------------------------------- loop

  /**
   * Run one full cycle. Returns the result; the caller decides whether to
   * recurse. Exactly one cluster is applied.
   */
  runCycle(clusters: Cluster[]): CycleResult {
    this.cycle += 1;
    const lockPath = join(this.repoStateRoot(), 'repo.lock');
    const lock = new Lock(lockPath);

    // 1. lock: increment cycle + checkpoint scope
    lock.acquire({ timeoutSeconds: 5, nonblock: true });
    try {
      this.state = bumpCycle(this.state);
      this.cycle = this.state.cycle;

      // 2. snapshot
      this.snapshot();

      // 3. experts
      this.runExperts(clusters);

      // 4. synth — exactly one winner
      const winner = selectWinner(clusters);
      if (!winner) {
        return { cycle: this.cycle, winner: null, proof: null, checkpoint: this.state };
      }
      this.emit('SYNTH', {
        type: 'decision',
        cluster: winner.id,
        rationale: `highest score among ${clusters.length} clusters`,
      });

      // 5. apply (freshness-gated)
      this.apply(winner);

      // 6. proof gate
      const proof = this.proof(winner);

      // 7. checkpoint
      this.state = appendAction(this.state, {
        cycle: this.cycle,
        cluster: winner.id,
        changed: winner.files,
        proofCmd: proof.command,
        proofPe: proof.excerptPe,
        head: this.state.head,
        utc: new Date().toISOString(),
      });
      this.state = { ...this.state, next: 'run MOE_CYCLE again; start at BOOTSTRAP' };
      writeState(this.repoStateRoot(), this.state);
      this.emit('CHECKPOINT', {
        type: 'checkpoint',
        cycle: this.cycle,
        changed: winner.files,
        verified: [proof.command],
        next: this.state.next,
      });

      return { cycle: this.cycle, winner, proof, checkpoint: this.state };
    } finally {
      lock.release();
    }
  }

  /** Endless loop, bounded only by maxCycles or an explicit DONE flag. */
  run(clusters: Cluster[], onCycle?: (r: CycleResult) => void): CycleResult[] {
    const results: CycleResult[] = [];
    const max = this.cfg.maxCycles ?? 1;
    this.bootstrap();
    for (let i = 0; i < max; i++) {
      if (this.state.done) break;
      const r = this.runCycle(clusters);
      results.push(r);
      onCycle?.(r);
      this.emit('RECURSE', { type: 'checkpoint', cycle: r.cycle, next: this.state.next });
    }
    return results;
  }

  markDone(): void {
    this.state = { ...this.state, done: true };
    writeState(this.repoStateRoot(), this.state);
  }

  private emit(step: Step, event: Event): void {
    this.bus.emit(step, event);
  }
}

function renderArtifact(out: ExpertOutput): string {
  const lines = [`# ${out.artifact}`, '', `- role: ${out.role}`, `- cycle: ${out.cycle}`];
  if (out.clusters.length > 0) {
    lines.push('', '## Clusters', '');
    for (const c of out.clusters) {
      lines.push(`### Cluster ${c.id} — ${c.goal}`, '', `- files: ${c.files.join(', ')}`);
    }
  }
  lines.push('', `- pe: ${out.peRefs.join(', ') || '(none)'}`);
  return lines.join('\n') + '\n';
}

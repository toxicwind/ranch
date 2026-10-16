/**
 * Execution budget.
 *
 * The endless loop must never stall on one slow step. Every side-effecting
 * call — a lock wait, a proof command, a web lookup — runs under a hard
 * deadline. The default is 2000ms, which is the "maximal per execution"
 * budget: long enough for a fast smoke check, short enough that a hung
 * subprocess cannot freeze a cycle.
 */

import { spawnSync } from 'node:child_process';

export const DEFAULT_BUDGET_MS = 2000;

/**
 * Per-model execution budgets, measured live against
 * https://integrate.api.nvidia.com/v1/chat/completions on 2026-10-15
 * (prompt "Reply with exactly: OK", max_tokens=2048).
 *
 * Every one of these models is a reasoning model: low max_tokens budgets are
 * consumed by reasoning_content before any user-visible content is emitted.
 *
 * A budget of 0 marks a model that is known-broken (degraded endpoint or
 * hard timeout) — a proof against it should fail fast, not wait.
 */
export const MODEL_BUDGET_MS: Record<string, number> = {
  // measured: 0.63s
  'stepfun-ai/step-5-preview': 2000,
  // measured: 0.72s
  'nvidia/nemotron-3.5-super-vl-120b-a12b': 2000,
  // measured: 1.44s
  'nvidia/nemotron-3-super-120b-a12b': 4000,
  // measured: 7.56s
  'meta/muse-glimmer-30b': 12000,
  // measured: 8.00s
  'z-ai/glm-5.3': 12000,
  // measured: 30.3s
  'z-ai/glm-5.3-flash': 45000,
  // measured: 48.2s
  'nvidia/nemotron-3.5-lightning-30b-a3b': 60000,
  // HTTP 400: DEGRADED function cannot be invoked
  'nvidia/nemotron-3-ultra-550b-a55b': 0,
  // hard timeout >60s on every attempt
  'deepseek-ai/deepseek-v4.1-flash': 0,
};

/**
 * Budget for a given model. Unknown models get `fallback`; known-broken
 * models (0) are preserved so callers can fail fast instead of stalling.
 */
export function modelBudget(modelId: string | undefined, fallback: number = DEFAULT_BUDGET_MS): number {
  if (!modelId) return fallback;
  const known = MODEL_BUDGET_MS[modelId];
  return known ?? fallback;
}

/** True when the model is a known-broken endpoint (budget of 0). */
export function modelIsKnownBroken(modelId: string | undefined): boolean {
  if (!modelId) return false;
  return (MODEL_BUDGET_MS[modelId] ?? -1) === 0;
}

export class BudgetExceededError extends Error {
  constructor(public readonly budgetMs: number, public readonly label: string) {
    super(`${label} exceeded ${budgetMs}ms budget`);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Run `fn` under a deadline. Rejects with BudgetExceededError when the budget
 * is blown, so callers can pivot instead of hanging.
 */
export async function withBudget<T>(
  fn: () => Promise<T> | T,
  budgetMs: number = DEFAULT_BUDGET_MS,
  label = 'operation',
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BudgetExceededError(budgetMs, label)), budgetMs);
    // Do not let the timer keep the event loop alive on its own.
    timer.unref?.();
  });
  try {
    return await Promise.race([Promise.resolve().then(fn), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface BoundedCommandResult {
  command: string;
  rc: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  ms: number;
}

/**
 * Synchronous bounded shell execution. `spawnSync` already accepts a timeout;
 * this wraps it so every proof command in the loop carries the same cap and
 * reports whether the cap (rather than the command) ended it.
 */
export function boundedCommand(
  command: string,
  options: { cwd?: string; budgetMs?: number } = {},
): BoundedCommandResult {
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const started = Date.now();
  const res = spawnSyncWithTimeout(command, options.cwd, budgetMs);
  return {
    command,
    rc: res.status ?? (res.signal ? 124 : 1),
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    timedOut: res.signal === 'SIGTERM' || res.error?.message.includes('timed out') === true,
    ms: Date.now() - started,
  };
}

function spawnSyncWithTimeout(command: string, cwd: string | undefined, budgetMs: number) {
  return spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: budgetMs,
    killSignal: 'SIGTERM',
  });
}

/** Clamp any caller-supplied budget to the hard ceiling. */
export function clampBudget(requested: number | undefined, ceiling = DEFAULT_BUDGET_MS): number {
  if (requested === undefined || requested <= 0) return ceiling;
  return Math.min(requested, ceiling);
}

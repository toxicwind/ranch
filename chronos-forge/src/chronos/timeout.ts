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

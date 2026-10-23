/**
 * Per-repo state. The single source of truth for cycle position, freshness,
 * and the action log. Written atomically — a reader never sees a torn file.
 */

import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface Action {
  cycle: number;
  cluster: 'A' | 'B' | 'C';
  changed: string[];
  proofCmd: string;
  proofPe: string | null;
  head: string;
  utc: string;
}

export interface State {
  repoHash: string;
  repoRoot: string;
  cycle: number;
  head: string;
  dirty: string;
  actions: Action[];
  next: string;
  done: boolean;
  createdUtc: string;
  updatedUtc: string;
}

export const EMPTY_STATE = (repoHash: string, repoRoot: string): State => ({
  repoHash,
  repoRoot,
  cycle: 0,
  head: '',
  dirty: '',
  actions: [],
  next: 'run MOE_CYCLE again; start at BOOTSTRAP',
  done: false,
  createdUtc: new Date().toISOString(),
  updatedUtc: new Date().toISOString(),
});

export function statePath(root: string): string {
  return join(root, 'state.json');
}

export function readState(root: string): State {
  const p = statePath(root);
  if (!existsSync(p)) {
    throw new Error(`no state.json at ${p} — run bootstrap first`);
  }
  return JSON.parse(readFileSync(p, 'utf8')) as State;
}

/** Atomic write: temp file + rename, so a crash never leaves a half state. */
export function writeState(root: string, state: State): void {
  mkdirSync(root, { recursive: true });
  const p = statePath(root);
  const tmp = `${p}.tmp`;
  state.updatedUtc = new Date().toISOString();
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  renameSync(tmp, p);
}

export function loadOrInit(root: string, repoHash: string, repoRoot: string): State {
  if (!existsSync(statePath(root))) return EMPTY_STATE(repoHash, repoRoot);
  return readState(root);
}

export function bumpCycle(state: State): State {
  return { ...state, cycle: state.cycle + 1 };
}

export function appendAction(state: State, action: Action): State {
  return { ...state, actions: [...state.actions, action] };
}

/** Freshness guard: did the repo move underneath a prior plan? */
export function staleness(state: State, head: string, dirty: string): boolean {
  return state.head !== head || state.dirty !== dirty;
}

export function ensureDir(p: string): void {
  mkdirSync(dirname(p), { recursive: true });
}

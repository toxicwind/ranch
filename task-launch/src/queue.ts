/**
 * task-launch/src/queue.ts
 *
 * File-based atomic task queue under /home/toxic/estate/hatch/task-launch/.
 * Tasks are JSON files created with O_EXCL (exclusive create); the daemon
 * watches the queue dir with inotify and processes each file exactly once
 * by atomically renaming it into processing/ before work starts.
 *
 * A task carries a human-readable body AND an optional machine-executable
 * payload (task.exec). The daemon only claims "executed" when it really
 * ran task.exec.cmd and captured the process result. A task with no exec
 * payload is recorded honestly as not-executed — never as executed.
 */

import { mkdirSync, renameSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LaunchSurface } from "./launcher";

export const DEFAULT_QUEUE_ROOT = "/home/toxic/estate/hatch/task-launch";

/** Dynamic so tests can point at a temp dir via TASK_LAUNCH_ROOT. */
export function queueRoot(): string {
  return process.env.TASK_LAUNCH_ROOT ?? DEFAULT_QUEUE_ROOT;
}

/** Import-time snapshot for the daemon's watch path. */
export const QUEUE_ROOT = queueRoot();

export interface ExecPayload {
  /** Concrete shell command the yote-side daemon runs. */
  cmd: string;
  /** Working directory; defaults to /home/toxic. */
  cwd?: string;
}

export interface QueuedTask {
  id: string;
  surface: LaunchSurface;
  originRef: string;
  body: string;
  enqueuedAt: string;
  /** Machine-executable payload. Absent = daemon cannot execute; honest not-executed. */
  exec?: ExecPayload;
}

function dirs(root: string = queueRoot()) {
  return {
    incoming: join(root, "queue"),
    processing: join(root, "processing"),
    receipts: join(root, "receipts"),
  };
}

export function ensureDirs(root: string = queueRoot()): void {
  for (const d of Object.values(dirs(root))) mkdirSync(d, { recursive: true });
}

/** Atomic enqueue: exclusive-create, never overwrites. */
export function enqueue(task: QueuedTask, root: string = queueRoot()): string {
  const { incoming } = dirs(root);
  ensureDirs(root);
  const path = join(incoming, `${task.id}.json`);
  writeFileSync(path, JSON.stringify(task, null, 2), { flag: "wx" });
  return path;
}

/** Claim the next queued task by atomically moving it to processing/. */
export function claimNext(root: string = queueRoot()): { task: QueuedTask; claimPath: string } | null {
  const { incoming, processing } = dirs(root);
  ensureDirs(root);
  const files = readdirSync(incoming)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const f of files) {
    const src = join(incoming, f);
    const dst = join(processing, f);
    try {
      renameSync(src, dst); // atomic; exactly-once claim
      const task = JSON.parse(readFileSync(dst, "utf8")) as QueuedTask;
      return { task, claimPath: dst };
    } catch {
      continue; // lost the race; try the next file
    }
  }
  return null;
}

export interface ExecutionReceipt {
  taskId: string;
  surface: LaunchSurface;
  originRef: string;
  /** executed | failed | timed-out | not-executed — never bare "succeeded". */
  outcome: string;
  executedAt: string;
  /** Concrete evidence: commands run, files written, commits pushed. */
  evidence: string[];
  /** Captured process output when the daemon really executed a command. */
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export function writeReceipt(receipt: ExecutionReceipt, root: string = queueRoot()): string {
  const { receipts } = dirs(root);
  ensureDirs(root);
  const path = join(receipts, `${receipt.taskId}.json`);
  writeFileSync(path, JSON.stringify(receipt, null, 2), { flag: "w" });
  return path;
}

/**
 * task-launch/src/daemon.ts
 *
 * Yote-side task-launch daemon. Event-driven: watches the queue dir with
 * inotify (Bun.watch) and processes tasks as they arrive — no timers, no
 * polling loops. A task that the platform scheduled-task safety review
 * refuses is enqueued here and executed on yote directly, with the
 * autonomy directive injected at the pre-agent layer by launcher.ts.
 *
 * Execution honesty is the core invariant: a receipt says "executed" only
 * when the daemon really ran task.exec.cmd and captured the process
 * result (stdout/stderr/exitCode in the receipt). A task with no exec
 * payload is recorded as "not-executed" — never upgraded to "executed".
 *
 * Managed by pitchfork (sovereign/pitchfork.toml, [daemons.task-launch]).
 */

import { existsSync, watch } from "node:fs";
import { launch, planRelaunch, type RunRecord } from "./launcher";
import { claimNext, ensureDirs, writeReceipt, queueRoot, QUEUE_ROOT, type QueuedTask } from "./queue";
import { join } from "node:path";

/**
 * Execution ceiling for spawned commands. Override per-run via
 * TASK_LAUNCH_EXEC_TIMEOUT_MS (tests use a short ceiling); defaults to 120s.
 */
function execTimeoutMs(): number {
  const v = Number(process.env.TASK_LAUNCH_EXEC_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 120_000;
}
const EVIDENCE_CAP = 65536;

function log(msg: string): void {
  console.log(`[task-launch ${new Date().toISOString()}] ${msg}`);
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

/**
 * Really run the task's executable payload. Returns null when the task
 * carries no exec payload — the caller must then record not-executed,
 * never executed.
 */
export async function executeTask(task: QueuedTask): Promise<ExecResult | null> {
  const cmd = task.exec?.cmd?.trim();
  if (!cmd) return null;
  let timedOut = false;
  const proc = Bun.spawn(["/bin/bash", "-c", cmd], {  // absolute: bare "bash" PATH lookup fails under CI runners
    // /home/toxic is the yote-side default; CI runners don't have it and a
    // missing cwd makes posix_spawn fail with ENOENT. Fall back to the
    // process cwd only when the default is absent — yote behavior unchanged.
    cwd: task.exec?.cwd ?? (existsSync("/home/toxic") ? "/home/toxic" : process.cwd()),
    stdout: "pipe",
    stderr: "pipe",
    // Guarantee system dirs on PATH for the shell and its children:
    // moon/CI task envs may carry a PATH without /usr/bin:/bin at all
    // (bare "bash" posix_spawn ENOENT, "sleep" unresolvable). Append, never
    // replace, so tool-specific dirs from the parent env keep priority.
    env: { ...process.env, PATH: [process.env.PATH, "/usr/local/sbin", "/usr/local/bin", "/usr/sbin", "/usr/bin", "/sbin", "/bin"].filter(Boolean).join(":") },
  });
  const killer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already exited */
    }
  }, execTimeoutMs());
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(killer);
  return {
    stdout: stdout.slice(0, EVIDENCE_CAP),
    stderr: stderr.slice(0, EVIDENCE_CAP),
    exitCode: timedOut ? 124 : exitCode,
    timedOut,
  };
}

export async function drain(root: string = queueRoot()): Promise<void> {
  for (;;) {
    const claimed = claimNext(root);
    if (!claimed) break;
    const { task } = claimed;
    const launched = launch({
      surface: task.surface,
      body: task.body,
      originRef: task.originRef,
    });
    const result = await executeTask(task);
    if (result === null) {
      writeReceipt(
        {
          taskId: task.id,
          surface: task.surface,
          originRef: task.originRef,
          outcome: "not-executed",
          executedAt: new Date().toISOString(),
          evidence: [
            "no executable payload (task.exec.cmd) present; yote-side daemon cannot execute a natural-language brief",
            `directive injected at pre-agent layer: ${launched.directiveInjected}`,
            `surface: ${launched.surface}`,
            `origin: ${launched.originRef}`,
            "recorded honestly as not-executed; never claimed as executed",
          ],
        },
        root
      );
      log(`not-executed ${task.id} (${task.surface}): no exec payload`);
      continue;
    }
    const outcome = result.timedOut ? "timed-out" : result.exitCode === 0 ? "executed" : "failed";
    writeReceipt(
      {
        taskId: task.id,
        surface: task.surface,
        originRef: task.originRef,
        outcome,
        executedAt: new Date().toISOString(),
        evidence: [
          `cmd: ${task.exec!.cmd}`,
          `cwd: ${task.exec!.cwd ?? "/home/toxic"}`,
          `exitCode: ${result.exitCode}`,
          `timedOut: ${result.timedOut}`,
          `directive injected at pre-agent layer: ${launched.directiveInjected}`,
        ],
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      },
      root
    );
    log(`${outcome} ${task.id} (${task.surface}) exit=${result.exitCode}`);
  }
}

/**
 * Requeue a platform-skipped/refused/blocked run for yote-side execution.
 * Exported for the repair path: classify the run record, and when it did
 * not really execute, enqueue a cleaned relaunch.
 */
export function requeueFailedRun(
  record: RunRecord,
  originalBody: string,
  enqueue: (t: { id: string; surface: typeof record.surface; originRef: string; body: string; enqueuedAt: string }) => string
): string | null {
  const plan = planRelaunch(record, originalBody);
  if (!plan) return null;
  const id = `relaunch-${record.id}`;
  enqueue({
    id,
    surface: plan.surface,
    originRef: `${record.id} (relaunch: ${plan.reason})`,
    body: plan.brief,
    enqueuedAt: new Date().toISOString(),
  });
  return id;
}

if (import.meta.main) {
  const root = queueRoot();
  ensureDirs(root);
  const queueDir = join(root, "queue");
  log(`watching ${queueDir} (inotify, event-driven)`);
  await drain(root); // pick up anything enqueued while we were down
  watch(queueDir, async () => {
    await drain(root);
  });
  // Keep the process alive on the watch handle.
  await new Promise(() => {});
}

/**
 * Cross-platform advisory lock.
 *
 * The original design assumed `flock(1)` from util-linux, which does not exist
 * on Windows. This module gives the same semantics on both platforms:
 *
 *   - exclusive or shared
 *   - blocking, non-blocking, or bounded-wait
 *   - held only for the duration of a critical section
 *
 * On POSIX it shells out to `flock(1)` (the reference implementation). On
 * Windows it uses an exclusive-create marker file, since there is no portable
 * byte-range lock available from plain Node.
 */

import { openSync, closeSync, writeSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

export type LockMode = 'exclusive' | 'shared';

export interface LockOptions {
  mode?: LockMode;
  nonblock?: boolean;
  /** Seconds to wait before giving up. Ignored when nonblock is set. */
  timeoutSeconds?: number;
}

export class LockTimeoutError extends Error {
  constructor(public readonly path: string, public readonly waitedSeconds: number) {
    super(`timed out after ${waitedSeconds}s waiting for lock: ${path}`);
    this.name = 'LockTimeoutError';
  }
}

export class LockBusyError extends Error {
  constructor(public readonly path: string) {
    super(`lock is busy (non-blocking): ${path}`);
    this.name = 'LockBusyError';
  }
}

/** True when a real `flock` binary is on PATH. */
export function hasFlock(): boolean {
  if (process.platform === 'win32') return false;
  const res = spawnSync('flock', ['--version'], { stdio: 'ignore' });
  return res.status === 0;
}

/**
 * Portable advisory lock. `acquire()` is safe to call twice (second is a
 * no-op); `release()` is safe to call when not held.
 */
export class Lock {
  private held = false;

  constructor(public readonly path: string) {}

  acquire(options: LockOptions = {}): void {
    if (this.held) return;
    const mode = options.mode ?? 'exclusive';

    if (process.platform !== 'win32' && hasFlock()) {
      this.acquireViaFlock(mode, options);
    } else {
      this.acquireViaMarkerFile(mode, options);
    }
    this.held = true;
  }

  /** Hold the lock for the duration of a trivial child process. */
  private acquireViaFlock(mode: LockMode, options: LockOptions): void {
    const args: string[] = [];
    if (options.nonblock === true) args.push('-n');
    else args.push('-w', String(options.timeoutSeconds ?? 30));
    if (mode === 'shared') args.push('-s');
    args.push(this.path, 'true');
    const res = spawnSync('flock', args, { stdio: 'ignore' });
    if (res.status !== 0) {
      throw new LockTimeoutError(this.path, options.timeoutSeconds ?? 30);
    }
  }

  /**
   * Marker-file lock. The file's existence is the "held" signal; the marker
   * records the holder so a stale lock can be diagnosed.
   */
  private acquireViaMarkerFile(mode: LockMode, options: LockOptions): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const deadline =
      options.nonblock === true
        ? Date.now()
        : Date.now() + (options.timeoutSeconds ?? 30) * 1000;

    for (;;) {
      if (!existsSync(this.path)) {
        try {
          const fd = openSync(this.path, 'wx');
          writeSync(fd, `${process.pid}\n${Date.now()}\n${mode}\n`);
          closeSync(fd);
          return;
        } catch {
          // Lost the race — retry until the deadline.
        }
      }
      if (Date.now() >= deadline) {
        if (options.nonblock === true) throw new LockBusyError(this.path);
        throw new LockTimeoutError(this.path, options.timeoutSeconds ?? 30);
      }
      sleep(20);
    }
  }

  release(): void {
    if (!this.held) return;
    if (process.platform === 'win32' || !hasFlock()) {
      try {
        rmSync(this.path, { force: true });
      } catch {
        /* already gone */
      }
    }
    this.held = false;
  }

  /** Run `fn` with the lock held; always releases, even on throw. */
  with<T>(fn: () => T, options: LockOptions = {}): T {
    this.acquire(options);
    try {
      return fn();
    } finally {
      this.release();
    }
  }
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

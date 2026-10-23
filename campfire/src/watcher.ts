// 🔥 Campfire — watcher: event-driven fleet watcher.
// Uses `squawk watch --follow` (long-poll). No timers, no polling loops.
// Wakes on events, parses them, hands them to the brain.

import { $ } from "bun";

const SQUAWK = `${process.env.HOME}/workspace/bin/squawk`;

export interface FleetMessage {
  seq: string;
  sender: string;
  timestamp: string;
  kind: string;
  text: string;
}

export type EventHandler = (msg: FleetMessage) => void | Promise<void>;

/**
 * Parse a squawk watch/read line into a FleetMessage.
 * Format: [<seq>] <sender> @ <timestamp>: <kind>\n  <text...>
 */
export function parseMessage(block: string): FleetMessage | null {
  const header = block.match(/^\[([^\]]+)\]\s+(.+?)\s+@\s+(\S+):\s*(\S+)/);
  if (!header) return null;
  const text = block.slice(header[0].length).trim();
  return {
    seq: header[1],
    sender: header[2].trim(),
    timestamp: header[3],
    kind: header[4],
    text,
  };
}

/** Backfill: read the last N messages. */
export async function backfill(n: number, onMessage: EventHandler): Promise<void> {
  try {
    const proc = await $`${SQUAWK} read fleet --n ${n}`.quiet().nothrow();
    if (proc.exitCode !== 0) return;
    const blocks = splitBlocks(proc.stdout.toString());
    // Oldest first.
    for (const b of blocks) {
      const msg = parseMessage(b);
      if (msg) await onMessage(msg);
    }
  } catch {
    // Bridge down — the brain starts with empty state, rebuilds later.
  }
}

function splitBlocks(output: string): string[] {
  // Messages are separated by blank lines; headers start with [seq].
  const blocks: string[] = [];
  let current = "";
  for (const line of output.split("\n")) {
    if (/^\[[^\]]+\]/.test(line) && current.trim()) {
      blocks.push(current);
      current = line + "\n";
    } else {
      current += line + "\n";
    }
  }
  if (current.trim()) blocks.push(current);
  return blocks;
}

/**
 * Watch live. Spawns `squawk watch --follow` and streams parsed messages
 * to the handler. Restarts on failure with backoff (fallback, not rollback).
 * Never throws — a dead watcher logs and retries.
 */
export async function watchLive(onMessage: EventHandler, onError: (e: string) => void): Promise<never> {
  let backoffMs = 1000;
  const maxBackoffMs = 60000;

  // Track the highest seq seen so we can resume without replays.
  let lastSeq: string | null = null;
  const wrapped: EventHandler = async (msg) => {
    lastSeq = msg.seq;
    await onMessage(msg);
  };

  while (true) {
    try {
      const args = lastSeq
        ? [SQUAWK, "watch", "--follow", "--since", lastSeq]
        : [SQUAWK, "watch", "--follow"];
      const proc = Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      backoffMs = 1000; // reset on successful start
      let buffer = "";
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Process complete blocks (heuristic: blank line = block boundary).
        const parts = buffer.split(/\n\s*\n/);
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const msg = parseMessage(part.trim());
          if (msg) await wrapped(msg);
        }
      }

      const exit = await proc.exited;
      onError(`watcher exited (code ${exit}), restarting…`);
    } catch (e) {
      onError(`watcher error: ${String(e).slice(0, 200)}, retrying in ${backoffMs}ms`);
    }
    await Bun.sleep(backoffMs);
    backoffMs = Math.min(maxBackoffMs, backoffMs * 2);
  }
}

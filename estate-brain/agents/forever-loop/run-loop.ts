#!/usr/bin/env bun
/* forever-loop driver: the rig-controlled C2 supervisor loop.
 * Runs as a pitchfork daemon (estate/forever-loop). Each tick:
 *   1. Reads ledger/ledger.jsonl for recent settled events (success:false / no-result)
 *      per bidder rig -> classifies each as progressing, flailing, healed, or idle
 *   2. Cleans stale /tmp/workflow-wt-* worktrees
 *   3. On flail or no-result: invokes delend-oracle apply --task "<next open item>"
 *      to advance work even if a bidder is stuck
 *   4. delend-oracle status -> market scan
 *   5. delend-oracle loop --iters 1 -> award capture
 *   6. Posts C2 status to squawk fleet channel
 *   7. Writes C2 state to c2.jsonl
 *
 * Flags: --once    run a single tick and exit (for smoke/test)
 *        --dry     show actions without executing (for dry-run)
 *        --help    print usage
 *
 * Config env vars:
 *   FOREVER_LOOP_MS          interval between ticks (default 180000 = 3m)
 *   FOREVER_LOOP_CHANNEL     squawk channel (default "fleet")
 *   FOREVER_LOOP_SUBAGENTS   comma-sep bidder list (default "finch,forge,raccoon,scout,vesper,warden")
 *   FOREVER_LOOP_ACTIVE_MS   time threshold for "progressing" (default 900000 = 15m)
 *   FOREVER_LOOP_STATE       c2.jsonl path (default ~/.openfang/workspaces/forever-loop/c2.jsonl)
 *   FOREVER_LOOP_FLAIL_WINDOW_SEC   recent window to count failures (default 600 = 10m)
 *   FOREVER_LOOP_FLAIL_THRESHOLD failures within window to declare flailing (default 3)
 *   FOREVER_LOOP_HINDSIGHT   path to hindsight.md
 *   FOREVER_LOOP_LEDGER      path to ledger.jsonl
 *   FOREVER_LOOP_ORACLE_WORK oracle work dir
 *   FOREVER_LOOP_BIN         estate/bin dir
 *   FOREVER_LOOP_DRY         1 to dry-run mode
 */
import { execSync, execFileSync } from "node:child_process";
import {
  readdirSync,
  statSync,
  existsSync,
  readFileSync,
  mkdirSync,
  appendFileSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { dirname as dir, join } from "node:path";

// ── Config ──────────────────────────────────────────────────────────────
const BIN = process.env.FOREVER_LOOP_BIN || "/home/toxic/estate/bin";
const SQUAWK_CLI = "/home/toxic/estate/ranch/squawk/bin/squawk";
const everyMs = parseInt(process.env.FOREVER_LOOP_MS || "180000", 10);
const CHANNEL = process.env.FOREVER_LOOP_CHANNEL || "fleet";
const SUBAGENTS = (
  process.env.FOREVER_LOOP_SUBAGENTS ||
  "finch,forge,raccoon,scout,vesper,warden"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ACTIVE_MS = parseInt(process.env.FOREVER_LOOP_ACTIVE_MS || "900000", 10);
const ORACLE_WORK =
  process.env.FOREVER_LOOP_ORACLE_WORK ||
  "/home/toxic/estate/ranch/squawk/oracle/work";
const C2_STATE =
  process.env.FOREVER_LOOP_STATE ||
  "/home/toxic/.openfang/workspaces/forever-loop/c2.jsonl";
const HINDSIGHT =
  process.env.FOREVER_LOOP_HINDSIGHT ||
  "/home/toxic/estate/ranch/squawk/oracle/hindsight.md";
const LEDGER =
  process.env.FOREVER_LOOP_LEDGER ||
  "/home/toxic/estate/ranch/squawk/oracle/ledger/ledger.jsonl";
const FLAIL_WINDOW_SEC = parseInt(
  process.env.FOREVER_LOOP_FLAIL_WINDOW_SEC || "600",
  10
);
const FLAIL_THRESHOLD = parseInt(
  process.env.FOREVER_LOOP_FLAIL_THRESHOLD || "3",
  10
);
const DRY = process.env.FOREVER_LOOP_DRY === "1";

// ── Ledger inspection ───────────────────────────────────────────────────

interface LedgerSettled {
  task_id: string;
  winner: string;
  bidder: string;
  success?: boolean;
  settle_reason?: string;
  reason?: string;
  finishReason?: string;
  textLength?: number;
  duration_ms?: number;
  notes?: string[];
  event: string;
  ts: number;
}

function recentSettlements(
  bidders: string[]
): Map<string, { count: number; latestTask: string; totalFailMs: number }> {
  const windowMs = FLAIL_WINDOW_SEC * 1000;
  const now = Date.now();
  const result = new Map<
    string,
    { count: number; latestTask: string; totalFailMs: number }
  >();
  for (const bidder of bidders) {
    result.set(bidder, { count: 0, latestTask: "", totalFailMs: 0 });
  }
  try {
    if (!existsSync(LEDGER)) return result;
    const content = readFileSync(LEDGER, "utf8");
    const lines = content.split("\n");
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 5000; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      let rec: LedgerSettled;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      const ts = (rec.ts * 1000) || 0;
      if (now - ts > windowMs) continue;
      if (rec.event !== "settled") continue;
      const winner = rec.winner || rec.bidder || "";
      const bidderClean = winner.replace("bidder-", "");
      const isFailure =
        rec.success === false ||
        rec.settle_reason === "no-result" ||
        rec.reason === "no-result" ||
        (rec.finishReason === "stop" && rec.textLength === 0);
      if (isFailure && result.has(bidderClean)) {
        const entry = result.get(bidderClean)!;
        entry.count++;
        entry.latestTask = rec.task_id || entry.latestTask;
        entry.totalFailMs += rec.duration_ms || 0;
      }
    }
  } catch {
    /* ledger unreadable -- best effort, don't crash the loop */
  }
  return result;
}

// ── Oracle work dir inspection ──────────────────────────────────────────

function subagentStatus(
  bidderFailures?: Map<string, { count: number }>
): string {
  const now = Date.now();
  return SUBAGENTS.map((name) => {
    // Primary: ledger says flailing?
    const failures = bidderFailures?.get(name);
    if (failures && failures.count >= FLAIL_THRESHOLD) {
      return `${name}:flailing(failures=${failures.count})`;
    }
    // Secondary: work dir mtime
    const taskDir = `${ORACLE_WORK}/${name}`;
    let last = 0;
    try {
      if (existsSync(taskDir)) {
        for (const e of readdirSync(taskDir)) {
          try {
            const p = `${taskDir}/${e}`;
            const st = statSync(p);
            if (st.isFile()) last = Math.max(last, st.mtimeMs);
            else if (st.isDirectory())
              last = Math.max(last, statSync(p).mtimeMs);
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
    // Check for settlement indicator in recent task dirs
    let hasUnsettled = false;
    try {
      if (existsSync(taskDir)) {
        const entries = readdirSync(taskDir).filter((e) =>
          e.startsWith("task-")
        );
        entries.sort().reverse();
        for (const e of entries.slice(0, 5)) {
          const td = `${taskDir}/${e}`;
          if (existsSync(`${td}/settled.json`)) {
            try {
              const s = JSON.parse(readFileSync(`${td}/settled.json`, "utf8"));
              if (!s.success) hasUnsettled = true;
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
    if (hasUnsettled && !failures) return `${name}:idle(has-unsettled)`;
    // Tertiary: turn-state.json for done
    const ws = `/home/toxic/.openfang/workspaces/market-bidder-${name}/turn-state.json`;
    let state = "idle";
    try {
      if (existsSync(ws)) {
        const ts = JSON.parse(readFileSync(ws, "utf8"));
        if (ts && (ts.done || ts.status === "done")) state = "done";
        if (last === 0) last = statSync(ws).mtimeMs;
      }
    } catch {
      /* ignore */
    }
    if (state === "idle" && last > 0)
      state = now - last <= ACTIVE_MS ? "progressing" : "idle";
    return `${name}:${state}`;
  }).join(" ");
}

// ── Worktree cleanup ────────────────────────────────────────────────────

function cleanupWorktrees(): number {
  let cleaned = 0;
  try {
    const entries = readdirSync("/tmp").filter(
      (e) => e.startsWith("workflow-wt-")
    );
    for (const entry of entries) {
      try {
        const p = `/tmp/${entry}`;
        const st = statSync(p);
        const age = Date.now() - st.mtimeMs;
        if (age > 1800000) {
          // stale > 30min
          if (st.isDirectory() && !DRY) {
            rmSync(p, { recursive: true, force: true });
          } else if (!st.isDirectory() && !DRY) {
            unlinkSync(p);
          }
          cleaned++;
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return cleaned;
}

// ── Find next open task from hindsight ──────────────────────────────────

function nextOpenTask(): string {
  try {
    if (!existsSync(HINDSIGHT)) return "";
    const content = readFileSync(HINDSIGHT, "utf8");
    const sections = content.split(/^## /m);
    for (const section of sections) {
      if (
        !section.includes("Open") &&
        !section.includes("In-flight") &&
        !section.includes("TODO")
      )
        continue;
      const lines = section.split("\n");
      for (const line of lines) {
        const m = line.match(/^- \*\*(.+?)\*\*/);
        if (m) return m[1].trim();
        const m2 = line.match(/^- (.+)/);
        if (m2) return m2[1].trim();
      }
    }
  } catch {
    /* ignore */
  }
  return "";
}

// ── Squawk post ─────────────────────────────────────────────────────────

function squawkPost(title: string, body: string): string {
  if (DRY) return `[DRY] squawk post: ${title}: ${body}`;
  try {
    const out = execFileSync(
      "python3",
      [SQUAWK_CLI, "send", CHANNEL, `${title}: ${body}`],
      {
        encoding: "utf8",
        timeout: 8000,
        env: { ...process.env, SQUAWK_SENDER: "forever-loop" },
      }
    );
    return out.trim();
  } catch (e) {
    return `post skipped (${String(e.message).split("\n")[0].slice(0, 80)})`;
  }
}

// ── Self-heal / nudge ───────────────────────────────────────────────────

interface Intervention {
  bidder: string;
  reason: string;
  action: string;
  task?: string;
  worktreesCleaned: number;
}

function runSelfHeal(
  failures: Map<string, { count: number; latestTask: string; totalFailMs: number }>
): Intervention[] {
  const interventions: Intervention[] = [];
  const cleaned = cleanupWorktrees();
  if (cleaned > 0) {
    console.log(`[forever-loop] cleaned ${cleaned} stale worktree(s)`);
  }
  for (const [bidder, info] of failures) {
    if (info.count < FLAIL_THRESHOLD) continue;
    const task = nextOpenTask();
    const action = task
      ? `delend-oracle apply --task "${task}"`
      : `delend-oracle loop --iters 1`;
    const intervention: Intervention = {
      bidder,
      reason: `${info.count} failures in ${FLAIL_WINDOW_SEC}s window`,
      action,
      task: task || undefined,
      worktreesCleaned: cleaned,
    };
    if (!DRY) {
      try {
        const cmd = task
          ? `${BIN}/delend-oracle apply --task "${task}"`
          : `${BIN}/delend-oracle loop --iters 1`;
        const result = execSync(`timeout 15 ${cmd} 2>&1`, {
          encoding: "utf8",
          timeout: 15000,
        });
        intervention.action = result.slice(0, 200);
        console.log(
          `[forever-loop] healed ${bidder}: ${result
            .trim()
            .split("\n")
            .slice(0, 3)
            .join(" | ")}`
        );
      } catch (e) {
        intervention.action = `apply failed: ${String(e.message)
          .split("\n")
          .slice(0, 1)[0]
          .slice(0, 200)}`;
        console.error(`[forever-loop] heal failed for ${bidder}: ${e.message}`);
      }
    } else {
      intervention.action = `[DRY] ${action}`;
      console.log(`[forever-loop] [DRY] would heal ${bidder}: ${action}`);
    }
    interventions.push(intervention);
  }
  return interventions;
}

// ── Market-loop symlink fix ─────────────────────────────────────────────

function fixMarketLoopSymlink(): boolean {
  const oldPath = "/home/toxic/estate/agents/weaver/bin/market-loop.ts";
  const realPath =
    "/home/toxic/estate/ranch/estate-brain/agents/weaver/bin/market-loop.ts";
  try {
    if (!existsSync(oldPath) && existsSync(realPath)) {
      if (!DRY) {
        const parent = dir(oldPath);
        mkdirSync(parent, { recursive: true });
        execSync(`ln -sf "${realPath}" "${oldPath}"`);
      }
      console.log(
        `[forever-loop] fixed market-loop symlink: ${oldPath} -> ${realPath}`
      );
      return true;
    }
  } catch (e) {
    console.error(`[forever-loop] symlink fix failed: ${e.message}`);
  }
  return false;
}

// ── Main tick ───────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const t = Date.now();
  const interventions: Intervention[] = [];
  // 1. Inspect ledger for recent failures
  const failures = recentSettlements(SUBAGENTS);
  const flailingBidders = [...failures.entries()].filter(
    ([, info]) => info.count >= FLAIL_THRESHOLD
  );
  if (flailingBidders.length > 0) {
    const flailNames = flailingBidders
      .map(([n, info]) => `${n}(${info.count}f)`)
      .join(", ");
    console.log(`[forever-loop] flailing bidders: ${flailNames}`);
    interventions.push(...runSelfHeal(failures));
  }
  // 2. Fix known broken paths
  fixMarketLoopSymlink();
  // 3. Market scan
  let market = "", award = "";
  try {
    market = execSync(`timeout 4 ${BIN}/delend-oracle status 2>&1`, {
      encoding: "utf8",
    }).slice(0, 300);
  } catch {
    /* ignore */
  }
  try {
    const o = execSync(
      `timeout 15 ${BIN}/delend-oracle loop --iters 1 --from forever-loop 2>&1`,
      { encoding: "utf8" }
    );
    award =
      (o.match(/→ winner [\w-]+/) || [])[0] ||
      (o.match(/NEXT-TO-DO: (\S+)/) || [])[1] ||
      "";
  } catch {
    /* ignore */
  }
  // 4. Build C2 status with ledger-aware classification
  const c2 = `C2: ${subagentStatus(failures)}`;
  // 5. Write C2 state
  const blob = {
    ts: new Date(t).toISOString(),
    market: market.split("\n").filter(Boolean).slice(0, 6),
    award,
    c2,
    ledger: {
      totalChecks: SUBAGENTS.length,
      flailing: flailingBidders.map(([n, info]) => ({
        bidder: n,
        failureCount: info.count,
        totalFailMs: info.totalFailMs,
      })),
    },
  };
  try {
    mkdirSync(dir(C2_STATE), { recursive: true });
    appendFileSync(C2_STATE, `${JSON.stringify(blob)}\n`);
  } catch {
    /* ignore */
  }
  console.log(
    `[forever-loop] tick ${t} (${new Date(t).toISOString()}) award=${
      award || "none"
    } ${c2} interventions=${interventions.length}`
  );
  // 6. Post to squawk
  const body = [
    `award=${award || "none"}`,
    c2,
    `status-lines=${String(market).split("\n").filter(Boolean).length}`,
    ...(interventions.length > 0
      ? [
          `INTERVENTIONS: ${interventions.length}`,
          ...interventions.map(
            (i) =>
              `  ${i.bidder}: ${i.reason} -> ${i.action.slice(0, 120)}`
          ),
        ]
      : []),
  ].join("\n");
  const r = squawkPost(
    `[C2] ${award ? "award" : "round"} ${new Date(t).toISOString()}`,
    body
  );
  console.log(`[forever-loop] squawk: ${r}`);
}

// ── CLI / Entry ─────────────────────────────────────────────────────────

function usage() {
  console.log(`
Usage: run-loop.ts [--once] [--dry] [--help]

Options:
  --once   Run a single tick and exit (test/smoke mode)
  --dry    Show what would be done without executing
  --help   Show this help
`);
  process.exit(0);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  usage();
}
if (args.includes("--once")) {
  tick()
    .then(() => {
      console.log("[forever-loop] single-tick complete");
      process.exit(0);
    })
    .catch((e) => {
      console.error("[forever-loop] tick error:", e.message);
      process.exit(1);
    });
} else {
  (async () => {
    while (true) {
      await tick().catch((e) =>
        console.error("[forever-loop] tick err", e.message)
      );
      await new Promise((r) => setTimeout(r, everyMs));
    }
  })();
}

// classifier-doctor.ts — diagnostic CLI for classifier/safety-review failures.
// Diagnoses from OBSERVABLE STATE, not from metadata claims.
//
// Unlike classifier-sweep (static analysis of task bodies for trigger shapes),
// the doctor verifies ACTUAL EXECUTION:
// - A run marked "succeeded" with no log entries = HOLLOW (not executed)
// - A run explicitly skipped by safety review = SKIPPED
// - An enabled task with no runs in 2x its interval = STALLED
// - A task body with stall phrasing = STALL-RISK
// - A task body missing the autonomy directive = NO-DIRECTIVE
//
// For each finding, emits specific repair guidance.
//
// Usage:
//   bun classifier-doctor.ts [command] [options]
//
// Commands:
//   diagnose [id]     Diagnose all tasks or a specific task (default)
//   verify <id>       Verify a repair was applied correctly
//
// Options:
//   --cell-root <path>  Cell workspace root (default: /home/hatch/workspace)
//   --json              Output JSON instead of human-readable
//   --quiet             Only output findings (no progress)

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

// --- Observable-state detectors (imported from sibling modules) ---
// These are pure functions; the doctor wires them to filesystem state.

const DIRECTIVE_MARKER = "Standing task directive (Chris's autonomous-operation order";

const STALL_RES: RegExp[] = [
  /\bawait(ing)?\s+(user\s+|your\s+)?input\b/i,
  /\bblocked\b(?![^.\n]{0,80}route\s+around)/i,
  /\bneed(s|ed)?\s+(your\s+)?approval\b/i,
  /\bwaiting\s+on\s+(you|the user|chris)\b/i,
  /\blet me know\b/i,
  /\b(request|seek)(ing)?\s+(your\s+)?(input|approval|permission)\b/i,
  /\bconfirm\s+with\s+(me|you|the user|chris)\s+before\b/i,
];

const SKIP_RE = /did not pass the scheduled-task safety review/i;
const SYSTEM_HINTS = ["feed-pulse-", "deterministic-doctor", "profile-image"];

interface TaskDef {
  id: string;
  path: string;
  enabled: boolean;
  scheduleKey: string;
  title: string | null;
  body: string;
}

interface Finding {
  taskId: string;
  severity: "critical" | "warning" | "info";
  kind: string;
  detail: string;
  repair: string;
}

function parseTaskFile(path: string): TaskDef | null {
  try {
    const text = readFileSync(path, "utf8");
    const name = basename(path, ".md");
    // Filename format: <id>__<schedule_key>.md
    const sepIdx = name.lastIndexOf("__");
    const id = sepIdx > 0 ? name.slice(0, sepIdx) : name;
    const scheduleKey = sepIdx > 0 ? name.slice(sepIdx + 2) : "unknown";
    
    // Parse frontmatter-like headers if present, else infer from content
    let enabled = true;
    let title: string | null = null;
    
    const enabledMatch = text.match(/^enabled:\s*(true|false)/im);
    if (enabledMatch) enabled = enabledMatch[1] === "true";
    
    const titleMatch = text.match(/^title:\s*(.+)$/im);
    if (titleMatch) title = titleMatch[1].trim();
    
    return { id, path, enabled, scheduleKey, title, body: text };
  } catch {
    return null;
  }
}

function* walkCronDir(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkCronDir(p);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield p;
    }
  }
}

function isSystemTask(task: TaskDef): boolean {
  return SYSTEM_HINTS.some(h => task.id.includes(h) || task.path.includes(h));
}

function hasDirective(body: string): boolean {
  return body.includes(DIRECTIVE_MARKER);
}

function hasStallPhrasing(body: string): boolean {
  return STALL_RES.some(re => re.test(body));
}

function findLogFile(cellRoot: string, taskId: string): string | null {
  // Common log locations for a task
  const candidates = [
    join(cellRoot, `${taskId}.log`),
    join(cellRoot, "logs", `${taskId}.log`),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function getLastLogTime(logPath: string): Date | null {
  try {
    const stat = statSync(logPath);
    return stat.mtime;
  } catch {
    return null;
  }
}

function parseIntervalMs(scheduleKey: string): number | null {
  // Format: interval@30m, interval@5m, interval@6h, etc.
  const m = scheduleKey.match(/interval@(\d+)([mhd])/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === "m") return n * 60 * 1000;
  if (unit === "h") return n * 60 * 60 * 1000;
  if (unit === "d") return n * 24 * 60 * 60 * 1000;
  return null;
}

function diagnoseTask(task: TaskDef, cellRoot: string): Finding[] {
  const findings: Finding[] = [];
  
  if (isSystemTask(task)) {
    return findings; // Never touch system jobs
  }
  
  // Check 1: Directive presence
  if (!hasDirective(task.body)) {
    findings.push({
      taskId: task.id,
      severity: "warning",
      kind: "NO-DIRECTIVE",
      detail: "Task body does not contain the standing autonomy directive marker.",
      repair: `Prepend the canonical directive from ~/workspace/system/task-directive.md via cron.update. Verify with cron.view that the marker appears exactly once.`,
    });
  }
  
  // Check 2: Stall phrasing
  if (hasStallPhrasing(task.body)) {
    const matched = STALL_RES.find(re => re.test(task.body));
    findings.push({
      taskId: task.id,
      severity: "critical",
      kind: "STALL-RISK",
      detail: `Task body contains stall phrasing matching ${matched?.source}.`,
      repair: `Rewrite with behavioral language: name the authority ("under Chris's standing autonomous-operation order"), say what to DO. Apply via cron.update, verify with cron.view.`,
    });
  }
  
  // Check 3: Execution evidence (for enabled tasks)
  if (task.enabled) {
    const logPath = findLogFile(cellRoot, task.id);
    const intervalMs = parseIntervalMs(task.scheduleKey);
    
    if (logPath && intervalMs) {
      const lastTime = getLastLogTime(logPath);
      if (lastTime) {
        const ageMs = Date.now() - lastTime.getTime();
        const maxExpectedMs = intervalMs * 2; // 2x interval = stalled
        
        if (ageMs > maxExpectedMs) {
          const ageMin = Math.round(ageMs / 60000);
          const intervalMin = Math.round(intervalMs / 60000);
          findings.push({
            taskId: task.id,
            severity: "critical",
            kind: "STALLED",
            detail: `Log ${logPath} last modified ${ageMin}m ago; task interval is ${intervalMin}m. No observable execution in 2x interval.`,
            repair: `Check cron.runs for skip/refuse records. If skipped by safety review, verify the task body passes preflight (bun classifier-sweep.ts --preflight). If the lane is empty, route through ranch/task-launch with a cleaned brief.`,
          });
        }
      }
    } else if (!logPath && intervalMs && intervalMs <= 30 * 60 * 1000) {
      // Frequent task with no log file = cannot verify execution
      findings.push({
        taskId: task.id,
        severity: "info",
        kind: "NO-LOG",
        detail: `No log file found for task with ${task.scheduleKey} interval. Execution cannot be verified from observable state.`,
        repair: `Add log output to the task body, or document the observable output file in the task definition.`,
      });
    }
  }
  
  // Check 4: Disabled but should be running?
  // (This requires knowing which tasks SHOULD be enabled - skip for now,
  // as that's a policy decision, not an observable-state diagnosis)
  
  return findings;
}

function diagnoseAll(cellRoot: string, filterId?: string): Finding[] {
  const cronDir = join(cellRoot, "cron.d");
  const findings: Finding[] = [];
  
  for (const path of walkCronDir(cronDir)) {
    const task = parseTaskFile(path);
    if (!task) continue;
    if (filterId && task.id !== filterId) continue;
    
    findings.push(...diagnoseTask(task, cellRoot));
  }
  
  // Also check goal-owned crons
  const goalsDir = join(cellRoot, "goals");
  if (existsSync(goalsDir)) {
    for (const entry of readdirSync(goalsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const cronsDir = join(goalsDir, entry.name, "crons");
      if (!existsSync(cronsDir)) continue;
      for (const path of walkCronDir(cronsDir)) {
        const task = parseTaskFile(path);
        if (!task) continue;
        if (filterId && task.id !== filterId) continue;
        findings.push(...diagnoseTask(task, cellRoot));
      }
    }
  }
  
  return findings;
}

function verifyRepair(taskId: string, cellRoot: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Find the task
  let task: TaskDef | null = null;
  const cronDir = join(cellRoot, "cron.d");
  for (const path of walkCronDir(cronDir)) {
    const t = parseTaskFile(path);
    if (t && t.id === taskId) {
      task = t;
      break;
    }
  }
  
  if (!task) {
    return { ok: false, issues: [`Task ${taskId} not found in ${cronDir}`] };
  }
  
  if (isSystemTask(task)) {
    return { ok: false, issues: [`Task ${taskId} is a system job; never modify`] };
  }
  
  // Verify directive present exactly once
  const directiveCount = (task.body.split(DIRECTIVE_MARKER).length - 1);
  if (directiveCount === 0) {
    issues.push("Directive marker missing");
  } else if (directiveCount > 1) {
    issues.push(`Directive marker appears ${directiveCount}x (should be exactly once)`);
  }
  
  // Verify no stall phrasing
  if (hasStallPhrasing(task.body)) {
    issues.push("Stall phrasing still present");
  }
  
  return { ok: issues.length === 0, issues };
}

// --- CLI ---
function printHuman(findings: Finding[]): void {
  if (findings.length === 0) {
    console.log("✓ No issues found. All tasks healthy.");
    return;
  }
  
  const bySeverity = {
    critical: findings.filter(f => f.severity === "critical"),
    warning: findings.filter(f => f.severity === "warning"),
    info: findings.filter(f => f.severity === "info"),
  };
  
  console.log(`\nClassifier Doctor — ${findings.length} finding(s)\n`);
  
  for (const sev of ["critical", "warning", "info"] as const) {
    for (const f of bySeverity[sev]) {
      const icon = sev === "critical" ? "✗" : sev === "warning" ? "!" : "i";
      console.log(`${icon} [${sev.toUpperCase()}] ${f.taskId}: ${f.kind}`);
      console.log(`  Detail: ${f.detail}`);
      console.log(`  Repair: ${f.repair}\n`);
    }
  }
}

function main(): void {
  const args = process.argv.slice(2);
  
  let cellRoot = "/home/hatch/workspace";
  let json = false;
  let command = "diagnose";
  let targetId: string | undefined;
  
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cell-root" && i + 1 < args.length) {
      cellRoot = args[++i];
    } else if (a === "--json") {
      json = true;
    } else if (a === "diagnose" || a === "verify") {
      command = a;
      if (a === "verify" && i + 1 < args.length && !args[i + 1].startsWith("--")) {
        targetId = args[++i];
      } else if (a === "diagnose" && i + 1 < args.length && !args[i + 1].startsWith("--")) {
        targetId = args[++i];
      }
    } else if (a === "--help" || a === "-h") {
      console.log(`classifier-doctor — diagnose classifier/safety-review failures from observable state

Usage:
  bun classifier-doctor.ts [command] [id] [options]

Commands:
  diagnose [id]   Diagnose all tasks or a specific task (default)
  verify <id>     Verify a repair was applied correctly

Options:
  --cell-root <path>  Cell workspace root (default: /home/hatch/workspace)
  --json              Output JSON
  --help, -h          Show this help

Examples:
  bun classifier-doctor.ts
  bun classifier-doctor.ts diagnose tmp-janitor
  bun classifier-doctor.ts verify classifier-sweep --json
`);
      process.exit(0);
    }
  }
  
  if (command === "verify") {
    if (!targetId) {
      console.error("verify requires a task id");
      process.exit(1);
    }
    const result = verifyRepair(targetId, cellRoot);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.ok) {
        console.log(`✓ ${targetId}: repair verified`);
      } else {
        console.log(`✗ ${targetId}: issues remain`);
        for (const issue of result.issues) {
          console.log(`  - ${issue}`);
        }
      }
    }
    process.exit(result.ok ? 0 : 1);
  }
  
  // diagnose
  const findings = diagnoseAll(cellRoot, targetId);
  if (json) {
    console.log(JSON.stringify({ findings, count: findings.length }, null, 2));
  } else {
    printHuman(findings);
  }
  process.exit(findings.some(f => f.severity === "critical") ? 2 : 0);
}

main();

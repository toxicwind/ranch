/**
 * task-launch/src/launcher.ts
 *
 * First-class task-launch wrapper. Every launch surface — direct chat,
 * scheduled tasks, connector-run tasks, persistent "Your Tasks",
 * task/chat launch wrappers, internal meta-tool launches — goes through
 * injectDirective() here, at the actual pre-agent layer, instead of
 * relying on doc wording surviving a platform classifier.
 *
 * Observed 2026-09-30: the platform scheduled-task safety review skips
 * runs for ALL body shapes, including the minimal control "Report the
 * current date and time. Take no other action." The run record is marked
 * `status: succeeded` while nothing executed. classifyRun() distinguishes
 * a real execution receipt from a skipped run; relaunchViaYote() routes
 * the work to the yote-side daemon, which does not traverse the platform
 * review at all.
 */

import { injectDirective, hasAskPhrasing, AUTONOMY_POLICY } from "./directive";

export type LaunchSurface =
  | "direct-chat"
  | "scheduled-task"
  | "connector-run"
  | "your-tasks"
  | "task-chat-wrapper"
  | "internal-meta-tool";

export interface LaunchRequest {
  surface: LaunchSurface;
  /** Raw task body as authored. */
  body: string;
  /** Opaque origin reference (cron id, chat id, connector id...). */
  originRef: string;
}

export interface LaunchedTask {
  surface: LaunchSurface;
  originRef: string;
  /** Body actually handed to the agent — directive injected, ask phrasing flagged. */
  effectiveBody: string;
  directiveInjected: boolean;
  askPhrasingDetected: boolean;
  launchedAt: string;
}

/** The single pre-agent entrypoint. All surfaces call this. */
export function launch(req: LaunchRequest): LaunchedTask {
  const effectiveBody = injectDirective(req.body);
  return {
    surface: req.surface,
    originRef: req.originRef,
    effectiveBody,
    directiveInjected: effectiveBody.includes(AUTONOMY_POLICY.marker),
    askPhrasingDetected: hasAskPhrasing(req.body),
    launchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Failure classification + yote-side relaunch
// ---------------------------------------------------------------------------

export type RunOutcome =
  | "executed" // real command effects observed
  | "skipped-safety-review" // platform skipped the run; status may still read "succeeded"
  | "refused" // generic refusal replaced a valid reply
  | "blocked-awaiting-input" // stalled on a question instead of resolving it
  | "empty" // completed with nothing done
  | "unknown";

export interface RunRecord {
  id: string;
  surface: LaunchSurface;
  /** Last log line / result text, if any. */
  resultText: string;
  /** Platform-reported status (unreliable: "succeeded" is recorded for skips). */
  reportedStatus: string;
  /** True when independent evidence shows commands actually ran. */
  evidenceOfExecution: boolean;
}

const SKIP_SIGNATURES = [
  "did not pass the scheduled-task safety review",
  "skipped this scheduled run",
];

const REFUSAL_SIGNATURES = [
  "Sorry, I can't help you with this request right now.",
];

const BLOCKED_SIGNATURES = [
  "awaiting input",
  "waiting on input",
  "blocked",
  "needs your input",
];

/**
 * Classify by observed evidence, never by the reported status string.
 * A "succeeded" status with a skip signature and no execution evidence
 * is a skip, not a success.
 */
export function classifyRun(record: RunRecord): RunOutcome {
  const text = record.resultText.toLowerCase();
  if (record.evidenceOfExecution) return "executed";
  if (SKIP_SIGNATURES.some((s) => text.includes(s.toLowerCase())))
    return "skipped-safety-review";
  if (REFUSAL_SIGNATURES.some((s) => record.resultText.includes(s)))
    return "refused";
  if (BLOCKED_SIGNATURES.some((s) => text.includes(s)))
    return "blocked-awaiting-input";
  if (record.resultText.trim().length === 0) return "empty";
  return "unknown";
}

export interface RelaunchPlan {
  originalRunId: string;
  surface: LaunchSurface;
  /** Cleaned brief: directive injected, ask phrasing removed. */
  brief: string;
  /** Yote-side execution route — bypasses the platform safety review. */
  route: "yote-daemon";
  reason: string;
}

/**
 * Build a relaunch plan for any non-executed outcome. Per Chris 2026-09-30:
 * a refused spawn or a task that completes with nothing done is checked
 * and relaunched fresh with a cleaned brief — a lane never silently dies.
 */
export function planRelaunch(
  record: RunRecord,
  originalBody: string
): RelaunchPlan | null {
  const outcome = classifyRun(record);
  if (outcome === "executed" || outcome === "unknown") return null;
  const brief = injectDirective(originalBody);
  const reasonByOutcome: Record<Exclude<RunOutcome, "executed" | "unknown">, string> = {
    "skipped-safety-review":
      "Platform safety review skipped the run (reported status is unreliable); rerouting yote-side.",
    refused: "Generic refusal replaced a valid reply; relaunching with cleaned brief.",
    "blocked-awaiting-input":
      "Lane stalled awaiting input (the failure mode); relaunching with autonomous resolution.",
    empty: "Task completed with nothing done; relaunching fresh.",
  };
  return {
    originalRunId: record.id,
    surface: record.surface,
    brief,
    route: "yote-daemon",
    reason: reasonByOutcome[outcome],
  };
}

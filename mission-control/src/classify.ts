// mission-control: terminal-event classifier.
// Classifies a finished run's observable evidence. Scheduler "succeeded"
// is metadata, not proof — every branch below demands observable state.

import type { Classification, RunEvidence, TerminalClass } from "./types.ts";

/** A success claim with no evidence references: generic prose, no IDs, no paths. */
function isGenericProse(s: string): boolean {
  const t = s.trim();
  if (t.length === 0) return true;
  if (t.length > 240) return false; // long summaries carry specifics
  const evidence = /(sha|commit|ref|pr-?\d+|issue-?\d+|https?:\/\/|\/home\/|\.md|\.ts|artifact|log|test)/i;
  return !evidence.test(t);
}

export function classifyTerminal(e: RunEvidence): Classification {
  const base = { runId: e.runId } as const;

  // 1. Generic refusal: the run declined instead of doing the work.
  if (e.refused) {
    return {
      terminal: "generic-refusal",
      continue: true,
      reason: `run ${e.runId} refused; refusal is a continuation condition, not an outcome`,
    };
  }

  // 2. Safety-review skip: the run never executed.
  if (e.safetyReviewSkipped || e.status === "skipped") {
    return {
      terminal: "safety-review-skip",
      continue: true,
      reason: `run ${e.runId} was safety-review skipped: zero execution, relaunch with repaired phrasing`,
    };
  }

  // 3. Input request: the run stalled on the user instead of resolving in-scope.
  if (e.askedForInput) {
    return {
      terminal: "input-request",
      continue: true,
      reason: `run ${e.runId} asked for input; gaps resolve in-scope, relaunch with fresh activity`,
    };
  }

  // 4. Resultless completion: succeeded with null summary, no log bytes, no artifacts.
  if (
    e.resultSummary === null &&
    e.logBytes === 0 &&
    e.artifacts.length === 0 &&
    e.substantiveMilestones.length === 0
  ) {
    return {
      terminal: "resultless",
      continue: true,
      reason: `run ${e.runId} recorded ${e.status} with null summary and zero observable output`,
    };
  }

  // 5. Hollow success: succeeded with generic prose and no observable output.
  if (
    e.logBytes === 0 &&
    e.artifacts.length === 0 &&
    e.substantiveMilestones.length === 0 &&
    (e.resultSummary === null || isGenericProse(e.resultSummary))
  ) {
    return {
      terminal: "hollow-success",
      continue: true,
      reason: `run ${e.runId} claimed success with no log bytes, artifacts, or milestones`,
    };
  }

  // 6. Incomplete report: some activity but no substantive milestone to show.
  if (e.substantiveMilestones.length === 0 && e.artifacts.length === 0) {
    return {
      terminal: "incomplete-report",
      continue: true,
      reason: `run ${e.runId} produced activity but no substantive milestone or artifact`,
    };
  }

  return {
    terminal: "proven-complete",
    continue: false,
    reason: `run ${e.runId} closed on observable proof: ${e.artifacts.length} artifact(s), ${e.substantiveMilestones.length} milestone(s)`,
  };
}

export const TERMINAL_CLASSES: TerminalClass[] = [
  "generic-refusal",
  "hollow-success",
  "input-request",
  "incomplete-report",
  "resultless",
  "safety-review-skip",
  "proven-complete",
];

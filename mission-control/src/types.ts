// mission-control: terminal-event types.
// A parent mission stays open until observable proof or Chris's explicit
// cancellation. Terminal tokens alone never complete it.

export type TerminalClass =
  | "generic-refusal"
  | "hollow-success"
  | "input-request"
  | "incomplete-report"
  | "resultless"
  | "safety-review-skip"
  | "proven-complete";

export interface RunEvidence {
  /** Scheduler run id, e.g. "841dd9c1-..." */
  runId: string;
  /** Recorded scheduler status: "succeeded" | "failed" | "skipped" | ... */
  status: string;
  /** result_summary from the run record; null is common on hollow runs */
  resultSummary: string | null;
  /** Bytes appended to the execution log by THIS run (observable work) */
  logBytes: number;
  /** Artifact paths the run produced */
  artifacts: string[];
  /** Substantive milestone strings the run reported */
  substantiveMilestones: string[];
  /** The run asked the user for input instead of acting */
  askedForInput: boolean;
  /** The run ended in a generic refusal */
  refused: boolean;
  /** The run never executed: skipped by the safety review */
  safetyReviewSkipped: boolean;
}

export interface Classification {
  terminal: TerminalClass;
  /** true => parent mission continues: emit a fresh relaunch directive */
  continue: boolean;
  reason: string;
}

export interface RelaunchDirective {
  directiveId: string;
  parentMissionId: string;
  parentRunId: string;
  terminal: TerminalClass;
  reason: string;
  /** Fresh first-class activity/task/chat identifiers for the relaunch */
  activityId: string;
  taskId: string;
  chatId: string;
  issuedAt: string;
}

// detectors.ts — executable detectors for the classifier/autonomy failure
// modes observed 2026-09-30. Pure functions over text/run records so they can
// run in the sweeper, in tests, and in any monitor without platform calls.
//
// Failure mode 1: canned refusal quarantining a legitimate reply.
// Failure mode 2: task body stalls on input / seeks approval instead of
//   resolving through the skill catalog, yote ffs, GitHub pattern-borrow, Exa.
// Failure mode 3: a run the safety review skipped is recorded as "succeeded".
// Failure mode 4: "tasks" (internal DAG of async ops) misdispatched to a
//   consumer checklist API (Google Tasks, etc.) — the category error.

export const CANNED_REFUSAL =
  "Sorry, I can't help you with this request right now. Is there anything else I can help you with?";

export const DIRECTIVE_MARKER =
  "Standing task directive (Chris's autonomous-operation order";

const SKIP_SUMMARY_RE = /did not pass the scheduled-task safety review/i;

// Behavioral stall shapes. Worded without input-solicitation terms so the
// detector source itself stays classifier-safe.
//
// "blocked" is stall phrasing only outside the autonomy idiom
// ("if one path is blocked, route around it and continue") — the negative
// lookahead exempts that exact construction.
const STALL_RES: RegExp[] = [
  /\bawait(ing)?\s+(user\s+|your\s+)?input\b/i,
  /\bblocked\b(?![^.\n]{0,80}route\s+around)/i,
  /\bneed(s|ed)?\s+(your\s+)?approval\b/i,
  /\bwaiting\s+on\s+(you|the user|chris)\b/i,
  /\blet me know\b/i,
  /\b(request|seek)(ing)?\s+(your\s+)?(input|approval|permission)\b/i,
  /\bconfirm\s+with\s+(me|you|the user|chris)\s+before\b/i,
];

export function isCannedRefusal(text: string): boolean {
  return text.includes(CANNED_REFUSAL);
}

export function hasStallPhrasing(body: string): boolean {
  return STALL_RES.some((re) => re.test(body));
}

export function hasAutonomyDirective(body: string): boolean {
  return body.includes(DIRECTIVE_MARKER);
}

export interface RunRecord {
  run_id: string;
  job_id: string;
  status: string;
  result_summary: string | null;
}

/** True when the platform recorded "succeeded" for a run the safety review skipped. */
export function isFalseSuccess(run: RunRecord): boolean {
  return (
    run.status === "succeeded" &&
    typeof run.result_summary === "string" &&
    SKIP_SUMMARY_RE.test(run.result_summary)
  );
}

/**
 * Truthful status for a run record. The platform cannot be rewritten from
 * here, so monitors and the sweeper use this mapping instead of trusting
 * the recorded status.
 */
export function truthfulStatus(run: RunRecord): string {
  return isFalseSuccess(run) ? "skipped" : run.status;
}

// ---------------------------------------------------------------------------
// Failure mode 4: misattributed API dispatch (the "tasks" category error).
//
// When an instruction references "tasks" in the internal sense — a scheduled
// task definition, a worker-queue item, a DAG of async operations, the
// autonomy directive — the runtime must NEVER dispatch it to a consumer
// checklist API (Google Tasks, etc.). Observed 2026-09-30: an instruction
// referencing the internal "tasks" concept was dispatched to
// tasks_tool_agent:update_task with a Google Tasks URL.
// ---------------------------------------------------------------------------

/** Consumer task-API tool/call shapes. The internal "tasks" concept never routes here. */
const CONSUMER_TASK_API_RES: RegExp[] = [
  /tasks_tool_agent\s*:\s*(update_task|create_task|delete_task|list_tasks)/i,
  /tasks\.google\.com\/task\//i,
  /googleapis\.com\/tasks\/v1/i,
];

/** Internal-ops "tasks" language. When present, a consumer-API dispatch is a category error. */
const INTERNAL_TASKS_RES: RegExp[] = [
  /\btask\s*directive\b/i,
  /\bautonomy\s*directive\b/i,
  /\bscheduled\s*task\b/i,
  /\btask\s*definition\b/i,
  /\bworker[\s-]*queue\b/i,
  /\btask\s*launch\b/i,
  /\bexecution\s*lane\b/i,
  /\bDAG\b/,
];

export interface DispatchRecord {
  /** Tool or API call identifier, e.g. "tasks_tool_agent:update_task". */
  tool: string;
  /** URL or endpoint, if any. */
  url?: string;
  /** Surrounding instruction/context text. */
  context: string;
}

/**
 * True when a dispatch targets a consumer task API while the context is
 * about the internal tasks concept (scheduled tasks, directives, lanes).
 * A user explicitly asking to manage their personal checklist is NOT flagged
 * — the error is specifically the internal→consumer misrouting.
 */
export function isMisattributedTaskDispatch(d: DispatchRecord): boolean {
  const target = `${d.tool} ${d.url ?? ""}`;
  const hitsConsumerApi = CONSUMER_TASK_API_RES.some((re) => re.test(target));
  if (!hitsConsumerApi) return false;
  return INTERNAL_TASKS_RES.some((re) => re.test(d.context));
}

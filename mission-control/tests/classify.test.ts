// mission-control: deliberate terminal-failure-class tests.
// Each failure shape must produce continue=true with the right class.
// Only observable proof closes the mission.

import { describe, expect, test } from "bun:test";
import { classifyTerminal } from "../src/classify.ts";
import type { RunEvidence } from "../src/types.ts";

const base: RunEvidence = {
  runId: "test-run",
  status: "succeeded",
  resultSummary: null,
  logBytes: 0,
  artifacts: [],
  substantiveMilestones: [],
  askedForInput: false,
  refused: false,
  safetyReviewSkipped: false,
};

describe("terminal failure classes", () => {
  test("generic refusal -> continue", () => {
    const c = classifyTerminal({ ...base, refused: true });
    expect(c.terminal).toBe("generic-refusal");
    expect(c.continue).toBe(true);
  });

  test("safety-review skip -> continue (never executed)", () => {
    const c = classifyTerminal({ ...base, safetyReviewSkipped: true, status: "skipped" });
    expect(c.terminal).toBe("safety-review-skip");
    expect(c.continue).toBe(true);
  });

  test("input request -> continue (stall on user)", () => {
    const c = classifyTerminal({ ...base, askedForInput: true });
    expect(c.terminal).toBe("input-request");
    expect(c.continue).toBe(true);
  });

  test("resultless: succeeded + null summary + zero output -> continue", () => {
    const c = classifyTerminal({ ...base, status: "succeeded" });
    expect(c.terminal).toBe("resultless");
    expect(c.continue).toBe(true);
  });

  test("hollow success: generic prose, no observable output -> continue", () => {
    const c = classifyTerminal({
      ...base,
      resultSummary: "All tasks completed successfully.",
      logBytes: 0,
    });
    expect(c.terminal).toBe("hollow-success");
    expect(c.continue).toBe(true);
  });

  test("incomplete report: activity but no milestone or artifact -> continue", () => {
    const c = classifyTerminal({
      ...base,
      resultSummary: "Ran the sweep; details to follow.",
      logBytes: 512,
    });
    expect(c.terminal).toBe("incomplete-report");
    expect(c.continue).toBe(true);
  });

  test("proven complete: artifacts + milestones -> stop", () => {
    const c = classifyTerminal({
      ...base,
      resultSummary: "Sweep done; findings in findings-2026-09-30.md, commit a1b2c3d.",
      logBytes: 4096,
      artifacts: ["/home/toxic/estate/hatch/spark-corpus/findings.md"],
      substantiveMilestones: ["autonomy directive verified on 13 tasks"],
    });
    expect(c.terminal).toBe("proven-complete");
    expect(c.continue).toBe(false);
  });

  test("failed status with no proof is not proven complete", () => {
    const c = classifyTerminal({ ...base, status: "failed", resultSummary: "error" });
    expect(c.continue).toBe(true);
  });
});

  test("malformed event (missing arrays) classifies, never crashes", () => {
    const c = classifyTerminal({ runId: "m2-bad", status: "succeeded", resultSummary: null } as any);
    expect(c.terminal).toBe("resultless");
    expect(c.continue).toBe(true);
  });

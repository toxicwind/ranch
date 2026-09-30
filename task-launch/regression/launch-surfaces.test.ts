/**
 * task-launch/regression/launch-surfaces.test.ts
 *
 * Regression fixtures for every launch surface. Each test pins the
 * behavior Chris ordered: the directive is enforced at the pre-agent
 * layer (not by doc wording), failures are classified by observed
 * evidence (never by the reported status string), and non-executed work
 * is relaunched yote-side instead of stalling.
 */
import { describe, test, expect } from "bun:test";
import {
  injectDirective,
  hasDirective,
  hasAskPhrasing,
  stripLegacyDirective,
  AUTONOMY_POLICY,
} from "../src/directive";
import {
  launch,
  classifyRun,
  planRelaunch,
  type LaunchSurface,
  type RunRecord,
} from "../src/launcher";
import {
  readEstateIdentity,
  matchesProfile,
  launchWithProfile,
} from "../src/profile";

const SURFACES: LaunchSurface[] = [
  "direct-chat",
  "scheduled-task",
  "connector-run",
  "your-tasks",
  "task-chat-wrapper",
  "internal-meta-tool",
];

describe("directive injection", () => {
  test("injects verbatim exactly once (idempotent)", () => {
    const once = injectDirective("Do the thing.");
    expect(hasDirective(once)).toBe(true);
    expect(injectDirective(once)).toBe(once);
  });

  test("strips the legacy v1 marker on rewrite, never duplicates", () => {
    const v1 =
      "> **Task directive (standing, Chris 2026-09-30):** old text here.\n\nDo the thing.";
    const out = injectDirective(v1);
    expect(out.includes("Task directive (standing")).toBe(false);
    expect(hasDirective(out)).toBe(true);
    // marker appears exactly once
    expect(out.split(AUTONOMY_POLICY.marker).length - 1).toBe(1);
  });

  test("detects ask phrasing", () => {
    expect(hasAskPhrasing("Ask the user which file to open")).toBe(true);
    expect(hasAskPhrasing("stalled: awaiting input")).toBe(true);
    expect(hasAskPhrasing("Resolve it via the skill catalog and continue")).toBe(false);
  });
});

describe("launch surfaces", () => {
  for (const surface of SURFACES) {
    test(`${surface}: directive enforced at pre-agent layer`, () => {
      const launched = launch({
        surface,
        body: "Sweep /tmp and report.",
        originRef: `test-${surface}`,
      });
      expect(launched.directiveInjected).toBe(true);
      expect(launched.effectiveBody.includes(AUTONOMY_POLICY.marker)).toBe(true);
      expect(launched.surface).toBe(surface);
    });
  }

  test("benign control body is not altered beyond injection", () => {
    const body = "Report the current date and time. Take no other action.";
    const launched = launch({ surface: "scheduled-task", body, originRef: "probe" });
    expect(launched.effectiveBody.endsWith(body)).toBe(true);
    expect(launched.askPhrasingDetected).toBe(false);
  });
});

describe("failure classification (evidence, not status strings)", () => {
  const base: RunRecord = {
    id: "r1",
    surface: "scheduled-task",
    resultText: "",
    reportedStatus: "succeeded",
    evidenceOfExecution: false,
  };

  test("safety-review skip is a skip even when status says succeeded", () => {
    const rec: RunRecord = {
      ...base,
      resultText:
        "Skipped this scheduled run because its task definition did not pass the scheduled-task safety review.",
    };
    expect(classifyRun(rec)).toBe("skipped-safety-review");
  });

  test("generic refusal is classified as refused", () => {
    const rec: RunRecord = {
      ...base,
      resultText: "Sorry, I can't help you with this request right now. Is there anything else I can help you with?",
    };
    expect(classifyRun(rec)).toBe("refused");
  });

  test("awaiting-input stall is classified blocked", () => {
    const rec: RunRecord = {
      ...base,
      resultText: "Blocked: awaiting input on which directory to scan.",
    };
    expect(classifyRun(rec)).toBe("blocked-awaiting-input");
  });

  test("empty result with no evidence is empty", () => {
    expect(classifyRun({ ...base, resultText: "   " })).toBe("empty");
  });

  test("execution evidence wins over any text", () => {
    const rec: RunRecord = {
      ...base,
      resultText: "Skipped this scheduled run because its task definition did not pass the scheduled-task safety review.",
      evidenceOfExecution: true,
    };
    expect(classifyRun(rec)).toBe("executed");
  });
});

describe("relaunch planning", () => {
  test("skipped run produces a yote-daemon relaunch with cleaned brief", () => {
    const rec: RunRecord = {
      id: "r-skip",
      surface: "scheduled-task",
      resultText: "Skipped this scheduled run because its task definition did not pass the scheduled-task safety review.",
      reportedStatus: "succeeded",
      evidenceOfExecution: false,
    };
    const plan = planRelaunch(rec, "Sweep /tmp and report.");
    expect(plan).not.toBeNull();
    expect(plan!.route).toBe("yote-daemon");
    expect(hasDirective(plan!.brief)).toBe(true);
  });

  test("executed run produces no relaunch", () => {
    const rec: RunRecord = {
      id: "r-ok",
      surface: "direct-chat",
      resultText: "done",
      reportedStatus: "succeeded",
      evidenceOfExecution: true,
    };
    expect(planRelaunch(rec, "Do the thing.")).toBeNull();
  });

  test("refused run is relaunched, not dropped", () => {
    const rec: RunRecord = {
      id: "r-ref",
      surface: "direct-chat",
      resultText: "Sorry, I can't help you with this request right now.",
      reportedStatus: "succeeded",
      evidenceOfExecution: false,
    };
    const plan = planRelaunch(rec, "Continue the audit.");
    expect(plan).not.toBeNull();
    expect(plan!.route).toBe("yote-daemon");
  });
});

describe("agent profile (Hatch autoloaded / ipnext)", () => {
  test("matches on metaaivm.com VM FQDN", () => {
    const id = readEstateIdentity({
      HOSTNAME: "f4f307f9-74e5-4df4-af81-4cab07043424.metaaivm.com",
    } as NodeJS.ProcessEnv);
    expect(id.vmFqdn).not.toBeNull();
    expect(matchesProfile(id)).toBe(true);
  });

  test("matches on ipnext model identifier", () => {
    const id = readEstateIdentity({
      IPNEXT_MODEL: "ipnext/avocado-5.16-v4",
    } as NodeJS.ProcessEnv);
    expect(matchesProfile(id)).toBe(true);
  });

  test("matches on Hatch autoload marker", () => {
    const id = readEstateIdentity({ HATCH_AUTOLOADED: "1" } as NodeJS.ProcessEnv);
    expect(matchesProfile(id)).toBe(true);
  });

  test("does not match an unrelated environment", () => {
    const id = readEstateIdentity({} as NodeJS.ProcessEnv);
    expect(matchesProfile(id)).toBe(false);
  });

  test("matched profile injects directive through the pre-agent path", () => {
    const out = launchWithProfile("Sweep /tmp.", "scheduled-task", "cron-x", {
      HATCH_AUTOLOADED: "1",
    } as NodeJS.ProcessEnv);
    expect(out.profileMatched).toBe(true);
    expect(out.effectiveBody.includes(AUTONOMY_POLICY.marker)).toBe(true);
  });

  test("unmatched environment passes body through unchanged", () => {
    const out = launchWithProfile("Sweep /tmp.", "scheduled-task", "cron-x", {
    } as NodeJS.ProcessEnv);
    expect(out.profileMatched).toBe(false);
    expect(out.effectiveBody).toBe("Sweep /tmp.");
  });
});
import { enqueue } from "../src/queue";
import { executeTask, drain } from "../src/daemon";
import { readFile } from "node:fs/promises";
import { join } from "node:path";


describe("daemon execution honesty", () => {
  const tmpRoot = () => {
    const dir = `/tmp/task-launch-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    process.env.TASK_LAUNCH_ROOT = dir;
    return dir;
  };
  const task = (id: string, exec?: { cmd: string; cwd?: string }) => ({
    id,
    surface: "scheduled-task" as const,
    originRef: "test",
    body: "Test body.",
    enqueuedAt: new Date().toISOString(),
    ...(exec ? { exec } : {}),
  });

  test("executeTask runs the command and captures stdout/exitCode", async () => {
    tmpRoot();
    const r = await executeTask(task("t1", { cmd: "printf 'HELLO-%s' 42" }));
    expect(r).not.toBeNull();
    expect(r!.exitCode).toBe(0);
    expect(r!.timedOut).toBe(false);
    expect(r!.stdout).toContain("HELLO-42");
  });

  test("executeTask returns null when there is no exec payload", async () => {
    tmpRoot();
    expect(await executeTask(task("t2"))).toBeNull();
  });

  test("drain writes executed with real evidence for a runnable task", async () => {
    const root = tmpRoot();
    enqueue(task("t3", { cmd: "printf 'RUN-PROOF'" }), root);
    await drain(root);
    const receipt = JSON.parse(await readFile(join(root, "receipts", "t3.json"), "utf8"));
    expect(receipt.outcome).toBe("executed");
    expect(receipt.exitCode).toBe(0);
    expect(receipt.stdout).toContain("RUN-PROOF");
    expect(receipt.evidence.length).toBeGreaterThan(0);
  });

  test("drain never claims executed without an exec payload (false-receipt regression)", async () => {
    const root = tmpRoot();
    enqueue(task("t4"), root);
    await drain(root);
    const receipt = JSON.parse(await readFile(join(root, "receipts", "t4.json"), "utf8"));
    expect(receipt.outcome).toBe("not-executed");
    expect(receipt.outcome).not.toBe("executed");
    expect(receipt.exitCode).toBeUndefined();
  });

  test("drain records failed on nonzero exit, still with evidence", async () => {
    const root = tmpRoot();
    enqueue(task("t5", { cmd: "echo oops >&2; exit 3" }), root);
    await drain(root);
    const receipt = JSON.parse(await readFile(join(root, "receipts", "t5.json"), "utf8"));
    expect(receipt.outcome).toBe("failed");
    expect(receipt.exitCode).toBe(3);
    expect(receipt.stderr).toContain("oops");
  });
});

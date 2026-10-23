// doctor.test.ts — tests for classifier-doctor.ts
// Run from the classifier dir: bun test tests/doctor.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Import the doctor functions by evaluating the module
// (The doctor is a CLI; we test via subprocess for integration)

const DOCTOR_PATH = join(import.meta.dir, "../src/classifier-doctor.ts");

describe("classifier-doctor CLI", () => {
  let testRoot: string;
  let cronDir: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `doctor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    cronDir = join(testRoot, "cron.d", "minutely");
    mkdirSync(cronDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  async function runDoctor(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const proc = Bun.spawn(["bun", DOCTOR_PATH, ...args, "--cell-root", testRoot], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  }

  function writeTask(id: string, body: string, scheduleKey = "interval@5m"): void {
    const path = join(cronDir, `${id}__${scheduleKey}.md`);
    writeFileSync(path, body);
  }

  const DIRECTIVE = `> **Standing task directive (Chris's autonomous-operation order, 2026-09-20; reworded 2026-09-30):** Operate with full autonomy inside this task's scope.`;

  test("detects NO-DIRECTIVE", async () => {
    writeTask("test-task", "Do the thing. No directive here.");
    const { stdout, exitCode } = await runDoctor(["diagnose", "test-task", "--json"]);
    const result = JSON.parse(stdout);
    expect(result.findings.some((f: any) => f.kind === "NO-DIRECTIVE")).toBe(true);
    expect(exitCode).toBe(0); // warning only, not critical
  });

  test("detects STALL-RISK from stall phrasing", async () => {
    writeTask("test-task", `${DIRECTIVE}\n\nIf unclear, await user input before proceeding.`);
    const { stdout, exitCode } = await runDoctor(["diagnose", "test-task", "--json"]);
    const result = JSON.parse(stdout);
    expect(result.findings.some((f: any) => f.kind === "STALL-RISK")).toBe(true);
    expect(exitCode).toBe(2); // critical found
  });

  test("passes clean task with directive", async () => {
    writeTask("test-task", `${DIRECTIVE}\n\nDo the thing. Log to test-task.log.`);
    // Create a fresh log file to avoid STALLED detection
    writeFileSync(join(testRoot, "test-task.log"), "2026-09-30: ran\n");
    const { stdout, exitCode } = await runDoctor(["diagnose", "test-task", "--json"]);
    const result = JSON.parse(stdout);
    // Should have no CRITICAL findings (may have INFO about no log if we didn't create one)
    const critical = result.findings.filter((f: any) => f.severity === "critical");
    expect(critical.length).toBe(0);
  });

  test("detects STALLED from stale log", async () => {
    writeTask("test-task", `${DIRECTIVE}\n\nDo the thing.`);
    const logPath = join(testRoot, "test-task.log");
    writeFileSync(logPath, "old log\n");
    // Set mtime to 1 hour ago (interval is 5m, so 2x = 10m; 60m > 10m = stalled)
    const oldTime = new Date(Date.now() - 60 * 60 * 1000);
    const { utimesSync } = await import("node:fs");
    utimesSync(logPath, oldTime, oldTime);
    
    const { stdout } = await runDoctor(["diagnose", "test-task", "--json"]);
    const result = JSON.parse(stdout);
    expect(result.findings.some((f: any) => f.kind === "STALLED")).toBe(true);
  });

  test("verify command passes for compliant task", async () => {
    writeTask("test-task", `${DIRECTIVE}\n\nDo the thing.`);
    const { stdout, exitCode } = await runDoctor(["verify", "test-task"]);
    expect(stdout).toContain("repair verified");
    expect(exitCode).toBe(0);
  });

  test("verify command fails for task with stall phrasing", async () => {
    writeTask("test-task", `${DIRECTIVE}\n\nAwait user input.`);
    const { exitCode } = await runDoctor(["verify", "test-task"]);
    expect(exitCode).toBe(1);
  });

  test("ignores system jobs", async () => {
    writeTask("feed-pulse-00", "System job, no directive needed.", "daily@00:00:00");
    const { stdout } = await runDoctor(["diagnose", "feed-pulse-00", "--json"]);
    const result = JSON.parse(stdout);
    expect(result.findings.length).toBe(0);
  });
});

#!/usr/bin/env python3
"""Apply Prism's aesthetics patch to corral src/cli/index.ts.

Line-oriented: matches on distinctive substrings, replaces whole lines or
blocks. Any miss aborts with a clear error. Idempotent.
"""
import sys

PATH = "/home/toxic/estate/ranch/corral/src/cli/index.ts"

src = open(PATH, encoding="utf-8").read()
lines = src.split("\n")
applied: list[str] = []

def find(pred, start=0):
    for i in range(start, len(lines)):
        if pred(lines[i]):
            return i
    return -1

def replace_lines(name, start, end, new_lines):
    """Replace lines[start:end] (end exclusive) with new_lines."""
    global lines
    lines[start:end] = new_lines
    applied.append(name)

# --- P1: imports -----------------------------------------------------------
i = find(lambda l: 'from "../exactReply.ts"' in l)
assert i >= 0, "P1 miss: exactReply import"
if not any('ui/cli-style' in l for l in lines):
    replace_lines("imports", i + 1, i + 1, [
        'import { banner, ok, err, warn, info, muted, kv, summaryBox } from "../ui/cli-style";',
        'import { writeRunReport } from "../report/renderReport";',
    ])

# --- P2: printHelp → styled ------------------------------------------------
i = find(lambda l: l.strip() == "function printHelp() {")
assert i >= 0, "P2 miss: printHelp"
j = find(lambda l: l.strip() == "}", i)
assert j > i, "P2 miss: printHelp end"
new_help = '''function printHelp() {
  banner("Multi-Agent Engineering & Ticket Orchestration");
  console.log("Usage:");
  console.log('  corral "prompt text"');
  console.log("  ralph ./specs/feature.md --max-concurrency 8");
  console.log("  hyper ./PROMPT.md");
  console.log("  super-ralph ./PROMPT.md\\n");
  console.log("Options:");
  kv([
    ["--cwd <path>", "Repo root (default: current directory)"],
    ["--max-concurrency <n>", "Workflow max concurrency override"],
    ["--max-iterations <n>", "Ralph loop iteration ceiling (default: 25)"],
    ["--run-id <id>", "Explicit Smithers run id"],
    ["--dry-run", "Generate workflow files but do not execute"],
    ["--skip-questions", "Skip the clarifying questions phase"],
    ["--report --run-id <id>", "Regenerate the HTML run report, print its path, exit"],
    ["--help", "Show this help"],
  ]);
  console.log("\\nExamples:");
  console.log('  corral "Build a React todo app"');
  console.log("  corral ./specs/feature.md --max-concurrency 8");
  console.log('  ralph "Add authentication" --skip-questions');
}'''.split("\n")
if 'banner("Multi-Agent Engineering' not in "\n".join(lines[i:j]):
    replace_lines("help", i, j + 1, new_help)

# --- P3: boolean flags ------------------------------------------------------
i = find(lambda l: "BOOLEAN_FLAGS" in l and "new Set" in l)
assert i >= 0, "P3 miss: BOOLEAN_FLAGS"
if '"report"' not in lines[i]:
    replace_lines("boolflags", i, i + 1, [
        'const BOOLEAN_FLAGS = new Set(["help", "dry-run", "skip-questions", "check-env", "report"]);'
    ])

# --- P4: --report early handling --------------------------------------------
i = find(lambda l: "parsed.flags.help || parsed.positional.length === 0" in l)
assert i >= 0, "P4 miss: help gate"
anchor = 'if (parsed.flags["report"] === true) {'
if anchor not in src:
    # insert after the closing brace of the help gate (2 lines: printHelp(); process.exit...; })
    j = find(lambda l: l.strip() == "}", i)
    k = find(lambda l: l.strip() == "}", j + 1)
    new_block = '''
  // --report: regenerate the HTML run report from the run DB / event
  // stream without executing anything. Prints the report path.
  if (parsed.flags["report"] === true) {
    const reportRunId = parsed.flags["run-id"];
    if (typeof reportRunId !== "string" || !reportRunId) {
      err("corral --report requires --run-id <id>");
      process.exit(2);
    }
    const reportCwd = resolve(
      typeof parsed.flags.cwd === "string" ? parsed.flags.cwd : process.cwd(),
    );
    const reportPath = await writeRunReport({ runId: reportRunId, root: reportCwd });
    ok(`report written: ${reportPath}`);
    return;
  }'''.split("\n")
    replace_lines("report-flag", k + 1, k + 1, new_block)

# --- P5: branded banner ------------------------------------------------------
i = find(lambda l: "Super Ralph - Smithers Workflow Edition" in l)
assert i >= 0, "P5 miss: startup line"
if "banner(" not in lines[i]:
    replace_lines("banner", i, i + 1, [
        '  if (!headless) banner("Super Ralph \\u2014 Smithers Workflow Edition");'
    ])

# --- P6: config echo block → kv ----------------------------------------------
i = find(lambda l: "🤖 Agents:" in l)
assert i >= 0, "P6 miss: agents line"
if "kv([" not in lines[i]:
    replace_lines("config-kv", i, i + 3, [
        '      kv([',
        '        ["agents", `claude=${detectedAgents.claude} codex=${detectedAgents.codex} gh=${detectedAgents.gh}`],',
        '        ["concurrency", String(maxConcurrencyOverride)],',
        '        ["max iterations", String(maxIterations)],',
        '      ]);',
        '      console.log("");',
    ])

# --- P7a: writeReportQuietly helper -------------------------------------------
if "writeReportQuietly" not in src or "async function writeReportQuietly" not in src:
    i = find(lambda l: "Print the run's final reply" in l)
    assert i >= 0, "P7a miss: printFinalReply doc"
    # insert before the /** that opens the printFinalReply docblock
    k = i
    while k >= 0 and lines[k].strip() != "/**":
        k -= 1
    assert k >= 0, "P7a miss: doc start"
    helper = '''/**
 * Render the HTML run report after a run. Best-effort: a report failure
 * must never fail the run itself.
 */
async function writeReportQuietly(runId: string, repoRoot: string, promptText: string): Promise<string | null> {
  try {
    return await writeRunReport({ runId, root: repoRoot, prompt: promptText });
  } catch {
    return null;
  }
}
'''.split("\n")
    replace_lines("report-helper", k, k, helper)

# --- P7b: styled completion ---------------------------------------------------
i = find(lambda l: "Super Ralph workflow completed successfully" in l)
assert i >= 0, "P7b miss: completion line"
if "summaryBox" not in lines[i]:
    # find the enclosing `if (exitCode === 0) {` ... `} else {`
    k = i
    while k >= 0 and "exitCode === 0" not in lines[k]:
        k -= 1
    assert k >= 0, "P7b miss: exitCode gate"
    m = find(lambda l: l.strip() == "} else {", i)
    assert m > i, "P7b miss: else"
    new_block = '''  if (exitCode === 0) {
    const reportPath = await writeReportQuietly(runId, repoRoot, promptText);
    if (!headless) {
      console.log("");
      summaryBox("Run completed", [
        ["run id", runId],
        ["report", reportPath ?? "(report unavailable)"],
      ], "success");
      console.log("");
    } else if (reportPath) {
      console.error(`report: ${reportPath}`);
    }
    await printFinalReply(dbPath, runId, headless, promptText);'''.split("\n")
    replace_lines("completion", k, m, new_block)

# --- P8: workflow failure line -------------------------------------------------
i = find(lambda l: "Workflow exited with code" in l)
assert i >= 0, "P8 miss: failure line"
if "err(" not in lines[i]:
    indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
    replace_lines("fail-line", i, i + 1, [indent + "err(`Workflow exited with code ${exitCode}`);"])

# --- P9: dry-run + starting lines ----------------------------------------------
i = find(lambda l: "Dry run complete" in l)
assert i >= 0, "P9a miss: dry run"
if "ok(" not in lines[i]:
    indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
    replace_lines("dryrun-line", i, i + 1,
                  [indent + 'ok("Dry run complete. Workflow files generated but not executed.");'])
i = find(lambda l: "Starting workflow execution" in l)
assert i >= 0, "P9b miss: starting"
if "info(" not in lines[i]:
    indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
    replace_lines("starting-line", i, i + 1, [indent + 'info("Starting workflow execution...");'])

# --- P10: top-level catch --------------------------------------------------------
i = find(lambda l: "❌ Error:" in l)
assert i >= 0, "P10 miss: top catch"
if "err(" not in lines[i]:
    indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
    replace_lines("top-catch", i, i + 1, [indent + "err(`Error: ${error.message}`);"])

out = "\n".join(lines)
open(PATH, "w", encoding="utf-8").write(out)
print(f"patched {PATH}: {', '.join(applied) or 'no changes (already applied)'}")

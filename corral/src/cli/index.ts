#!/usr/bin/env bun
/**
 * Corral CLI entry point
 * Resolves prompt, ensures jj workspace, and delegates to runner.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, printHelp, getFlagString, hasFlag } from "./args";
import { dumpCheckEnv, loadSecrets, parseFinite } from "./env";
import { ensureWorkspace } from "./workspace";
import { detectAgents } from "./detect-agents";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

async function main() {
  loadSecrets();
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);

  if (hasFlag(parsed.flags, "help") || (parsed.positional.length === 0 && Object.keys(parsed.flags).length === 0)) {
    printHelp();
    return;
  }
  if (hasFlag(parsed.flags, "check-env")) dumpCheckEnv();

  const requestedCwd = getFlagString(parsed.flags, "cwd")? resolve(getFlagString(parsed.flags, "cwd")!) : process.cwd();
  let promptArg = parsed.positional[0];

  if (!promptArg) {
    const { err } = await import("../ui/cli-style");
    err("No prompt provided");
    printHelp();
    process.exit(1);
  }

  let promptText: string;
  let promptSourcePath: string | null = null;
  if (existsSync(promptArg) &&!promptArg.startsWith("http")) {
    const { readFile } = await import("node:fs/promises");
    promptText = await readFile(promptArg, "utf8");
    promptSourcePath = resolve(promptArg);
  } else {
    promptText = promptArg;
  }

  const repoRoot = await ensureWorkspace(requestedCwd, promptSourcePath);
  const runId = getFlagString(parsed.flags, "run-id")?? `corral-${Date.now()}`;
  const maxConcurrency = parseFinite(getFlagString(parsed.flags, "max-concurrency"), 8);
  const maxIterations = parseFinite(getFlagString(parsed.flags, "max-iterations"), 25);
  const headless = false;

  if (hasFlag(parsed.flags, "report")) {
    const { writeRunReport } = await import("../report/renderReport");
    const reportPath = await writeRunReport({ runId, root: repoRoot, prompt: promptText });
    console.log(reportPath);
    return;
  }

  if (hasFlag(parsed.flags, "dry-run")) {
    const { renderWorkflowFile } = await import("./generator");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const superRalphDir = join(repoRoot, ".super-ralph", "generated");
    const corralDir = join(repoRoot, ".corral", "generated");
    await mkdir(superRalphDir, { recursive: true });
    await mkdir(corralDir, { recursive: true });
    const source = renderWorkflowFile({
      promptText, promptSpecPath: promptSourcePath, repoRoot,
      dbPath: join(repoRoot, ".smithers", "workflow.db"),
      packageScripts: {}, detectedAgents: detectAgents(),
      fallbackConfig: { maxConcurrency, maxIterations }, maxIterations,
      superRalphSourceRoot: resolve(__dirname, "..", ".."), runningFromSource: true,
    });
    await writeFile(join(superRalphDir, "workflow.tsx"), source, "utf8");
    await writeFile(join(corralDir, "workflow.tsx"), source, "utf8");
    console.log(`Dry run complete. Workflow generated at ${join(superRalphDir, "workflow.tsx")}`);
    return;
  }

  const { runWorkflow } = await import("./runner");
  await runWorkflow({
    repoRoot, promptText, promptSourcePath, runId, maxConcurrency, maxIterations,
    skipQuestions: hasFlag(parsed.flags, "skip-questions"), headless,
  });
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});

/**
 * Workflow runner for Smithers.
 * Spawns the Smithers CLI with the generated workflow.
 * Uses `up` subcommand (smthrs 0.35.0+) or `run` (legacy) and `--preload` (bun 1.4.2+).
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { banner, ok, err, warn, info, kv, summaryBox } from "../ui/cli-style";
import { CorralTimer } from "../timing";
import { writeRunReport } from "../report/renderReport";
import { detectExactReply, normalizeReply } from "../exactReply";
import { renderWorkflowFile } from "./generator";
import { detectAgents } from "./detect-agents";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const GENERATED_PRELOAD_SOURCE = `import { mdxPlugin } from "smthrs/mdx-plugin";
mdxPlugin();
import { plugin } from "bun";
import { createRequire } from "node:module";
const UNSTABLE_PREFIX = "effect/unstable/";
const UNSTABLE_SHIMS = ["cluster","cluster/Entity","cluster/MessageStorage","cluster/RunnerHealth","cluster/Runners","cluster/RunnerStorage","cluster/Sharding","cluster/ShardingConfig","cluster/SingleRunner","http/FetchHttpClient","observability/Otlp","process/ChildProcess","process/ChildProcessSpawner","reactivity/Reactivity","rpc/Rpc","rpc/RpcGroup","sql/SqlClient","sql/SqlError","sql/Statement","workflow","workflow/Activity","workflow/DurableDeferred","workflow/Workflow","workflow/WorkflowEngine"];
function unstableResolvesNatively(): boolean { try { createRequire(import.meta.url).resolve(UNSTABLE_PREFIX + "workflow"); return true; } catch { return false; } }
if (!unstableResolvesNatively()) {
  plugin({ name: "effect-unstable-compat", setup(build) {
    for (const rest of UNSTABLE_SHIMS) {
      build.module(UNSTABLE_PREFIX + rest, async () => {
        const mod = await import("effect/" + rest);
        return { loader: "object", exports: {...mod} };
      });
    }
  }});
}
`;

/** Options for running a Smithers workflow */
export type RunWorkflowOpts = {
  repoRoot: string;
  promptText: string;
  promptSourcePath: string | null;
  runId: string;
  maxConcurrency: number;
  maxIterations: number;
  skipQuestions: boolean;
  headless: boolean;
};

export interface SmithersCliResolution {
  cliPath: string;
  packageRoot: string;
  subcommand: string;
}

export function findSmithersCli(repoRoot: string, sourceRoot: string): SmithersCliResolution {
  const packageRoots: string[] = [];

  try {
    const req = createRequire(import.meta.url);
    const resolvedPkg = req.resolve("smthrs/package.json");
    packageRoots.push(dirname(resolvedPkg));
  } catch {}

  try {
    const req = createRequire(import.meta.url);
    const resolvedPkg = req.resolve("smithers-orchestrator/package.json");
    packageRoots.push(dirname(resolvedPkg));
  } catch {}

  packageRoots.push(
    join(sourceRoot, "node_modules", "smthrs"),
    join(sourceRoot, "node_modules", "smithers-orchestrator"),
    join(repoRoot, "node_modules", "smthrs"),
    join(repoRoot, "node_modules", "smithers-orchestrator"),
    join(repoRoot, ".smithers", "node_modules", "smthrs"),
    join(repoRoot, ".smithers", "node_modules", "smithers-orchestrator"),
    join(process.env.HOME || "", "smithers"),
  );

  const seen = new Set<string>();
  const probed: string[] = [];

  for (const root of packageRoots) {
    if (!root || seen.has(root)) continue;
    seen.add(root);

    // 1. Inspect package.json "bin" field
    const pkgJsonPath = join(root, "package.json");
    if (existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
        const bin = pkg.bin;
        const binRel = typeof bin === "string"
          ? bin
          : bin && typeof bin === "object"
            ? (bin.smithers || bin.smthrs || Object.values(bin)[0] as string)
            : null;
        if (binRel) {
          const cliPath = resolve(root, binRel);
          probed.push(cliPath);
          if (existsSync(cliPath)) {
            return { cliPath, packageRoot: root, subcommand: "up" };
          }
        }
      } catch {}
    }

    // 2. Inspect relative layout candidates
    const relCandidates = [
      join("src", "bin", "smithers.js"),
      join("dist", "cli.js"),
      "cli.js",
      join("src", "cli", "index.ts"),
    ];
    for (const rel of relCandidates) {
      const cliPath = join(root, rel);
      probed.push(cliPath);
      if (existsSync(cliPath)) {
        const subcommand = rel.includes("src/cli/index.ts") ? "run" : "up";
        return { cliPath, packageRoot: root, subcommand };
      }
    }
  }

  // 3. Check .bin symlinks
  const binCandidates = [
    join(sourceRoot, "node_modules", ".bin", "smithers"),
    join(repoRoot, "node_modules", ".bin", "smithers"),
  ];
  for (const b of binCandidates) {
    probed.push(b);
    if (existsSync(b)) {
      return { cliPath: b, packageRoot: dirname(dirname(b)), subcommand: "up" };
    }
  }

  throw new Error(`smithers not found in ${probed.join(", ")}`);
}

/** Execute the workflow via `bun --preload <preload> <smithers-cli> up <workflow>` */
export async function runWorkflow(opts: RunWorkflowOpts): Promise<void> {
  const { repoRoot, promptText, promptSourcePath, runId, maxConcurrency, maxIterations, skipQuestions, headless } = opts;
  const timer = new CorralTimer(runId);
  const superRalphSourceRoot = resolve(__dirname, "..", "..");
  const superRalphPreload = join(superRalphSourceRoot, "preload.ts");

  const resolution = findSmithersCli(repoRoot, superRalphSourceRoot);
  const smithersCliPath = resolution.cliPath;
  const smithersSubcommand = resolution.subcommand;

  const workDir = join(repoRoot, ".corral");
  await mkdir(workDir, { recursive: true });
  const generatedDir = join(workDir, "generated");
  await mkdir(generatedDir, { recursive: true });
  const smithersDir = join(repoRoot, ".smithers");
  await mkdir(smithersDir, { recursive: true });

  const effectiveWorkflowPath = join(workDir, "workflow.tsx");
  const generatedWorkflowPath = join(generatedDir, "workflow.tsx");
  const dbPath = join(smithersDir, "workflow.db");

  // Always generate a fresh, fully configured workflow for this run
  const workflowSource = renderWorkflowFile({
    promptText,
    promptSpecPath: promptSourcePath,
    repoRoot,
    dbPath,
    packageScripts: {},
    detectedAgents: detectAgents(),
    fallbackConfig: { maxConcurrency, maxIterations },
    maxIterations,
    superRalphSourceRoot,
    runningFromSource: true,
  });

  await writeFile(effectiveWorkflowPath, workflowSource, "utf8");
  await writeFile(generatedWorkflowPath, workflowSource, "utf8");

  // Also maintain .super-ralph/generated/workflow.tsx for backward compatibility
  const superRalphGenDir = join(repoRoot, ".super-ralph", "generated");
  await mkdir(superRalphGenDir, { recursive: true });
  await writeFile(join(superRalphGenDir, "workflow.tsx"), workflowSource, "utf8");

  const preloadPath = join(workDir, "preload.ts");
  const useShared = existsSync(superRalphPreload);
  if (!useShared) await writeFile(preloadPath, GENERATED_PRELOAD_SOURCE, "utf8");
  await writeFile(join(workDir, "bunfig.toml"), `preload = ["${useShared ? superRalphPreload : "./preload.ts"}"]\n`, "utf8");

  // Ensure node_modules can be resolved from .corral
  const corralNodeModules = join(workDir, "node_modules");
  const sourceNodeModules = join(superRalphSourceRoot, "node_modules");
  if (!existsSync(corralNodeModules) && existsSync(sourceNodeModules)) {
    try {
      await symlink(sourceNodeModules, corralNodeModules, "dir");
    } catch {}
  }

  if (!headless) {
    console.log(`🚀 Sovereign Corral — Multi-Agent Ticket Orchestration`);
    console.log(`📁 Repo: ${repoRoot}`);
    console.log(`🆔 Run ID: ${runId}`);
    kv([["concurrency", String(maxConcurrency)], ["max iterations", String(maxIterations)], ["smithers", smithersSubcommand]]);
    console.log("");
  }
  info("Starting workflow execution...");

  const execCwd = existsSync(join(superRalphSourceRoot, "node_modules")) ? superRalphSourceRoot : repoRoot;
  const effectivePreload = useShared ? superRalphPreload : preloadPath;

  const args = [
    "--preload",
    effectivePreload,
    smithersCliPath,
    smithersSubcommand,
    effectiveWorkflowPath,
    "--root",
    repoRoot,
    "--run-id",
    runId,
    "--max-concurrency",
    String(maxConcurrency),
  ];

  const env = { ...process.env, USE_CLI_AGENTS: "1", SMITHERS_DEBUG: "1", NODE_ENV: "production" } as any;
  delete env.CLAUDECODE;

  const proc = Bun.spawn(["bun", "--no-install", ...args], {
    cwd: execCwd,
    env,
    stdout: headless ? "ignore" : "inherit",
    stderr: "inherit",
    stdin: headless ? "ignore" : "inherit",
  });

  const exitCode = await timer.measure("workflow-execute", () => proc.exited);
  const timingSummary = timer.summary();

  if (exitCode === 0) {
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
    const resolvedDbPath = existsSync(dbPath) ? dbPath : join(repoRoot, ".smithers", "db.sqlite");
    await printFinalReply(resolvedDbPath, runId, headless, promptText);
  } else {
    err(`Workflow exited with code ${exitCode}`);
    console.error(timingSummary);
    process.exit(exitCode);
  }
}

async function writeReportQuietly(runId: string, repoRoot: string, promptText: string): Promise<string | null> {
  try {
    return await writeRunReport({ runId, root: repoRoot, prompt: promptText });
  } catch {
    return null;
  }
}

async function printFinalReply(dbPath: string, runId: string, headless: boolean, promptText: string) {
  try {
    const { Database } = await import("bun:sqlite");
    const db = new Database(dbPath, { readonly: true });
    let row: any = null;
    try {
      row = db.query(`SELECT reply FROM final_report WHERE run_id = ? ORDER BY iteration DESC LIMIT 1`).get(runId) as any;
    } catch {
      // table absent
    }
    db.close();
    if (row?.reply) {
      let reply = normalizeReply(String(row.reply));
      const expected = detectExactReply(promptText);
      if (expected !== null) {
        if (reply !== String(row.reply)) {
          try {
            const dbw = new Database(dbPath);
            dbw.query(`UPDATE final_report SET reply = ? WHERE run_id = ?`).run(reply, runId);
            dbw.close();
          } catch {}
        }
        if (reply !== expected) {
          console.error(
            `\n❌ Exact-reply mismatch: expected ${expected.length} bytes ${JSON.stringify(expected)}, got ${reply.length} bytes ${JSON.stringify(reply)}.\n`
          );
          process.exit(1);
        }
      }
      if (headless) {
        process.stdout.write(reply);
      } else {
        console.log(String(row.reply));
      }
    } else if (headless) {
      console.error("(final report unavailable)");
      process.exit(1);
    } else {
      console.log("(final report unavailable)");
    }
  } catch (e: any) {
    if (headless) {
      console.error(`(could not read final report: ${e?.message ?? e})`);
      process.exit(1);
    }
    console.log(`(could not read final report: ${e?.message ?? e})`);
  }
}

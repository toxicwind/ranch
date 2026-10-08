import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export interface RenderWorkflowParams {
  promptText: string;
  promptSpecPath?: string | null;
  repoRoot: string;
  dbPath: string;
  packageScripts?: Record<string, string>;
  detectedAgents: { claude: boolean; codex: boolean };
  fallbackConfig: any;
  clarificationSession?: any | null;
  maxIterations: number;
  superRalphSourceRoot: string;
  runningFromSource: boolean;
}

function detectScriptRunner(repoRoot: string): "bun" | "pnpm" | "yarn" | "npm" {
  if (existsSync(join(repoRoot, "bun.lock")) || existsSync(join(repoRoot, "bun.lockb"))) return "bun";
  if (existsSync(join(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(repoRoot, "yarn.lock"))) return "yarn";
  return "npm";
}

function scriptCommand(runner: "bun" | "pnpm" | "yarn" | "npm", scriptName: string): string {
  if (runner === "bun") return `bun run ${scriptName}`;
  if (runner === "pnpm") return `pnpm run ${scriptName}`;
  if (runner === "yarn") return `yarn ${scriptName}`;
  return `npm run ${scriptName}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

function loadPackageScripts(repoRoot: string): Record<string, string> {
  const packageJsonPath = join(repoRoot, "package.json");
  if (!existsSync(packageJsonPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
    if (!parsed || typeof parsed !== "object" || !parsed.scripts || typeof parsed.scripts !== "object") {
      return {};
    }
    return parsed.scripts;
  } catch {
    return {};
  }
}

export function buildFallbackConfig(
  repoRoot: string,
  promptSpecPath: string | null = null,
  packageScripts: Record<string, string> = {},
  overrides?: { maxConcurrency?: number; maxIterations?: number }
) {
  const runner = detectScriptRunner(repoRoot);

  const buildCmds: Record<string, string> = {};
  const testCmds: Record<string, string> = {};

  if (packageScripts.typecheck) {
    buildCmds.typecheck = scriptCommand(runner, "typecheck");
  }
  if (packageScripts.build) {
    buildCmds.build = scriptCommand(runner, "build");
  }
  if (packageScripts.lint) {
    buildCmds.lint = scriptCommand(runner, "lint");
  }
  if (packageScripts.test) {
    testCmds.test = scriptCommand(runner, "test");
  }

  if (existsSync(join(repoRoot, "go.mod"))) {
    buildCmds.go = buildCmds.go ?? "go build ./...";
    testCmds.go = testCmds.go ?? "go test ./...";
  }

  if (existsSync(join(repoRoot, "Cargo.toml"))) {
    buildCmds.rust = buildCmds.rust ?? "cargo build";
    testCmds.rust = testCmds.rust ?? "cargo test";
  }

  if (Object.keys(buildCmds).length === 0) {
    buildCmds.verify = runner === "bun" ? "bun run typecheck" : "echo \"Add build/typecheck command\"";
  }

  if (Object.keys(testCmds).length === 0) {
    testCmds.tests = runner === "bun" ? "bun test" : "echo \"Add test command\"";
  }

  const specsPathCandidates = [
    join(repoRoot, "docs/specs/engineering.md"),
    join(repoRoot, "docs/specs"),
    join(repoRoot, "specs"),
  ];
  if (promptSpecPath) specsPathCandidates.push(promptSpecPath);

  const chosenSpecs = specsPathCandidates.find((candidate) => existsSync(candidate)) ?? promptSpecPath ?? "";

  const projectName = basename(repoRoot);
  const maxConcurrency = overrides?.maxConcurrency ?? Math.min(Math.max(Number(process.env.WORKFLOW_MAX_CONCURRENCY) || 6, 1), 32);

  return {
    projectName,
    projectId: slugify(projectName),
    focuses: [
      { id: "core", name: "Core Platform" },
      { id: "api", name: "API and Data" },
      { id: "workflow", name: "Workflow and Automation" },
    ],
    specsPath: chosenSpecs,
    referenceFiles: [
      promptSpecPath,
      existsSync(join(repoRoot, "README.md")) ? "README.md" : "",
      existsSync(join(repoRoot, "docs")) ? "docs" : "",
    ].filter(Boolean),
    buildCmds,
    testCmds,
    preLandChecks: Object.values(buildCmds),
    postLandChecks: Object.values(testCmds),
    codeStyle: "Follow existing project conventions and keep changes minimal and test-driven.",
    reviewChecklist: [
      "Spec compliance",
      "Tests cover behavior changes",
      "No regression risk in existing flows",
      "Error handling and observability",
    ],
    maxConcurrency,
    maxIterations: overrides?.maxIterations ?? 25,
  };
}

export function renderWorkflowFile(params: RenderWorkflowParams): string {
  const {
    promptText,
    promptSpecPath = null,
    repoRoot,
    dbPath,
    packageScripts: inputPackageScripts,
    detectedAgents,
    fallbackConfig,
    clarificationSession = null,
    maxIterations,
    superRalphSourceRoot,
    runningFromSource,
  } = params;

  const packageScripts = inputPackageScripts && Object.keys(inputPackageScripts).length > 0
    ? inputPackageScripts
    : loadPackageScripts(repoRoot);

  const effectiveFallbackConfig = {
    ...buildFallbackConfig(repoRoot, promptSpecPath, packageScripts, fallbackConfig),
    ...fallbackConfig,
  };

  const isSuperRalphRepo =
    existsSync(join(repoRoot, "src/components/SuperRalph.tsx")) &&
    existsSync(join(repoRoot, "src/components/ClarifyingQuestions.tsx"));

  let importPrefix: string;
  if (isSuperRalphRepo) {
    importPrefix = "../../src";
  } else if (runningFromSource) {
    importPrefix = superRalphSourceRoot + "/src";
  } else {
    importPrefix = "@sovereign/corral";
  }

  return `import React from "react";
import { createSmithers, ClaudeCodeAgent, CodexAgent, Sequence, Ralph } from "smthrs";
import { SuperRalph } from "${importPrefix}";
import { InterpretConfig, FinalReport, CompletionValidator } from "${importPrefix}/components";
import { ralphOutputSchemas } from "${importPrefix}";

const REPO_ROOT = ${JSON.stringify(repoRoot)};
const DB_PATH = ${JSON.stringify(dbPath)};
const HAS_CLAUDE = ${detectedAgents.claude};
const HAS_CODEX = ${detectedAgents.codex};
const PROMPT_TEXT = ${JSON.stringify(promptText)};
const PROMPT_SPEC_PATH = ${JSON.stringify(promptSpecPath)};
const PACKAGE_SCRIPTS = ${JSON.stringify(packageScripts, null, 2)};
const FALLBACK_CONFIG = ${JSON.stringify(effectiveFallbackConfig, null, 2)};
const CLARIFICATION_SESSION = ${JSON.stringify(clarificationSession)};
// Finite-by-default: Ralph loops exit on a real done predicate; this ceiling
// is the backstop (onMaxReached="fail" makes exhaustion loud, exit non-zero).
const MAX_ITERATIONS = ${maxIterations};
const { smithers, outputs, Workflow } = createSmithers(
  ralphOutputSchemas,
  { dbPath: DB_PATH }
);

function createClaude(systemPrompt: string) {
  return new ClaudeCodeAgent({
    model: process.env.NIM_MODEL || "claude-sonnet-4-6",
    systemPrompt,
    cwd: REPO_ROOT,
    dangerouslySkipPermissions: true,
    timeoutMs: 60 * 60 * 1000,
  });
}

function createCodex(systemPrompt: string) {
  return new CodexAgent({
    model: "gpt-5.3-codex",
    systemPrompt,
    cwd: REPO_ROOT,
    yolo: true,
    timeoutMs: 60 * 60 * 1000,
  });
}

function choose(primary: "claude" | "codex", systemPrompt: string) {
  if (primary === "claude" && HAS_CLAUDE) return createClaude(systemPrompt);
  if (primary === "codex" && HAS_CODEX) return createCodex(systemPrompt);
  if (HAS_CLAUDE) return createClaude(systemPrompt);
  return createCodex(systemPrompt);
}

const planningAgent = choose("claude", "Plan and research next tickets.");
const implementationAgent = choose("claude", "Implement with test-driven development and jj workflows.");
const testingAgent = choose("claude", "Run tests and validate behavior changes.");
const reviewingAgent = choose("codex", "Review for regressions, spec drift, and correctness.");
const reportingAgent = choose("claude", "Write concise, accurate ticket status reports.");
const finalAgent = choose("claude", "Write the final reply for a completed autonomous workflow run. Follow the task instructions exactly; when asked for an exact reply, output only that.");
const validatorAgent = choose("claude", "Validate that a completed autonomous workflow run actually satisfied the original goal. Be strict, literal, and evidence-driven.");

export default smithers((ctx) => (
  <Workflow name="super-ralph-full">
    <Sequence>
      {/* Step 1: Interpret Config (clarification session already collected by CLI) */}
      <InterpretConfig
        prompt={PROMPT_TEXT}
        clarificationSession={CLARIFICATION_SESSION}
        repoRoot={REPO_ROOT}
        fallbackConfig={FALLBACK_CONFIG}
        packageScripts={PACKAGE_SCRIPTS}
        detectedAgents={{
          claude: HAS_CLAUDE,
          codex: HAS_CODEX,
          gh: false,
        }}
        agent={planningAgent}
      />

      {/* Step 2: Run the finite SuperRalph work loops (skipped for simple replies) */}
      {(ctx.latest("interpret_config", "interpret-config") as any)?.isSimpleReply !== true && (
      <SuperRalph
        ctx={ctx}
        outputs={outputs}
        {...((ctx.latest("interpret_config", "interpret-config") as any) || FALLBACK_CONFIG)}
        maxIterations={MAX_ITERATIONS}
        agents={{
          planning: { agent: planningAgent, description: "Plan and research next tickets.", isScheduler: true },
          implementation: { agent: implementationAgent, description: "Implement with test-driven development and jj workflows." },
          testing: { agent: testingAgent, description: "Run tests and validate behavior changes." },
          reviewing: { agent: reviewingAgent, description: "Review for regressions, spec drift, and correctness." },
          reporting: { agent: reportingAgent, description: "Write concise, accurate ticket status reports." },
        }}
      />
      )}

      {/* Step 3: Final report - produces the reply the CLI prints */}
      <FinalReport
        prompt={PROMPT_TEXT}
        agent={finalAgent}
        output={outputs.final_report}
      />

      {/* Step 4: Completion validation - quiescence is not completion.
          A run that stops without satisfying the original goal must never
          exit 0. valid=false fails loudly: non-zero exit, failed workflow row. */}
      <Ralph
        until={(ctx.latest("completion_validator", "completion-validator") as any)?.valid === true}
        maxIterations={1}
        onMaxReached="fail"
      >
        <CompletionValidator
          prompt={PROMPT_TEXT}
          agent={validatorAgent}
          ctx={ctx}
          output={outputs.completion_validator}
        />
      </Ralph>
    </Sequence>
  </Workflow>
));
`;
}

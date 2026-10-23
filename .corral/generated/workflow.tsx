import React from "react";
import { createSmithers, ClaudeCodeAgent, CodexAgent, Sequence, Ralph } from "smthrs";
import { SuperRalph } from "/home/toxic/estate/ranch/corral/src";
import { InterpretConfig, FinalReport, CompletionValidator } from "/home/toxic/estate/ranch/corral/src/components";
import { ralphOutputSchemas } from "/home/toxic/estate/ranch/corral/src";

const REPO_ROOT = "/home/toxic/estate/ranch";
const DB_PATH = "/home/toxic/estate/ranch/.smithers/workflow.db";
const HAS_CLAUDE = true;
const HAS_CODEX = false;
const PROMPT_TEXT = "roost] DRIFT: provider policy for moonshot has no PROVIDER_DEFS definition — skipping. Add the definition to ranch/mesh/catalog or remove the entry from TAU_PROVIDER_POLICY. - fix roost drift";
const PROMPT_SPEC_PATH = null;
const PACKAGE_SCRIPTS = {
  "build": "mise exec -- moon run :build",
  "build:drover": "bun run --cwd drover build",
  "ci": "mise exec -- moon ci",
  "lint": "mise exec -- moon run :lint",
  "test": "mise exec -- moon run :test",
  "typecheck": "bun run --filter '*' typecheck"
};
const FALLBACK_CONFIG = {
  "projectName": "ranch",
  "projectId": "ranch",
  "focuses": [
    {
      "id": "core",
      "name": "Core Platform"
    },
    {
      "id": "api",
      "name": "API and Data"
    },
    {
      "id": "workflow",
      "name": "Workflow and Automation"
    }
  ],
  "specsPath": "",
  "referenceFiles": [
    "README.md",
    "docs"
  ],
  "buildCmds": {
    "typecheck": "bun run typecheck",
    "build": "bun run build",
    "lint": "bun run lint"
  },
  "testCmds": {
    "test": "bun run test"
  },
  "preLandChecks": [
    "bun run typecheck",
    "bun run build",
    "bun run lint"
  ],
  "postLandChecks": [
    "bun run test"
  ],
  "codeStyle": "Follow existing project conventions and keep changes minimal and test-driven.",
  "reviewChecklist": [
    "Spec compliance",
    "Tests cover behavior changes",
    "No regression risk in existing flows",
    "Error handling and observability"
  ],
  "maxConcurrency": 8,
  "maxIterations": 10
};
const CLARIFICATION_SESSION = null;
// Finite-by-default: Ralph loops exit on a real done predicate; this ceiling
// is the backstop (onMaxReached="fail" makes exhaustion loud, exit non-zero).
const MAX_ITERATIONS = 10;
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
  throw new Error("corral: no agent engine available (claude and codex both failed detection). Install claude or codex, or set OPENAI_API_KEY.");
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

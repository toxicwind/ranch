/**
 * CLI argument parsing for Corral.
 * Supports `corral "prompt"` and legacy `corral run "prompt"` / `corral up "prompt"`.
 */

import { banner, kv } from "../ui/cli-style";

/** Parsed CLI arguments */
export type ParsedArgs = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

const BOOLEAN_FLAGS = new Set(["help", "dry-run", "skip-questions", "check-env", "report"]);

/** Print usage help */
export function printHelp(): void {
  banner("Multi-Agent Engineering & Ticket Orchestration");
  console.log("Usage:"); console.log(' corral "prompt text"'); console.log(" corral./specs/feature.md --max-concurrency 8"); console.log("");
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
}

/** Parse argv into positional args and flags */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (BOOLEAN_FLAGS.has(key) ||!next || next.startsWith("--")) { flags[key] = true; continue; }
    flags[key] = next; i++;
  }
  if (positional[0] === "run" || positional[0] === "up") positional.shift();
  return { positional, flags };
}

/** Get string value for a flag */
export function getFlagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const v = flags[name]; return typeof v === "string"? v : undefined;
}

/** Check if a flag is present */
export function hasFlag(flags: Record<string, string | boolean>, name: string): boolean {
  return flags[name] === true || typeof flags[name] === "string";
}

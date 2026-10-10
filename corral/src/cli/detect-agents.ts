/**
 * Real agent-engine detection for corral workflow generation.
 * Previously hardcoded { claude: true, codex: true }, which generated
 * workflows that died at runtime when codex was missing (exit 1 on the
 * review task, 2026-10-09). Now probes the actual environment.
 */
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export type DetectedAgents = { claude: boolean; codex: boolean };

function onPath(bin: string): boolean {
  try {
    execSync(`command -v ${bin}`, { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function codexAuthPresent(): boolean {
  if (process.env.OPENAI_API_KEY) return true;
  // codex CLI file-based auth
  if (existsSync(join(homedir(), ".codex", "auth.json"))) return true;
  return false;
}

export function detectAgents(): DetectedAgents {
  const claude = onPath("claude");
  const codex = onPath("codex") && codexAuthPresent();
  return { claude, codex };
}

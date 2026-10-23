/**
 * agents.ts — bridge estate-brain <-> Rig/OpenFang agents.
 *
 * The estate's canonical agent launch configs live in this repo under
 * `agents/<name>/agent.toml` (moved here from estate/agents). The Rig/OpenFang
 * kernel re-seeds the live run dir (`~/.openfang/agents/`) from these on boot,
 * so "deploying" an agent = copying the canonical agent.toml to the live dir.
 *
 * Each agent's `[persona]` block (name/role/sigil) is bridged back to the
 * persona registry so an agent acting as its persona uses the right signing
 * identity and channels. Zero hard deps (Bun stdlib + toml parsing via the
 * bundled `toml`-lite below for the fields we care about).
 */

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePersona } from "./registry";
import type { Registry } from "./types";

export const AGENTS_DIR = fileURLToPath(new URL("../agents", import.meta.url));

export interface AgentInfo {
  name: string;
  /** persona name from [persona].name, if present */
  persona: string | null;
  role: string;
  sigil: string;
  /** canonical agent.toml path in this repo */
  toml: string;
  has_toml: boolean;
  /** persona binding (if the persona exists in the registry) */
  identity: string | null;
  key_file: string | null;
}

function parseNameFromToml(text: string): string {
  const m = text.match(/^\s*name\s*=\s*"([^"]+)"\s*$/m);
  return m ? m[1] : "";
}

function parsePersonaBlock(text: string): {
  name?: string;
  role?: string;
  sigil?: string;
} {
  const out: { name?: string; role?: string; sigil?: string } = {};
  const sec =
    text.match(/\[persona\]\s*\n([\s\S]*?)(?=\n\[|<)/) ??
    text.match(/\[persona\]\s*\n([\s\S]*)$/);
  const body = sec ? sec[1] : "";
  const grab = (k: string) =>
    body.match(new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, "m"))?.[1];
  out.name = grab("name")?.trim() || undefined;
  out.role = grab("role")?.trim() || undefined;
  out.sigil = grab("sigil")?.trim() || undefined;
  return out;
}

async function listAgents(): Promise<AgentInfo[]> {
  const out: AgentInfo[] = [];
  const nodes = await readdir(AGENTS_DIR, { withFileTypes: true }).catch(
    () => [] as import("node:fs").Dirent[],
  );
  for (const node of nodes) {
    if (!node.isDirectory() || node.name.startsWith(".")) continue;
    const dir = join(AGENTS_DIR, node.name);
    const tomlPath = join(dir, "agent.toml");
    const has = await Bun.file(tomlPath).exists();
    let persona: string | null = null;
    let role = "";
    let sigil = "";
    let tomlText = "";
    if (has) {
      tomlText = await Bun.file(tomlPath).text();
      const p = parsePersonaBlock(tomlText);
      persona = p.name ?? null;
      role = p.role ?? "";
      sigil = p.sigil ?? "";
    }
    const name = (persona ?? parseNameFromToml(tomlText)) || node.name;
    out.push({
      name,
      persona,
      role,
      sigil,
      toml: tomlPath,
      has_toml: has,
      identity: null,
      key_file: null,
    });
  }
  return out;
}
/** Decorate agents with persona bindings from the registry. */
export function bindAgents(reg: Registry, agents: AgentInfo[]): AgentInfo[] {
  // build identity -> persona key map (case-insensitive) for lookups
  const byIdentity = new Map<string, string>();
  for (const [k, p] of Object.entries(reg.profiles)) {
    byIdentity.set(p.identity.toLowerCase(), k);
    byIdentity.set(k.toLowerCase(), k);
  }
  for (const a of agents) {
    const probe = (a.persona ?? a.name).toLowerCase();
    const key = byIdentity.get(probe);
    if (!key) {
      a.identity = null;
      a.key_file = null;
      continue;
    }
    const r = resolvePersona(reg, key);
    a.identity = r.identity;
    a.key_file = r.key_file;
  }
  return agents;
}

export async function loadAgents(reg: Registry): Promise<AgentInfo[]> {
  return bindAgents(reg, await listAgents());
}

/** Deploy canonical agent.toml files to the live OpenFang agents dir. */
export async function deployAgents(
  agents: AgentInfo[],
  liveDir: string,
): Promise<string[]> {
  const written: string[] = [];
  for (const a of agents) {
    if (!a.has_toml) continue;
    const target = join(liveDir, a.name, "agent.toml");
    await Bun.$`mkdir -p ${dirname(target)}`.quiet();
    await Bun.write(target, await Bun.file(a.toml).text());
    await Bun.$`chmod 600 ${target}`.quiet();
    written.push(target);
  }
  return written;
}

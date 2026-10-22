#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const RANCH_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GM = join(RANCH_ROOT, ".gitmodules");
const THEMES = join(RANCH_ROOT, ".meta-themes.yaml");
const OUT = join(RANCH_ROOT, ".meta.yaml");

// ---- theme classification: DUMB + DATA-DRIVEN (no monkey-patch) -------------
// Read the canonical theme map from .meta-themes.yaml. Every array-valued key is
// a HOLDER (a bounded-context column); the `prefixes` block is a WHITELIST-only
// convenience for homogeneous structural containers (nim, websites). The
// generator carries ZERO hardcoded holder name sets, ZERO name/token heuristics:
//   holder = map[path] ?? map[topLevel] ?? prefixWhitelist ?? "general"
// Changes to theme membership are DATA edits (add/move a line in the yaml), never
// a recompile. Grounded in THEME-DESIGN.md (DDD bounded-context context map,
// HiGitClass curated-map>keywords, MUDABlue humans-name, SIGSOFT'19 monorepo).
const themeCfg = parseYaml(readFileSync(THEMES, "utf8")) as Record<
  string,
  string[] | Record<string, string[]>
>;

// Every array-valued top-level key is a holder list (explicit path -> holder).
const HOLDER_ORDER: string[] = Object.keys(themeCfg).filter((k) =>
  Array.isArray(themeCfg[k]),
);
const map = new Map<string, string>();
for (const holder of HOLDER_ORDER)
  for (const p of themeCfg[holder] as string[]) map.set(p, holder);

// Whitelist-only prefixes (structural containers whose members are homogeneous).
// Only these keys are honored; `submodules`/`tools`/`vendor` are NEVER holders.
const prefixCfg = (themeCfg.prefixes ?? {}) as Record<string, string[]>;

// Synthetic peers that are their own repos but not tracked as ranch submodules.
// This is an inventory correction (a repo EXISTS), not a category heuristic.
const SYNTHETIC = ["olympus", "skopos"];

const raw = readFileSync(GM, "utf8");
const entries: { path: string; url: string }[] = [];
let cur: { path: string; url: string } | null = null;
for (const line of raw.split("\n")) {
  const sec = line.match(/^\[submodule "([^"]+)"\]/);
  if (sec) {
    if (cur) entries.push(cur);
    cur = { path: "", url: "" };
    continue;
  }
  const p = line.match(/^\s*path\s*=\s*(.+)$/);
  if (p && cur) cur.path = p[1].trim();
  const u = line.match(/^\s*url\s*=\s*(.+)$/);
  if (u && cur) cur.url = u[1].trim();
}
if (cur) entries.push(cur);

const uniq = new Map<string, string>();
for (const e of entries) if (e.path && e.url) uniq.set(e.path, e.url);
for (const p of SYNTHETIC) uniq.set(p, `https://github.com/toxicwind/${p}.git`);

const topLevel = (p: string): string => p.split("/")[0];

function holderOf(path: string): string {
  // exact path -> top-level segment -> prefix whitelist -> "general"
  if (map.has(path)) return map.get(path)!;
  if (map.has(topLevel(path))) return map.get(topLevel(path))!;
  for (const [holder, pfxs] of Object.entries(prefixCfg))
    if (pfxs.some((pf) => path.startsWith(pf))) return holder;
  return "general";
}

const byCat = new Map<string, string[]>();
for (const p of [...uniq.keys()].sort((a, b) => a.localeCompare(b))) {
  const c = holderOf(p);
  if (!byCat.has(c)) byCat.set(c, []);
  byCat.get(c)!.push(p);
}

// CAT_ORDER is thematic only: the holders in .meta-themes.yaml key order, then
// `general` last. submodules/tools/vendor never appear as a category.
const CAT_ORDER = [...HOLDER_ORDER, "general"];

let y = `# ranch/.meta.yaml — the multi-repo manifest (meta 0.2.22+).\n`;
y += `# Generated from .gitmodules (${uniq.size} repos) — repos are PEERS, not\n`;
y += `# hierarchy: each stays an independent clone with its own history. Sync with\n`;
y += `#   meta git update       # clone missing + pull all\n`;
y += `#   meta git status       # per-repo state\n`;
y += `#   meta exec '<cmd>'     # run any command across every component\n`;
y += `# Regenerate: bun toolkit/gen-meta-manifest.ts\n`;
y += `# CATEGORIZED by theme (DATA-DRIVEN from .meta-themes.yaml — see\n`;
y += `# toolkit/THEME-DESIGN.md §2 for the 13 bounded-context holders; "general"\n`;
y += `# is the honest fallback). Edit the DATA, never this generator.\n`;
for (const cat of CAT_ORDER) {
  const members = byCat.get(cat);
  if (!members || !members.length) continue;
  y += `\n${cat}:\n`;
  for (const path of members)
    y += `  "${path}":\n    repo: ${uniq.get(path)}\n`;
}
writeFileSync(OUT, y);
console.log(
  `wrote ${OUT} with ${uniq.size} projects in ${byCat.size} categories (dumb, data-driven)`,
);

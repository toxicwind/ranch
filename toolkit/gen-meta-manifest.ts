#!/usr/bin/env bun
// tmp/gen-meta-manifest.ts — convert ranch/.gitmodules into a .meta.yaml
// manifest (meta 0.2.22 schema) so the estate can drive its 221 repos as
// peers with `meta git update` etc., instead of submodule churn.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Portable paths: derive the repo root from the script's own location.
const RANCH_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GM = join(RANCH_ROOT, ".gitmodules");
const OUT = join(RANCH_ROOT, ".meta.yaml");

const raw = readFileSync(GM, "utf8");
const entries: { path: string; url: string }[] = [];
let cur: { path: string; url: string } | null = null;
for (const line of raw.split("\n")) {
  const sec = line.match(/^\[submodule "([^"]+)"\]/);
  if (sec) { if (cur) entries.push(cur); cur = { path: "", url: "" }; continue; }
  const p = line.match(/^\s*path\s*=\s*(.+)$/);
  if (p && cur) cur.path = p[1].trim();
  const u = line.match(/^\s*url\s*=\s*(.+)$/);
  if (u && cur) cur.url = u[1].trim();
}
if (cur) entries.push(cur);

const uniq = new Map<string, string>();
for (const e of entries) if (e.path && e.url) uniq.set(e.path, e.url);

let y = `# ranch/.meta.yaml — the multi-repo manifest (meta 0.2.22+).\n`;
y += `# Generated from .gitmodules (${uniq.size} repos) — repos are PEERS, not\n`;
y += `# hierarchy: each stays an independent clone with its own history. Sync with\n`;
y += `#   meta git update       # clone missing + pull all\n`;
y += `#   meta git status       # per-repo state\n`;
y += `#   meta exec '<cmd>'     # run any command across every component\n`;
y += `# Regenerate: bun toolkit/gen-meta-manifest.ts\n`;
y += `projects:\n`;
for (const [path, url] of [...uniq.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  y += `  "${path}":\n    repo: ${url}\n`;
}
writeFileSync(OUT, y);
console.log(`wrote ${OUT} with ${uniq.size} projects`);
// ranch/scripts/audit-forks.ts
//
// For each `ranch/*` dir, find the *obvious* upstream reference and report it.
// Sources we look at, in order — first match wins:
//   1. .gitmodules path (we already track it as a submodule)
//   2. package.json `repository.url` (Node/TS projects)
//   3. Cargo.toml `package.repository` (Rust)
//   4. pyproject.toml `[project].urls.Homepage` / `[tool.poetry].repository` (Python)
//   5. go.mod module path (Go)
//   6. git remote `upstream` (some forks have one)
//   7. git remote `origin` if not toxicwind/*
//   8. README "Forked from" / "Based on" / "Copyright © YYYY <Author> (upstream X)" line
//
// We don't try to be clever. If a dir has no obvious upstream, we say so.
//
// Usage:
//   bun scripts/audit-forks.ts                  # write FORKS-report.md + .json
//   bun scripts/audit-forks.ts --resolve-origins   # + GitHub parent lookup

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const RANCH_ROOT = "/home/toxic/estate/ranch";
const CACHE_DIR = "/home/toxic/.cache/ranch-fork-audit";
mkdirSync(CACHE_DIR, { recursive: true });

const args = new Set(process.argv.slice(2));
const RESOLVE = args.has("--resolve-origins");

interface DirInfo {
  name: string;
  upstream: string | null;
  upstreamSource: string | null;
  remoteOrigin: string | null;
  hasGit: boolean;
  isSubmodule: boolean;
  sizeBytes: number;
  fileCount: number;
}

const REPO_PATTERNS: Array<{ file: string; pattern: RegExp; label: string }> = [
  { file: "package.json", pattern: /"repository"\s*:\s*\{[^}]*"url"\s*:\s*"(https?:\/\/[^"]+)"/, label: "package.json repository" },
  { file: "Cargo.toml", pattern: /\[package\][\s\S]{0,400}?repository\s*=\s*"(https?:\/\/[^"]+)"/, label: "Cargo.toml repository" },
  { file: "pyproject.toml", pattern: /\[(?:project|tool\.poetry)\][\s\S]{0,400}?(?:Homepage|homepage|Repository|repository)\s*=\s*"(https?:\/\/[^"]+)"/, label: "pyproject.toml repository" },
  { file: "go.mod", pattern: /^module\s+(\S+)/m, label: "go.mod module" },
];

const README_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\(upstream\s+([\w./-]+)\)/i, label: "README '(upstream X)'" },
  { pattern: /Forked from\s+\[?([\w./-]+)\]?/i, label: "README 'Forked from'" },
  { pattern: /Based on\s+\[?([\w./-]+)\]?/i, label: "README 'Based on'" },
  { pattern: /Copyright\s*©?\s*\d{4}\s+[\w .'-]+\s*\(upstream\s+([\w./-]+)\)/i, label: "README copyright+upstream" },
  { pattern: /Originally from\s+\[?([\w./-]+)\]?/i, label: "README 'Originally from'" },
];

function sh(cmd: string, cwd?: string, timeoutMs = 30_000): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: timeoutMs }).trim();
  } catch {
    return "";
  }
}

function isExcludedDir(name: string): boolean {
  return [".git", "node_modules", ".venv", "venv", "__pycache__", "target", "dist", "build", ".cache"].includes(name);
}

function listImmediateDirs(root: string): string[] {
  return sh(`ls -1 ${root}`)
    .split("\n")
    .filter((d) => d && !isExcludedDir(d))
    .filter((d) => {
      try { return statSync(join(root, d)).isDirectory(); } catch { return false; }
    });
}

function submodulesFromGitmodules(): Record<string, string> {
  const path = join(RANCH_ROOT, ".gitmodules");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const block of readFileSync(path, "utf8").split(/\n\[submodule\s+"([^"]+)"\]/)) {
    const m = block.match(/^\s*path\s*=\s*(.+)$/m);
    const u = block.match(/^\s*url\s*=\s*(.+)$/m);
    if (m && u) out[m[1].trim()] = u[1].trim();
  }
  return out;
}

function findUpstreamFromManifests(p: string): { url: string; source: string } | null {
  for (const { file, pattern, label } of REPO_PATTERNS) {
    const f = join(p, file);
    if (!existsSync(f)) continue;
    const text = readFileSync(f, "utf8");
    const m = text.match(pattern);
    if (m) {
      // For go.mod the match is the module path (e.g. github.com/owner/repo) — turn it into a URL
      const raw = m[1];
      const url = raw.startsWith("http") ? raw : `https://${raw}`;
      return { url, source: label };
    }
  }
  return null;
}

function findUpstreamFromReadme(p: string): { url: string; source: string } | null {
  for (const f of ["README.md", "readme.md", "README.rst", "README", "readme.txt"]) {
    const path = join(p, f);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8").slice(0, 50_000); // first 50KB
    for (const { pattern, label } of README_PATTERNS) {
      const m = text.match(pattern);
      if (m) {
        const raw = m[1];
        const url = raw.startsWith("http") ? raw : `https://github.com/${raw.replace(/^github\.com\//, "")}`;
        return { url, source: label };
      }
    }
  }
  return null;
}

function findUpstreamFromGitRemotes(p: string): { url: string; source: string } | null {
  if (!existsSync(join(p, ".git"))) return null;
  const upstream = sh("git remote get-url upstream", p);
  if (upstream) return { url: upstream.replace(/\.git$/, ""), source: "git remote upstream" };
  const origin = sh("git remote get-url origin", p);
  if (origin && !origin.includes("github.com/toxicwind/")) {
    return { url: origin.replace(/\.git$/, ""), source: "git remote origin (non-toxicwind)" };
  }
  return null;
}

function resolveOriginsFromGithub(infos: DirInfo[]): void {
  if (!RESOLVE) return;
  for (const i of infos) {
    if (!i.remoteOrigin || !i.remoteOrigin.includes("github.com/toxicwind/")) continue;
    const m = i.remoteOrigin.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!m) continue;
    const [, owner, repo] = m;
    const cacheFile = join(CACHE_DIR, `${owner}-${repo}.json`);
    try {
      const out = execSync(
        `gh api repos/${owner}/${repo} --jq '{parent: .parent.full_name, parent_url: .parent.html_url, source: .source.full_name}'`,
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 },
      );
      const d = JSON.parse(out);
      const upstreamUrl = d.parent_url || (d.source ? `https://github.com/${d.source}` : null);
      if (upstreamUrl && !i.upstream) {
        i.upstream = upstreamUrl;
        i.upstreamSource = "GitHub parent fork";
      }
      writeFileSync(cacheFile, JSON.stringify({ parent: d.parent, source: d.source, ts: Date.now() }, null, 2));
    } catch { /* rate-limited or missing — leave upstream unchanged */ }
  }
}

function dirInfo(name: string, submodules: Record<string, string>): DirInfo {
  const p = join(RANCH_ROOT, name);
  const hasGit = existsSync(join(p, ".git"));
  const isSubmodule = name in submodules;
  const remoteOrigin = hasGit ? sh("git remote get-url origin", p) : null;
  const sizeBytes = Number(sh(`du -sb ${p} 2>/dev/null`)?.split("\t")[0]) || 0;
  const fileCount = Number(sh(`find ${p} -type f 2>/dev/null | wc -l`).split("\n")[0]) || 0;

  // First match wins: submodule → manifests → readme → git remotes
  let upstream: string | null = null;
  let upstreamSource: string | null = null;
  if (isSubmodule) {
    upstream = submodules[name].replace(/\.git$/, "");
    upstreamSource = ".gitmodules";
  } else {
    const m = findUpstreamFromManifests(p);
    if (m) { upstream = m.url; upstreamSource = m.source; }
    else {
      const r = findUpstreamFromReadme(p);
      if (r) { upstream = r.url; upstreamSource = r.source; }
      else {
        const g = findUpstreamFromGitRemotes(p);
        if (g) { upstream = g.url; upstreamSource = g.source; }
      }
    }
  }

  return {
    name,
    upstream,
    upstreamSource,
    remoteOrigin: remoteOrigin || null,
    hasGit,
    isSubmodule,
    sizeBytes,
    fileCount,
  };
}

function renderTable(infos: DirInfo[]): string {
  const header = "| dir | upstream | source | origin remote |\n|---|---|---|---|";
  const sorted = [...infos].sort((a, b) => {
    // group: no-upstream last
    if (!a.upstream && b.upstream) return 1;
    if (a.upstream && !b.upstream) return -1;
    return a.name.localeCompare(b.name);
  });
  const lines = sorted.map((i) => {
    const up = i.upstream ? `[${i.upstream.replace(/^https?:\/\//, "").replace(/\.git$/, "")}](${i.upstream})` : "—";
    const src = i.upstreamSource ?? "—";
    const origin = i.remoteOrigin ? i.remoteOrigin.replace(/^https?:\/\//, "") : "—";
    return `| \`${i.name}\` | ${up} | ${src} | ${origin} |`;
  });
  return [header, ...lines].join("\n");
}

function summarize(infos: DirInfo[]): string {
  const withUpstream = infos.filter((i) => i.upstream).length;
  const bySource: Record<string, number> = {};
  for (const i of infos) if (i.upstreamSource) bySource[i.upstreamSource] = (bySource[i.upstreamSource] || 0) + 1;
  return [
    `${infos.length} immediate subdirs; **${withUpstream}** have an obvious upstream reference.`,
    "",
    "By source:",
    ...Object.entries(bySource).map(([k, v]) => `  - **${v}** ${k}`),
  ].join("\n");
}

function main(): void {
  const subs = submodulesFromGitmodules();
  const dirs = listImmediateDirs(RANCH_ROOT);
  const infos = dirs.map((d) => dirInfo(d, subs));
  if (RESOLVE) resolveOriginsFromGithub(infos);

  const generated = new Date().toISOString();
  const md = `# ranch/* fork audit (generated ${generated})

${summarize(infos)}

${renderTable(infos)}

## Sources, in order

1. \`.gitmodules\` path — the canonical submodule entry
2. \`package.json\` / \`Cargo.toml\` / \`pyproject.toml\` / \`go.mod\` — package manifest's \`repository\` field
3. \`README.md\` — first 50KB scanned for \`(upstream X)\`, \`Forked from\`, \`Based on\`, \`Copyright © YYYY <Author> (upstream X)\`, \`Originally from\`
4. \`git remote upstream\` (or non-toxicwind \`origin\`) — the remote URL itself
5. With \`--resolve-origins\`: GitHub's \`parent.full_name\` for \`toxicwind/*\` repos

First match wins. No signal weights, no classification ladder, no scoring —
just the obvious upstream reference for each dir, or "—" if there isn't one.

## Regenerate

\`\`\`bash
cd /home/toxic/estate/ranch
bun scripts/audit-forks.ts                    # local
bun scripts/audit-forks.ts --resolve-origins  # + GitHub parent fork lookup
\`\`\`
`;
  writeFileSync(join(RANCH_ROOT, "FORKS-report.md"), md);
  writeFileSync(join(RANCH_ROOT, "FORKS-report.json"),
    JSON.stringify({ generated, total: infos.length, withUpstream: infos.filter((i) => i.upstream).length, infos }, null, 2));
  // Drop the actions file; the obvious-upstream table is the report.
  const actionsPath = join(RANCH_ROOT, "FORKS-actions.md");
  if (existsSync(actionsPath)) {
    try { require("node:fs").unlinkSync(actionsPath); } catch { /* ignore */ }
  }

  const withUpstream = infos.filter((i) => i.upstream).length;
  console.log(`[done] ${infos.length} dirs, ${withUpstream} with obvious upstream`);
  console.log(`[done] wrote FORKS-report.md / FORKS-report.json`);
}

main();

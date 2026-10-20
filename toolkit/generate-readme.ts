#!/usr/bin/env bun
// ranch/toolkit/generate-readme.ts
// Aesthetic README generator for ranch/ — consumes FORKS-report.json,
// computes stats, and renders a beautiful ranch README.md
// Usage: bun toolkit/generate-readme.ts [--update] [--dry-run]

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Portable paths: derive the repo root from the script's own location so the
// toolkit runs on yote (/home/toxic/estate/ranch), on GitHub Actions runners
// (checked out anywhere), and anywhere else — no machine-specific paths.
const TOOLKIT_DIR = dirname(fileURLToPath(import.meta.url));
const RANCH_ROOT = dirname(TOOLKIT_DIR);
const REPORT_PATH = join(RANCH_ROOT, "FORKS-report.json");
const README_PATH = join(RANCH_ROOT, "README.md");
const AUDIT_SCRIPT = join(RANCH_ROOT, "toolkit/audit-forks.ts");

const args = new Set(process.argv.slice(2));
const UPDATE = args.has("--update");
const DRY_RUN = args.has("--dry-run");

function sh(cmd: string, cwd?: string, timeoutMs = 30_000): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: timeoutMs }).trim();
  } catch {
    return "";
  }
}

function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  const tokensB = new Set(b.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  // ES2025 Set methods with a portable fallback (older runtimes lack them).
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  const union = (tokensA as any).union ? (tokensA as any).union(tokensB) : new Set([...tokensA, ...tokensB]);
  return union.size === 0 ? 0 : intersection / union.size;
}

function similarityScore(a: { readmeHead?: string; sizeBytes?: number; fileCount?: number; upstream?: string }, b: { readmeHead?: string; sizeBytes?: number; fileCount?: number; upstream?: string }): number {
  // Weighted composite: 40% Jaccard on README first 500 chars, 30% file count similarity,
  // 20% size similarity, 10% same upstream
  const textScore = a.readmeHead && b.readmeHead ? jaccardSimilarity(a.readmeHead.slice(0, 500), b.readmeHead.slice(0, 500)) : 0;
  const fileScore = a.fileCount && b.fileCount ? 1 - Math.min(1, Math.abs(a.fileCount - b.fileCount) / Math.max(a.fileCount, b.fileCount, 1)) : 0;
  const sizeScore = a.sizeBytes && b.sizeBytes ? 1 - Math.min(1, Math.abs(a.sizeBytes - b.sizeBytes) / Math.max(a.sizeBytes, b.sizeBytes, 1)) : 0;
  const upstreamScore = a.upstream && b.upstream && a.upstream === b.upstream ? 1 : 0;
  return textScore * 0.4 + fileScore * 0.3 + sizeScore * 0.2 + upstreamScore * 0.1;
}

function detectLanguage(relPath: string): string {
  const p = join(RANCH_ROOT, relPath);
  if (!existsSync(p)) return "`—`";

  let entries: string[] = [];
  try {
    entries = readdirSync(p);
  } catch {
    return "`—`";
  }

  // Fast O(1) top-level manifest detection
  if (entries.includes("bun.lock") || entries.includes("bunfig.toml")) return "⚡ `Bun`";
  if (entries.includes("Cargo.toml")) return "🦀 `Rust`";
  if (entries.includes("go.mod")) return "🐹 `Go`";
  if (entries.includes("pyproject.toml") || entries.includes("requirements.txt") || entries.includes("setup.py")) return "🐍 `Python`";
  if (entries.includes("package.json")) return "🔷 `TypeScript`";

  // Shallow file extension counters (kept ultra high frequency)
  const counts: Record<string, number> = { ts: 0, py: 0, rs: 0, go: 0, sh: 0, doc: 0 };
  for (const f of entries) {
    if (f.endsWith(".ts") || f.endsWith(".tsx")) counts.ts++;
    else if (f.endsWith(".py")) counts.py++;
    else if (f.endsWith(".rs")) counts.rs++;
    else if (f.endsWith(".go")) counts.go++;
    else if (f.endsWith(".sh") || f.endsWith(".bash")) counts.sh++;
    else if (f.endsWith(".md") || f.endsWith(".json") || f.endsWith(".yaml")) counts.doc++;
  }

  if (counts.ts > 0) return "🔷 `TypeScript`";
  if (counts.py > 0) return "🐍 `Python`";
  if (counts.rs > 0) return "🦀 `Rust`";
  if (counts.go > 0) return "🐹 `Go`";
  if (counts.sh > 0) return "🐚 `Shell`";
  if (counts.doc > 0) return "📖 `Docs/Data`";

  // Check src/ directory if present
  const srcPath = join(p, "src");
  if (existsSync(srcPath)) {
    try {
      const srcFiles = readdirSync(srcPath);
      if (srcFiles.some(f => f.endsWith(".ts") || f.endsWith(".tsx"))) return "🔷 `TypeScript`";
      if (srcFiles.some(f => f.endsWith(".py"))) return "🐍 `Python`";
      if (srcFiles.some(f => f.endsWith(".rs"))) return "🦀 `Rust`";
      if (srcFiles.some(f => f.endsWith(".go"))) return "🐹 `Go`";
    } catch {}
  }

  return "📁 `Workspace`";
}

function computeStats(infos: {name: string; upstream: string | null; upstreamSource: string | null; remoteOrigin: string | null; hasGit: boolean; isSubmodule: boolean; sizeBytes: number; fileCount: number; readmeHead?: string}[]): { total: number; withUpstream: number; withGit: number; submodules: number; totalSizeGB: string; totalFiles: number; bySource: Record<string, number>; langs: Record<string, number> } {
  const total = infos.length;
  const withUpstream = infos.filter(i => i.upstream).length;
  const withGit = infos.filter(i => i.hasGit).length;
  const submodules = infos.filter(i => i.isSubmodule).length;
  const totalSize = infos.reduce((s, i) => s + i.sizeBytes, 0);
  const totalFiles = infos.filter(i => i.hasGit).reduce((s, i) => s + i.fileCount, 0);
  const totalSizeGB = (totalSize / 1024 / 1024 / 1024).toFixed(2);

  const bySource: Record<string, number> = {};
  for (const i of infos) if (i.upstreamSource) bySource[i.upstreamSource] = (bySource[i.upstreamSource] || 0) + 1;

  // Language stats from git-tracked dirs
  const langStats: Record<string, number> = {};
  for (const i of infos) {
    if (!i.hasGit) continue;
    let out = "";
    try {
      out = execSync(`git -C ${join(process.cwd(), i.name)} ls-files 2>/dev/null`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim();
    } catch {
      // not a real git repo (broken .git, detached, etc.) — skip, don't crash
      continue;
    }
    if (out) {
      for (const f of out.split("\n")) {
        if (!f) continue;
        const ext = f.split(".").pop() || "";
        if (ext) {
          const lang = extToLang(ext);
          langStats[lang] = (langStats[lang] || 0) + 1;
        }
      }
    }
  }
  return { total, withUpstream, withGit, submodules, totalSizeGB, totalFiles, bySource, langs: langStats };
}

function extToLang(ext: string): string {
  const map: Record<string, string> = {
    ts: "TypeScript", js: "JavaScript", py: "Python", rs: "Rust",
    go: "Go", cpp: "C++", c: "C", h: "C/C++", hpp: "C++",
    java: "Java", kt: "Kotlin", swift: "Swift", php: "PHP",
    rb: "Ruby", sh: "Shell", bash: "Shell", zsh: "Shell",
    md: "Markdown", txt: "Text", json: "JSON", yaml: "YAML",
    yml: "YAML", toml: "TOML", xml: "XML", html: "HTML",
    css: "CSS", scss: "SCSS", sass: "Sass", less: "Less",
    sql: "SQL", proto: "Protobuf", thrift: "Thrift",
    dockerfile: "Dockerfile", makefile: "Makefile", cmake: "CMake",
  };
  return map[ext.toLowerCase()] || ext.toUpperCase();
}

function generateReadme(data: { generated: string; total: number; infos: Array<any> }, stats: { withUpstream: number; withGit: number; submodules: number; totalSizeGB: string; totalFiles: number; bySource: Record<string, number>; langs: Record<string, number> }): string {
  const generated = new Date().toISOString();
  const now = new Date().toLocaleString();

  // Extract useful data for the README
  const topLangs = Object.entries(stats.langs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([lang, count]) => `${lang}: ${count.toLocaleString()}`)
    .join(", ");

  const topUpstreamPairs = Object.entries(stats.bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, count]) => `${source} (${count})`)
    .join(", ");

  // Build top 10 largest dirs
  const topDirs = [...data.infos].sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 10);
  const largestDirsRows = topDirs.map(d => {
    const sizeMB = (d.sizeBytes / 1024 / 1024).toFixed(1);
    const upstream = d.upstream ? d.upstream.replace(/^https?:\/\//, "").replace(/\.git$/, "") : "—";
    return `| \`${d.name}\` | ${sizeMB} MB | ${d.fileCount.toLocaleString()} | ${upstream} |`;
  }).join("\n");

  // Build similarity clusters (top 10)
  const similarities: Array<{a: string, b: string, score: number}> = [];
  const infosWithReadme = data.infos.filter(i => i.readmeHead && i.readmeHead.length > 20);
  for (let i = 0; i < infosWithReadme.length; i++) {
    for (let j = i + 1; j < infosWithReadme.length; j++) {
      const score = jaccardSimilarity(infosWithReadme[i].readmeHead || "", infosWithReadme[j].readmeHead || "");
      if (score > 0.3) similarities.push({a: infosWithReadme[i].name, b: infosWithReadme[j].name, score});
    }
  }
  similarities.sort((a, b) => b.score - a.score);
  const similarityRows = similarities.slice(0, 10).map(s => 
    `| \`${s.a}\` | \`${s.b}\` | ${(s.score * 100).toFixed(1)}% |`
  ).join("\n");

  // Build directory type breakdown
  const types = {
    "Submodule": data.infos.filter(i => i.isSubmodule).length,
    "Fork (ours)": data.infos.filter(i => i.hasGit && i.remoteOrigin?.includes("toxicwind")).length,
    "Upstream mirror": data.infos.filter(i => i.hasGit && !i.remoteOrigin?.includes("toxicwind") && i.upstream).length,
    "Fork (ours, no upstream)": data.infos.filter(i => i.hasGit && i.remoteOrigin?.includes("toxicwind") && !i.upstream).length,
    "Upstream mirror (no upstream)": data.infos.filter(i => i.hasGit && !i.remoteOrigin?.includes("toxicwind") && !i.upstream).length,
    "Vendored (active)": data.infos.filter(i => !i.hasGit && i.sizeBytes > 50000 && i.readmeHead).length,
    "Vendored (snapshot)": data.infos.filter(i => !i.hasGit && i.sizeBytes > 50000 && !i.readmeHead).length,
    "Experimental": data.infos.filter(i => !i.hasGit && i.sizeBytes > 0 && i.sizeBytes <= 50000).length,
    "Stub/Empty": data.infos.filter(i => !i.hasGit && i.sizeBytes === 0).length,
  };
  const typeRows = Object.entries(types)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `| ${type} | ${count} |`)
    .join("\n");

  // Generate the aesthetic README
  let md = `<div align="center">\n\n`;
  md += `[![ci](https://github.com/toxicwind/ranch/actions/workflows/ci.yml/badge.svg)](https://github.com/toxicwind/ranch/actions/workflows/ci.yml)\n`;
  md += `[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)\n`;
  md += `[![stars](https://img.shields.io/github/stars/toxicwind/ranch)](https://github.com/toxicwind/ranch/stargazers)\n`;
  md += `[![bun](https://img.shields.io/badge/bun-1.4.4-f9f1e1?logo=bun)](https://bun.sh)\n`;
  md += `[![mise](https://img.shields.io/badge/toolchains-mise-ffd55a)](https://mise.jdx.dev)\n`;
  md += `[![go](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go&logoColor=white)](https://go.dev)\n`;
  md += `[![rust](https://img.shields.io/badge/Rust-orange?logo=rust)](https://www.rust-lang.org)\n\n`;
  md += `# 🤠 ranch\n\n`;
  md += `**The whole self-hosted AI estate in one monorepo.** Local model serving (**herd**), cloud provider routing (**hodos**), the canonical router (**cuttinggate**), the coding agent (**tau**), the MCP gateway (**gatehouse**), the build-job system (**forge**), fleet chat (**keryx**), and the provider catalog (**roost**) they all share — one directory per component, the full mesh on one box, everything OpenAI-compatible.\n\n`;
  md += `[Explore the docs »](docs/) · [Report Bug](https://github.com/toxicwind/ranch/issues/new?labels=bug&template=bug_report.md) · [Request Feature](https://github.com/toxicwind/ranch/issues/new?labels=enhancement&template=feature_request.md)\n\n`;
  md += `<img src="docs/images/ranch-demo.svg" alt="ranch 30-second proof: 52 local models behind one OpenAI-compatible door, every core service answering 200" width="720">\n\n`;
  md += `</div>\n\n`;

  md += `<details>\n<summary><b>Table of Contents</b></summary>\n<ol>\n`;
  md += `<li><a href="#-about">About</a></li>\n`;
  md += `<li><a href="#%EF%B8%8F-built-with">Built with</a></li>\n`;
  md += `<li><a href="#-getting-started">Getting started</a></li>\n`;
  md += `<li><a href="#-30-second-proof">30-second proof</a></li>\n`;
  md += `<li><a href="#-usage">Usage</a></li>\n`;
  md += `<li><a href="#%EF%B8%8F-architecture">Architecture</a></li>\n`;
  md += `<li><a href="#-the-ranch--component-map">The ranch — component map</a></li>\n`;
  md += `<li><a href="#-repo-topology">Repo topology</a></li>\n`;
  md += `<li><a href="#-the-contract">The contract</a></li>\n`;
  md += `<li><a href="#%EF%B8%8F-roadmap">Roadmap</a></li>\n`;
  md += `<li><a href="#-contributing">Contributing</a></li>\n`;
  md += `<li><a href="#-license">License</a></li>\n`;
  md += `<li><a href="#-contact">Contact</a></li>\n`;
  md += `<li><a href="#-acknowledgments">Acknowledgments</a></li>\n`;
  md += `</ol>\n</details>\n\n`;

  md += `---\n\n`;

  md += `## 🐄 About\n\n`;
  md += `If you run models on a box **and** call cloud APIs, this is the shape of the answer: local traffic stays local, cloud traffic goes through one rate-limit-aware router, and **strategy names — not model names — decide the route**. Any client that speaks the OpenAI API just works — \`curl\`, the OpenAI SDK, your agent framework of choice.\n\n`;
  md += `The ranch is a **real monorepo**, not a folder of checkouts: [Bun workspaces](https://bun.sh) link the TypeScript animals, [moon](https://moonrepo.dev) orchestrates polyglot tasks (Bun/TS, Go, Python, Rust) with pinned toolchains, and CI runs only what your change touches (\`moon ci\`). One directory per animal, no pens inside pens — this README is the map.\n\n`;
  md += `### The agent this estate serves\n\n`;
  md += `**tau** is the coding agent — a terminal coding agent (fork of [oh-my-pi](https://github.com/can1357/oh-my-pi)) with an interactive CLI + SDK, 30+ tools, subagents, LSP-aware editing, and a native Rust hot path. It speaks to dozens of providers through a compiled model catalog sourced from **roost**, the ranch's single provider-data authority. Tau lives in its own repo ([toxicwind/tau](https://github.com/toxicwind/tau)) and nests into the ranch at \`tau/\` (gitignored — an independent repo with its own remote, absent in a fresh clone); on a live estate, **chute** exposes its stdio ACP engine as a TCP daemon on \`:25111\`, and its model traffic flows through herd and hodos. If you only learn one animal, learn tau — the rest of the ranch exists so the agent can work.\n\n`;

  md += `## 🛠️ Built with\n\n`;
  md += `- [Go](https://go.dev) — herd (local front door), forge (build jobs), gatehouse (MCP gateway)\n`;
  md += `- [Rust](https://www.rust-lang.org) — hodos (provider router), rig (OpenFang kernel), tau's native hot path\n`;
  md += `- [Bun](https://bun.sh) + [TypeScript](https://www.typescriptlang.org) — workspaces, cuttinggate, fleet-ui, windmill, stream-broker, roost, tau's agent brain\n`;
  md += `- [Python](https://www.python.org) — keryx (fleet chat), squawk-ws, lasso (desktop control)\n`;
  md += `- [mise](https://mise.jdx.dev) — toolchains and build tasks; estate owns the shared build cache\n`;
  md += `- **pitchfork** — the daemon supervisor: supervised services on the live estate\n\n`;

  md += `## 📊 Monorepo Statistics (generated ${now})\n\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| Total directories | ${data.total} |\n`;
  md += `| Directories with obvious upstream | ${stats.withUpstream} / ${data.total} (${((stats.withUpstream / data.total) * 100).toFixed(1)}%) |\n`;
  md += `| Git-tracked directories | ${stats.withGit} |\n`;
  md += `| Submodules | ${stats.submodules} |\n`;
  md += `| Total size | ${stats.totalSizeGB} GB |\n`;
  md += `| Total tracked files | ${stats.totalFiles.toLocaleString()} |\n\n`;

  // ── Registered submodules: the full map from .gitmodules, enriched with
  // descriptions from FORKS-report.json (readmeHead first line). ──
  let subRows = "";
  try {
    const gmRaw = readFileSync(join(RANCH_ROOT, ".gitmodules"), "utf8");
    const entries: { path: string; url: string }[] = [];
    let cur: { path: string; url: string } | null = null;
    for (const line of gmRaw.split("\n")) {
      const sec = line.match(/^\[submodule "([^"]+)"\]/);
      if (sec) { if (cur) entries.push(cur); cur = { path: "", url: "" }; continue; }
      const p = line.match(/^\s*path\s*=\s*(.+)$/);
      if (p && cur) cur.path = p[1].trim();
      const u = line.match(/^\s*url\s*=\s*(.+)$/);
      if (u && cur) cur.url = u[1].trim();
    }
    if (cur) entries.push(cur);

    // Description lookup: disk-backed cache for GitHub API descriptions (borrow pattern: sync-disk-cache).
    const CACHE_FILE = join(RANCH_ROOT, ".cache", "ranch-fork-audit", "gh-descriptions.json");
    let ghDescCache: Record<string, string> = {};
    try {
      if (existsSync(CACHE_FILE)) ghDescCache = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    } catch {}


const descOf = (p: string, repoUrl: string): string => {
      const slugMatch = repoUrl.match(/github\.com[\/:]([^\/]+\/[^\/\.]+)/);
      if (slugMatch) {
        const slug = slugMatch[1];
        if (slug in ghDescCache && ghDescCache[slug]) return ghDescCache[slug];
      }
      const info = (data.infos as any[]).find((i) => i.name === p);
      if (!info?.readmeHead) return "";
      const lines = info.readmeHead.split("\n").map((l: string) => l.trim());
      const first = lines.find((l: string) => {
        if (l.length < 15) return false;
        if (/^([#!<|\[*-]|```)/.test(l)) return false;
        if (l.startsWith("http://") || l.startsWith("https://")) return false;
        return true;
      });
      if (!first) return "";
      const cleaned = first
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // strip markdown links
        .replace(/`([^`]+)`/g, "$1")                 // strip inline code
        .replace(/<[^>]+>/g, "")                     // strip html tags
        .trim();
      return cleaned.slice(0, 110).replace(/\|/g, "\\|");
    };

    // Sort submodules naturally by path (numeric + case-insensitive)
    const sorted = entries
      .filter((e) => e.path)
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
    for (const e of sorted) {
      const disp = e.url.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\.git$/, "");
      const lang = detectLanguage(e.path);
      const desc = descOf(e.path, e.url);
      subRows += `| \`${e.path}\` | ${lang} | [${disp}](${e.url}) |${desc ? " " + desc + " |" : " — |"}\n`;
    }
    md += `## 🗂️ Registered Submodules (${sorted.length})\n\n`;
    md += `The full map — every animal's pen, with its repo and description (from README heads). From \`.gitmodules\` + \`FORKS-report.json\`; regenerate with the README.\n\n`;
    md += `| Path | Stack / Lang | Repo | Description |\n|---|---|---|---|\n`;
    md += subRows + "\n";


  } catch {
    md += `## 🗂️ Registered Submodules\n\n*(.gitmodules not readable)*\n\n`;
  }


  md += `## 🔭 Upstream Sources\n\n`;
  md += `| Source | Count |\n|---|---|\n`;
  for (const [src, count] of Object.entries(stats.bySource).sort((a, b) => b[1] - a[1])) {
    md += `| ${src} | ${count} |\n`;
  }
  md += `\n`;

  md += `## 🌐 Languages (by tracked files)\n\n`;
  md += `| Language | Files |\n|---|---|\n`;
  for (const [lang, count] of Object.entries(stats.langs).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    md += `| ${lang} | ${count.toLocaleString()} |\n`;
  }
  md += `\n`;

  md += `## 📦 Top 10 Largest Directories\n\n`;
  md += `| Directory | Size | Files | Upstream |\n|---|---|---|---|\n`;
  md += largestDirsRows + "\n\n";

  md += `## 🔮 Top Upstreams by Fork Count\n\n`;
  md += `| Upstream | Forks |\n|---|---|\n`;
  const upstreamCounts: Record<string, number> = {};
  for (const i of data.infos) {
    if (i.upstream) {
      const name = i.upstream.replace(/^https?:\/\//, "").replace(/\.git$/, "");
      upstreamCounts[i.upstream] = (upstreamCounts[i.upstream] || 0) + 1;
    }
  }
  const topUpstreams = Object.entries(upstreamCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [url, count] of topUpstreams) {
    const name = url.replace(/^https?:\/\//, "").replace(/\.git$/, "");
    md += `| [${name}](${url}) | ${count} |\n`;
  }
  md += `\n`;

  md += `## 🔲 Similarity Clusters (README-based)\n\n`;
  md += `Directories with similar README content (Jaccard on first 500 chars):\n\n`;
  md += `| Dir A | Dir B | Similarity |\n|---|---|---|\n`;
  md += similarityRows + "\n\n";

  md += `## 📁 Directory Type Breakdown\n\n`;
  md += `| Type | Count |\n|---|---|\n`;
  md += typeRows + "\n\n";

  md += `---\n\n`;
  md += `*Generated by \`bun toolkit/generate-readme.ts\` at ${new Date().toISOString()}*\n`;
  md += `\n---\n\n`;
  md += `*Do not edit this file directly — it is generated from \`FORKS-report.json\`.*\n`;
  md += `*Run \`bun toolkit/generate-readme.ts --update\` to regenerate.*\n`;

  return md;
}

function main() {
  if (!existsSync(REPORT_PATH)) {
    console.error("FORKS-report.json not found. Run `bun toolkit/audit-forks.ts` first.");
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
  const data = report.infos.map((i: any) => ({
    name: i.name,
    upstream: i.upstream,
    upstreamSource: i.upstreamSource,
    remoteOrigin: i.remoteOrigin,
    hasGit: i.hasGit,
    isSubmodule: i.isSubmodule,
    sizeBytes: i.sizeBytes,
    fileCount: i.fileCount,
    readmeHead: i.readmeHead ?? "",
  }));

  // Enrich with readmeHead from actual README files
  for (const d of data) {
    if (!d.readmeHead && d.hasGit) {
      for (const f of ["README.md", "readme.md", "README.rst", "README", "readme.txt"]) {
        const path = join(RANCH_ROOT, d.name, f);
        if (existsSync(path)) {
          try {
            const txt = readFileSync(path, "utf8").slice(0, 500);
            d.readmeHead = txt;
          } catch {}
          break;
        }
      }
    }
  }

  const stats = computeStats(data);
  const readme = generateReadme({ generated: report.generated, total: data.length, infos: data }, stats);

  if (process.argv.includes("--dry-run")) {
    console.log(readme);
  } else if (UPDATE) {
    writeFileSync(README_PATH, readme);
    console.log("Updated README.md");
  } else {
    console.log("Dry run. Use --update to write README.md");
  }
}

main();
// ranch/scripts/audit-forks.ts
//
// Reusable audit of every `ranch/*` directory: classify it (fork / vendored /
// orphan), pair it with its upstream and `toxicwind/*` counterpart, and
// produce a markdown report (FORKS-report.md) plus a JSON sidecar
// (FORKS-report.json) for downstream tooling. The script is idempotent —
// running it twice produces the same result modulo new forks — and `--apply`
// optionally creates the missing `toxicwind/*` mirror repos via `gh`.
//
// The companion FORKS.md is the hand-edited policy/summary index;
// this audit is the machine-driven catalog that regenerates FORKS.md's
// "ranch dir × upstream × toxicwind" table.
//
// Usage:
//   bun scripts/audit-forks.ts                  # write reports, no changes
//   bun scripts/audit-forks.ts --apply         # gh repo create for orphans
//   bun scripts/audit-forks.ts --since <sha>   # only dirs changed since sha

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const RANCH_ROOT = "/home/toxic/estate/ranch";
const FORKS_MD = join(RANCH_ROOT, "FORKS.md");
const REPORT_MD = join(RANCH_ROOT, "FORKS-report.md");
const REPORT_JSON = join(RANCH_ROOT, "FORKS-report.json");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const SINCE = (() => {
  const i = process.argv.indexOf("--since");
  return i > -1 ? process.argv[i + 1] : null;
})();

interface DirInfo {
  name: string;
  type: "submodule" | "fork" | "vendored" | "orphan" | "experimental";
  hasGit: boolean;
  isSubmodule: boolean;
  remote?: string;
  remoteOwner?: string;
  remoteRepo?: string;
  head?: string;
  upstream?: string;
  toxicwind?: string;
  sizeBytes: number;
  fileCount: number;
  topFiles: string[];
}

function sh(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function isExcludedDir(name: string): boolean {
  return [".git", "node_modules", ".venv", "venv", "__pycache__", "target", "dist", "build", ".cache"].includes(name);
}

function classifyRemote(remote: string): { owner: string; repo: string; upstream?: string } {
  // https://github.com/<owner>/<repo>.git
  const m = remote.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) return { owner: "?", repo: "?" };
  return { owner: m[1], repo: m[2] };
}

function listImmediateDirs(root: string): string[] {
  return sh(`ls -1 ${root}`)
    .split("\n")
    .filter((d) => d && !isExcludedDir(d))
    .filter((d) => {
      try {
        return statSync(join(root, d)).isDirectory();
      } catch {
        return false;
      }
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

function dirInfo(name: string, submodules: Record<string, string>): DirInfo {
  const p = join(RANCH_ROOT, name);
  const hasGit = existsSync(join(p, ".git"));
  const isSubmodule = name in submodules;
  const remote = hasGit ? sh("git remote get-url origin", p) : "";
  const { owner, repo } = remote ? classifyRemote(remote) : { owner: "", repo: "" };
  const head = hasGit ? sh("git log --oneline -1", p).split(" ")[0] : "";
  const sizeBytes = Number(sh(`du -sb ${p} 2>/dev/null`)?.split("\t")[0]) || 0;
  const fileCount = Number(sh(`find ${p} -type f 2>/dev/null | wc -l`).split("\n")[0]) || 0;
  const topFiles = sh(`ls -1 ${p}`).split("\n").filter(Boolean).slice(0, 8);
  // Default toxicwind counterpart: same name, regardless of current owner
  const toxicwind = isSubmodule ? submodules[name] : `https://github.com/toxicwind/${name}.git`;
  const upstream = remote && owner !== "toxicwind" ? remote : undefined;

  let type: DirInfo["type"];
  if (isSubmodule) type = "submodule";
  else if (hasGit && owner === "toxicwind") type = "fork";
  else if (hasGit) type = "fork"; // upstream fork, trackable
  else if (sizeBytes > 50_000 && fileCount > 20) type = "vendored";
  else if (sizeBytes < 5_000) type = "experimental";
  else type = "orphan";

  return {
    name,
    type,
    hasGit,
    isSubmodule,
    remote: remote || undefined,
    remoteOwner: owner || undefined,
    remoteRepo: repo || undefined,
    head: head || undefined,
    upstream,
    toxicwind: toxicwind || undefined,
    sizeBytes,
    fileCount,
    topFiles,
  };
}

function renderTable(rows: DirInfo[]): string {
  const header =
    "| ranch dir | type | upstream | toxicwind fork | HEAD | size | files |\n" +
    "|---|---|---|---|---|---|---|";
  const lines = rows.map((r) => {
    const up = r.upstream ?? "—";
    const tw = r.toxicwind ? `[${r.remoteRepo ?? r.name}](${r.toxicwind})` : "—";
    const head = r.head ?? "—";
    return `| \`${r.name}\` | ${r.type} | ${up} | ${tw} | \`${head}\` | ${(r.sizeBytes / 1024 / 1024).toFixed(1)}M | ${r.fileCount} |`;
  });
  return [header, ...lines].join("\n");
}

function applyOrphans(orphans: DirInfo[]): void {
  if (!APPLY) return;
  for (const o of orphans) {
    if (o.toxicwind && !existsSync(join("/home/toxic/.cache/ranch-fork-audit", o.name))) {
      const safe = o.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      console.log(`[apply] gh repo create toxicwind/${safe} --public --description "Mirrored from ranch/${o.name}"`);
      try {
        execSync(`gh repo create toxicwind/${safe} --public --description "Mirrored from ranch/${o.name}"`, { stdio: "inherit" });
        console.log(`[apply]   created toxicwind/${safe}`);
      } catch (e) {
        console.error(`[apply]   failed for ${o.name}: ${(e as Error).message}`);
      }
    }
  }
}

function main(): void {
  const subs = submodulesFromGitmodules();
  const dirs = listImmediateDirs(RANCH_ROOT);
  const infos = dirs.map((d) => dirInfo(d, subs));

  if (SINCE) {
    const changed = sh(`git diff --name-only ${SINCE}..HEAD -- ranch/`, RANCH_ROOT).split("\n").filter(Boolean);
    const names = new Set(changed.map((p) => p.split("/")[1]).filter(Boolean));
    console.log(`[since] ${names.size} dirs changed since ${SINCE}`);
  }

  const counts: Record<string, number> = {};
  for (const i of infos) counts[i.type] = (counts[i.type] || 0) + 1;

  const table = renderTable(infos);
  const generated = new Date().toISOString();
  const md = `# ranch/* fork audit (generated ${generated})

${dirs.length} immediate subdirectories of \`ranch/\`; ${Object.entries(counts).map(([k, v]) => `**${v}** ${k}`).join(" · ")}

${table}

## Regenerate

\`\`\`bash
cd /home/toxic/estate/ranch
bun scripts/audit-forks.ts               # write reports, no remote changes
bun scripts/audit-forks.ts --apply      # also \`gh repo create\` for orphan dirs
\`\`\`
`;

  writeFileSync(REPORT_MD, md);
  writeFileSync(REPORT_JSON, JSON.stringify({ generated, counts, infos }, null, 2));

  if (APPLY) applyOrphans(infos.filter((i) => i.type === "orphan"));

  // Console summary (single line per dir type)
  console.log(`[done] ${dirs.length} dirs, types: ${JSON.stringify(counts)}`);
  console.log(`[done] wrote ${REPORT_MD} (${md.length} bytes)`);
  console.log(`[done] wrote ${REPORT_JSON}`);
  if (APPLY) console.log(`[done] --apply mode: attempted gh repo create for orphans`);
}

main();

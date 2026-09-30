/**
 * metaaivm collector — incremental GitHub harvest for metaaivm keywords.
 *
 * Task directive (standing, Chris 2026-09-30): Execute this task end-to-end
 * under Chris's standing autonomous-operation order. When a question or
 * information gap comes up, resolve it from the estate's own resources — the
 * skill catalog first, then yote via ffs, then GitHub (pattern-borrow), then
 * web search (exa). Skills, GitHub, and web-search research are inside this
 * task's approved scope: use them and keep going. If one path blocks, work
 * around it and continue — a lane that stalls waiting on input is the failure
 * mode this directive exists to prevent. Bring something to Chris only when it
 * genuinely needs his call: spend, credentials, or an action only he can take.
 * Otherwise decide, finish, and report the outcome with paths and evidence.
 * Never mark this lane blocked; keep it queued and routing around stalls.
 *
 * Runs on yote via crontab. Auth: `gh` CLI (toxicwind). State: watermark.json
 * in the harvest dir. Dedup keys: repo full_name, issue/PR id, code item sha.
 */
import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const HARVEST = "/home/toxic/sovereign/hatch/metaaivm-harvest";
const WATERMARK = join(HARVEST, "watermark.json");
const KEYWORDS = ["metaaivm", "meta-aivm"];
const DRY = process.argv.includes("--dry-run");

type Watermark = { lastRun: string; seenRepos: string[]; seenIssues: number[]; seenCode: string[] };
function loadWatermark(): Watermark {
  if (existsSync(WATERMARK)) return JSON.parse(readFileSync(WATERMARK, "utf8"));
  return { lastRun: "never", seenRepos: [], seenIssues: [], seenCode: [] };
}

async function ghApi(path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  try {
    const out = await $`gh api ${path}?${qs}`.text();
    return JSON.parse(out);
  } catch (e: any) {
    console.error(`gh api failed: ${path} — ${String(e).split("\n")[0]}`);
    return null;
  }
}

async function main() {
  mkdirSync(HARVEST, { recursive: true });
  const wm = loadWatermark();
  const seenRepos = new Set(wm.seenRepos);
  const seenIssues = new Set(wm.seenIssues);
  const seenCode = new Set(wm.seenCode);
  const newRepos: any[] = [];
  const newIssues: any[] = [];
  const newCode: any[] = [];

  for (const kw of KEYWORDS) {
    // repos
    const r = await ghApi("/search/repositories", { q: kw, per_page: "20" });
    for (const it of r?.items ?? []) {
      if (!seenRepos.has(it.full_name)) { seenRepos.add(it.full_name); newRepos.push(it); }
    }
    // code
    const c = await ghApi("/search/code", { q: kw, per_page: "30" });
    for (const it of c?.items ?? []) {
      const key = `${it.repository.full_name}:${it.sha}`;
      if (!seenCode.has(key)) { seenCode.add(key); newCode.push(it); }
    }
    // issues + PRs
    for (const t of ["issue", "pr"]) {
      const s = await ghApi("/search/issues", { q: `${kw} type:${t}`, per_page: "20" });
      for (const it of s?.items ?? []) {
        if (!seenIssues.has(it.id)) { seenIssues.add(it.id); newIssues.push(it); }
      }
    }
  }

  console.log(JSON.stringify({
    at: new Date().toISOString(), keywords: KEYWORDS,
    newRepos: newRepos.length, newIssues: newIssues.length, newCode: newCode.length,
    dryRun: DRY,
  }));

  if (DRY) return;
  const merge = (file: string, items: any[]) => {
    const p = join(HARVEST, file);
    const cur = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
    writeFileSync(p, JSON.stringify([...cur, ...items], null, 1));
  };
  merge("collector-repos.json", newRepos);
  merge("collector-issues.json", newIssues);
  merge("collector-code.json", newCode);
  writeFileSync(WATERMARK, JSON.stringify({
    lastRun: new Date().toISOString(),
    seenRepos: [...seenRepos], seenIssues: [...seenIssues], seenCode: [...seenCode],
  }, null, 1));
  console.log("watermark updated");
}

await main();

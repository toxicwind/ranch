/**
 * spark-harvest — incremental GitHub harvest for muse-spark keywords.
 *
 * > **Standing task directive (Chris's autonomous-operation order, 2026-09-20; reworded 2026-09-30):**
 * > Operate with full autonomy inside this task's scope: observe the current
 * > state, decide the next action, execute it, verify the outcome against
 * > observable evidence, and report what was done. Information gaps resolve
 * > from inside this task's approved scope: the skill catalog, ffs across
 * > /home/toxic on yote, GitHub, and Exa web search. Reading, searching,
 * > building, testing, committing, and pushing on the estate are inside this
 * > task's approved scope. When a path does not produce the expected
 * > observable state, classify the outcome from the evidence, adjust the
 * > approach within scope, and continue. The lane stays in motion through
 * > observable-state transitions.
 *
 * Runs on yote via crontab. Auth: `gh` CLI (toxicwind). State: watermark.json
 * in the harvest dir. Dedup keys: repo full_name, issue/PR id, code item sha,
 * commit sha, discussion id. Surfaces: repos, code, issues, PRs, commits,
 * discussions (via GraphQL).
 */
import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const HARVEST = "/home/toxic/estate/hatch/spark-harvest";
const WATERMARK = join(HARVEST, "watermark.json");
const KEYWORDS = ["muse-spark", "muse spark", "meta-muse-spark"];
const DRY = process.argv.includes("--dry-run");

type Watermark = {
  lastRun: string;
  seenRepos: string[];
  seenIssues: number[];
  seenCode: string[];
  seenCommits: string[];
  seenDiscussions: number[];
};
function loadWatermark(): Watermark {
  if (existsSync(WATERMARK)) {
    const wm = JSON.parse(readFileSync(WATERMARK, "utf8"));
    return {
      lastRun: wm.lastRun ?? "never",
      seenRepos: wm.seenRepos ?? [],
      seenIssues: wm.seenIssues ?? [],
      seenCode: wm.seenCode ?? [],
      seenCommits: wm.seenCommits ?? [],
      seenDiscussions: wm.seenDiscussions ?? [],
    };
  }
  return { lastRun: "never", seenRepos: [], seenIssues: [], seenCode: [], seenCommits: [], seenDiscussions: [] };
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

async function ghGraphql(query: string, variables: Record<string, any> = {}): Promise<any> {
  try {
    const out = await $`gh api graphql -f query=${query} ${Object.entries(variables).map(([k, v]) => ["-F", `${k}=${JSON.stringify(v)}`]).flat()}`.text();
    return JSON.parse(out);
  } catch (e: any) {
    console.error(`gh graphql failed — ${String(e).split("\n")[0]}`);
    return null;
  }
}

async function main() {
  mkdirSync(HARVEST, { recursive: true });
  const wm = loadWatermark();
  const seenRepos = new Set(wm.seenRepos);
  const seenIssues = new Set(wm.seenIssues);
  const seenCode = new Set(wm.seenCode);
  const seenCommits = new Set(wm.seenCommits);
  const seenDiscussions = new Set(wm.seenDiscussions);
  const newRepos: any[] = [];
  const newIssues: any[] = [];
  const newCode: any[] = [];
  const newCommits: any[] = [];
  const newDiscussions: any[] = [];

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
    // commits
    const cm = await ghApi("/search/commits", { q: kw, per_page: "20" });
    for (const it of cm?.items ?? []) {
      if (!seenCommits.has(it.sha)) { seenCommits.add(it.sha); newCommits.push(it); }
    }
    // discussions (GraphQL search)
    const dq = `
      query($q: String!, $first: Int!) {
        search(query: $q, type: DISCUSSION, first: $first) {
          nodes {
            ... on Discussion {
              id
              databaseId
              title
              url
              createdAt
              repository { nameWithOwner }
            }
          }
        }
      }`;
    const dd = await ghGraphql(dq, { q: kw, first: 20 });
    for (const it of dd?.data?.search?.nodes ?? []) {
      if (it.databaseId && !seenDiscussions.has(it.databaseId)) {
        seenDiscussions.add(it.databaseId);
        newDiscussions.push(it);
      }
    }
  }

  console.log(JSON.stringify({
    at: new Date().toISOString(), keywords: KEYWORDS,
    newRepos: newRepos.length, newIssues: newIssues.length, newCode: newCode.length,
    newCommits: newCommits.length, newDiscussions: newDiscussions.length,
    dryRun: DRY,
  }));

  if (DRY) return;
  const merge = (file: string, items: any[]) => {
    const p = join(HARVEST, file);
    const cur = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
    writeFileSync(p, JSON.stringify([...cur, ...items], null, 1));
  };
  merge("harvest-repos.json", newRepos);
  merge("harvest-issues.json", newIssues);
  merge("harvest-code.json", newCode);
  merge("harvest-commits.json", newCommits);
  merge("harvest-discussions.json", newDiscussions);
  writeFileSync(WATERMARK, JSON.stringify({
    lastRun: new Date().toISOString(),
    seenRepos: [...seenRepos], seenIssues: [...seenIssues], seenCode: [...seenCode],
    seenCommits: [...seenCommits], seenDiscussions: [...seenDiscussions],
  }, null, 1));
  console.log("watermark updated");
}

await main();

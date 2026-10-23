/**
 * metaaivm corpus dedup + rank.
 *
 * Reads all harvest files from /home/toxic/estate/hatch/metaaivm-harvest/,
 * deduplicates across surfaces, ranks by signal strength, and writes a
 * ranked manifest to /home/toxic/estate/hatch/metaaivm-corpus/manifest.json.
 *
 * Ranking signals (higher is better):
 * - Recency: newer items rank higher (exponential decay, 30-day half-life)
 * - Authority: stars/forks for repos, reactions/comments for issues/PRs
 * - Surface weight: repos (1.0) > code (0.8) > commits (0.7) > issues/PRs (0.6) > discussions (0.5)
 * - Keyword match: exact "metaaivm" in name/title scores higher than "meta-aivm"
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const HARVEST = "/home/toxic/estate/hatch/metaaivm-harvest";
const CORPUS = "/home/toxic/estate/hatch/metaaivm-corpus";
const MANIFEST = join(CORPUS, "manifest.json");

type RankedItem = {
  surface: string;
  key: string;
  title: string;
  url: string;
  score: number;
  signals: Record<string, number>;
  raw: any;
};

function loadJson(file: string): any[] {
  const p = join(HARVEST, file);
  if (!existsSync(p)) return [];
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function daysAgo(dateStr: string): number {
  if (!dateStr) return 365;
  const d = new Date(dateStr).getTime();
  if (isNaN(d)) return 365;
  return Math.max(0, (Date.now() - d) / (1000 * 60 * 60 * 24));
}

function recencyScore(dateStr: string): number {
  // Exponential decay with 30-day half-life
  const days = daysAgo(dateStr);
  return Math.pow(0.5, days / 30);
}

function keywordScore(text: string): number {
  const t = (text || "").toLowerCase();
  if (t.includes("metaaivm")) return 1.0;
  if (t.includes("meta-aivm")) return 0.7;
  return 0.3;
}

function rankRepos(items: any[]): RankedItem[] {
  return items.map(it => {
    const stars = it.stargazers_count || 0;
    const forks = it.forks_count || 0;
    const authority = Math.log10(1 + stars + forks * 2);
    const recency = recencyScore(it.pushed_at || it.updated_at);
    const kw = keywordScore(`${it.name} ${it.description || ""}`);
    const score = (0.4 * authority + 0.3 * recency + 0.3 * kw) * 1.0;
    return {
      surface: "repo",
      key: it.full_name,
      title: it.full_name,
      url: it.html_url,
      score,
      signals: { stars, forks, recency: +recency.toFixed(3), keyword: kw },
      raw: { full_name: it.full_name, description: it.description, pushed_at: it.pushed_at },
    };
  });
}

function rankCode(items: any[]): RankedItem[] {
  return items.map(it => {
    const repo = it.repository?.full_name || "unknown";
    const recency = 0.5; // Code search doesn't return dates reliably
    const kw = keywordScore(it.path || "");
    const score = (0.5 * kw + 0.5 * recency) * 0.8;
    return {
      surface: "code",
      key: `${repo}:${it.sha}`,
      title: `${repo}:${it.path}`,
      url: it.html_url,
      score,
      signals: { keyword: kw },
      raw: { repo, path: it.path },
    };
  });
}

function rankIssues(items: any[], surface: string): RankedItem[] {
  return items.map(it => {
    const comments = it.comments || 0;
    const reactions = it.reactions?.total_count || 0;
    const authority = Math.log10(1 + comments + reactions);
    const recency = recencyScore(it.updated_at || it.created_at);
    const kw = keywordScore(`${it.title} ${it.body || ""}`.slice(0, 500));
    const score = (0.3 * authority + 0.4 * recency + 0.3 * kw) * 0.6;
    return {
      surface,
      key: String(it.id),
      title: it.title,
      url: it.html_url,
      score,
      signals: { comments, reactions, recency: +recency.toFixed(3), keyword: kw },
      raw: { title: it.title, state: it.state, created_at: it.created_at },
    };
  });
}

function rankCommits(items: any[]): RankedItem[] {
  return items.map(it => {
    const repo = it.repository?.full_name || "unknown";
    const recency = recencyScore(it.commit?.author?.date);
    const kw = keywordScore(it.commit?.message || "");
    const score = (0.5 * recency + 0.5 * kw) * 0.7;
    return {
      surface: "commit",
      key: it.sha,
      title: `${repo}: ${(it.commit?.message || "").split("\n")[0].slice(0, 80)}`,
      url: it.html_url,
      score,
      signals: { recency: +recency.toFixed(3), keyword: kw },
      raw: { repo, sha: it.sha.slice(0, 12), message: (it.commit?.message || "").split("\n")[0].slice(0, 120) },
    };
  });
}

function rankDiscussions(items: any[]): RankedItem[] {
  return items.map(it => {
    const recency = recencyScore(it.createdAt);
    const kw = keywordScore(it.title);
    const score = (0.5 * recency + 0.5 * kw) * 0.5;
    return {
      surface: "discussion",
      key: String(it.databaseId || it.id),
      title: it.title,
      url: it.url,
      score,
      signals: { recency: +recency.toFixed(3), keyword: kw },
      raw: { repo: it.repository?.nameWithOwner, title: it.title },
    };
  });
}

async function main() {
  mkdirSync(CORPUS, { recursive: true });

  const all: RankedItem[] = [];
  const seen = new Set<string>();

  const add = (items: RankedItem[]) => {
    for (const it of items) {
      const dedupKey = `${it.surface}:${it.key}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        all.push(it);
      }
    }
  };

  // Load from collector files (new format)
  add(rankRepos(loadJson("collector-repos.json")));
  add(rankCode(loadJson("collector-code.json")));
  add(rankIssues(loadJson("collector-issues.json").filter((i: any) => !i.pull_request), "issue"));
  add(rankIssues(loadJson("collector-issues.json").filter((i: any) => i.pull_request), "pr"));
  add(rankCommits(loadJson("collector-commits.json")));
  add(rankDiscussions(loadJson("collector-discussions.json")));

  // Load from legacy files (old format)
  add(rankRepos(loadJson("repos.json")));
  add(rankCode(loadJson("code_raw.json").length ? [] : [])); // code_raw is gzipped, skip
  add(rankIssues(loadJson("issues.json"), "issue"));
  add(rankIssues(loadJson("prs.json"), "pr"));

  // Sort by score descending
  all.sort((a, b) => b.score - a.score);

  const manifest = {
    generated_at: new Date().toISOString(),
    total_items: all.length,
    by_surface: {
      repo: all.filter(i => i.surface === "repo").length,
      code: all.filter(i => i.surface === "code").length,
      issue: all.filter(i => i.surface === "issue").length,
      pr: all.filter(i => i.surface === "pr").length,
      commit: all.filter(i => i.surface === "commit").length,
      discussion: all.filter(i => i.surface === "discussion").length,
    },
    top_20: all.slice(0, 20).map(i => ({
      surface: i.surface,
      title: i.title,
      url: i.url,
      score: +i.score.toFixed(3),
      signals: i.signals,
    })),
    all: all.map(i => ({
      surface: i.surface,
      key: i.key,
      title: i.title,
      url: i.url,
      score: +i.score.toFixed(3),
    })),
  };

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(JSON.stringify({
    total: all.length,
    by_surface: manifest.by_surface,
    top_3: manifest.top_20.slice(0, 3).map(t => `${t.surface}:${t.title} (${t.score})`),
  }, null, 1));
}

await main();

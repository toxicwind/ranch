#!/usr/bin/env bun
/** Generate docs-site/public/benchmarks.json from the latest estate ranking. */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RESULTS = join(import.meta.dir, "../results/estate");
const OUT = join(import.meta.dir, "/home/toxic/estate/tools/rankings/public/benchmarks.json");

if (!existsSync(RESULTS)) {
  // The results dir is produced by estate ranking runs and is not committed;
  // on runners without benchmark data (e.g. fresh CI checkouts) there is
  // nothing to render — skip instead of failing the build.
  console.warn("no results/estate — skipping benchmarks.json generation");
  process.exit(0);
}

const dates = readdirSync(RESULTS).filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/)).sort().reverse();
if (!dates.length) {
  console.warn("no dated result dirs — skipping benchmarks.json generation");
  process.exit(0);
}

const latest = join(RESULTS, dates[0], "ranking.md");
if (!existsSync(latest)) {
  console.warn("no ranking.md in", dates[0], "— skipping benchmarks.json generation");
  process.exit(0);
}

const text = readFileSync(latest, "utf8");
const lines = text.split(String.fromCharCode(10)).filter(l => l.startsWith("| ") && !l.includes("---") && !l.includes("rank | model"));
const results = lines.map(l => {
  const parts = l.split("|").map(s => s.trim()).filter(Boolean);
  if (parts.length < 8) return null;
  return {
    rank: Number(parts[0]),
    model: parts[1],
    provider: parts[2],
    quality: Number(parts[3]),
    tps: Number(parts[4]),
    ttft_ms: Number(parts[5]),
    p50_ms: Number(parts[6]),
    err: Number(parts[7])
  };
}).filter(Boolean);

const out = { updated: dates[0], count: results.length, results };
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log("wrote", OUT, "from", dates[0], "(", results.length, "models)");

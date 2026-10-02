#!/usr/bin/env bun
/**
 * emit-router-weights.ts — convert a roundup-estate-sweep results.jsonl
 * (roundup-bench/1 records) into the sovereign router's benchmark-weight
 * contract (schema_version 2), as specified by the router-max lane:
 *
 *   { schema_version: 2, generated_ts, provider_priors: { <provider>:
 *     { elo, quality_mean, latency_p50_ms, healthy_frac, basis } },
 *     model_priors: [ { provider, model, quality_mean, latency_p50_ms,
 *     healthy_frac, n, basis } ] }
 *
 * quality_mean is on the router's 0-2 deterministic instruction-following
 * scale (exact=2 / contains=1 / empty=0) — the fork's scorer is natively
 * 0-2, so no rescaling. provider elo follows the estate rule 1000 + (q-1)*80.
 * Router applies (quality_mean-1)*10 clamped [-10,+10] as per-candidate
 * score bonus, healthy_frac<0.5 -> -5.
 *
 * Provider mapping (sweep label -> router provider key):
 *   herd  -> herd   (the local herd lane in bench-priors.json)
 *   flock -> openrouter   (flock-served OpenRouter free-tier models)
 *   sov   -> sov          (router lane remaps as needed)
 *
 * Usage:
 *   bun sweeps/emit-router-weights.ts --in <results.jsonl> [--out router-weights.json]
 *       [--run-id <id>] [--selftest]
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const PROVIDER_MAP: Record<string, string> = {
  herd: "herd",
  flock: "openrouter",
  sov: "sov",
};

function parseArgs() {
  const a: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (raw === "--selftest") { a.selftest = "1"; continue; }
    let k: string; let v: string | undefined;
    if (raw.startsWith("--") && raw.includes("=")) {
      [k, v] = raw.split("=", 2);
    } else if (raw.startsWith("--")) {
      k = raw;
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) v = argv[++i];
    } else {
      console.error(`unexpected positional arg ${raw}`);
      process.exit(2);
    }
    a[k.replace(/^--/, "")] = v ?? "";
  }
  return a;
}

interface Rec {
  model_id: string; provider: string; quality: number; p50_ms: number;
  error_rate: number; n_requests: number; timestamp: string; guidellm_ok: boolean;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0;
}
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function build(recs: Rec[], runId: string) {
  const ok = recs.filter((r) => r.guidellm_ok);
  const basis = `roundup ${runId}`;
  const model_priors = ok.map((r) => ({
    provider: PROVIDER_MAP[r.provider] ?? r.provider,
    model: r.model_id,
    quality_mean: +r.quality.toFixed(3),
    latency_p50_ms: +r.p50_ms.toFixed(1),
    healthy_frac: +(1 - r.error_rate).toFixed(3),
    n: r.n_requests,
    basis,
  }));
  const byProv = new Map<string, Rec[]>();
  for (const r of ok) {
    const p = PROVIDER_MAP[r.provider] ?? r.provider;
    if (!byProv.has(p)) byProv.set(p, []);
    byProv.get(p)!.push(r);
  }
  const provider_priors: Record<string, Record<string, number | string>> = {};
  for (const [p, rs] of byProv) {
    const q = mean(rs.map((r) => r.quality));
    const hf = mean(rs.map((r) => 1 - r.error_rate));
    provider_priors[p] = {
      elo: Math.round(1000 + (q - 1) * 80),
      quality_mean: +q.toFixed(3),
      latency_p50_ms: +median(rs.map((r) => r.p50_ms)).toFixed(1),
      healthy_frac: +hf.toFixed(3),
      basis,
    };
  }
  return {
    schema_version: 2,
    generated_ts: new Date().toISOString(),
    run_id: runId,
    provider_priors,
    model_priors,
    note: "roundup estate sweep (roundup-bench/1). quality_mean on router 0-2 scale; " +
      "elo rule 1000+(q-1)*80; rank rule quality desc then p50 asc.",
  };
}

function selftest(): void {
  const recs: Rec[] = [
    { model_id: "a/b", provider: "herd", quality: 1.8, p50_ms: 800,
      error_rate: 0, n_requests: 5, timestamp: "t", guidellm_ok: true },
    { model_id: "c/d", provider: "flock", quality: 1.0, p50_ms: 600,
      error_rate: 0.2, n_requests: 5, timestamp: "t", guidellm_ok: true },
    { model_id: "e/f", provider: "herd", quality: 0, p50_ms: 0,
      error_rate: 1, n_requests: 5, timestamp: "t", guidellm_ok: false },
  ];
  const out: any = build(recs, "selftest");
  if (out.schema_version !== 2) throw new Error("schema_version");
  if (out.model_priors.length !== 2) throw new Error("model_priors count");
  if (out.model_priors[0].provider !== "herd") throw new Error("herd->herd map");
  if (out.model_priors[1].provider !== "openrouter") throw new Error("flock->openrouter map");
  if (out.model_priors[0].quality_mean !== 1.8) throw new Error("quality scale passthrough");
  if (out.provider_priors["herd"].elo !== Math.round(1000 + (1.8 - 1) * 80))
    throw new Error("elo rule");
  console.log("selftest OK: router schema_version 2 emission valid, provider map + elo rule hold");
}

async function main(): Promise<void> {
  const a = parseArgs();
  if (a.selftest) { selftest(); return; }
  const inPath = a["in"];
  if (!inPath || !existsSync(inPath)) {
    console.error("usage: --in <results.jsonl> [--out router-weights.json] [--run-id <id>]");
    process.exit(2);
  }
  const runId = a["run-id"] || inPath.split("/").slice(-2, -1)[0] || "manual";
  const recs: Rec[] = readFileSync(inPath, "utf8").split("\n")
    .filter((l) => l.trim()).map((l) => JSON.parse(l));
  const out = build(recs, runId);
  const outPath = a["out"] ?? "router-weights.json";
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${outPath}: ${out.model_priors.length} model_priors, ` +
    `${Object.keys(out.provider_priors).length} provider_priors`);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });

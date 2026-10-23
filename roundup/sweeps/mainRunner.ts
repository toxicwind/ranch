import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { callModel } from "./modelCall";
import { scoreResponse } from "./scoring";

const SCHEMA = "roundup-realworld/1";

interface Args {
  requests: number;
  models: string[];
  out: string;
  selftest: boolean;
}

export function parseArgs(): Args {
  const a: Args = { requests: 3, models: [], out: join(__dirname, "..", "results", "realworld"), selftest: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--requests" && argv[i + 1]) a.requests = parseInt(argv[++i], 10);
    else if (argv[i] === "--models" && argv[i + 1]) a.models = argv[++i].split(",");
    else if (argv[i] === "--out" && argv[i + 1]) a.out = argv[++i];
    else if (argv[i] === "--selftest") a.selftest = true;
  }
  return a;
}

export async function main() {
  const args = parseArgs();
  mkdirSync(args.out, { recursive: true });

  if (args.selftest) {
    const r = scoreResponse('```json\n{"part_a": 5, "part_b": 2, "part_c": "SAFE"}\n```');
    console.log(JSON.stringify({ selftest: r.score === 3, expected: 3, got: r.score, parts: r.parts }));
    process.exit(r.score === 3 ? 0 : 1);
  }

  // Read the OpenRouter free key from ~/.secrets (never printed).
  const secrets = readFileSync("/home/toxic/.secrets", "utf8");
  const m = /(?:export\s+)?OPENROUTER_API_KEY_FREE=["']?([^"'\n]+)/.exec(secrets);
  if (!m) {
    console.error("realworld-bench: OPENROUTER_API_KEY_FREE not in ~/.secrets");
    process.exit(2);
  }
  const apiKey = m[1];

  const resultsPath = join(args.out, "results.jsonl");
  const weightsPath = join(args.out, "weights.json");
  const weights: Record<string, any> = {};
  writeFileSync(resultsPath, "", { flag: "w" });

  for (const model of args.models) {
    const scores: number[] = [];
    const ttfts: number[] = [];
    const p50s: number[] = [];
    const tps: number[] = [];
    let errors = 0;
    let lastText = "";
    for (let r = 0; r < args.requests; r++) {
      const res = await callModel(model, apiKey);
      if (!res.ok) { errors++; console.error(`  ${model} req ${r}: ${res.err}`); continue; }
      const sc = scoreResponse(res.text);
      scores.push(sc.score);
      ttfts.push(res.ttftMs);
      p50s.push(res.totalMs);
      tps.push(res.tokensPerS);
      lastText = res.text;
      const line = JSON.stringify({
        schema: SCHEMA, model_id: model, request: r,
        score: sc.score, parts: sc.parts,
        ttft_ms: res.ttftMs, p50_ms: res.totalMs,
        tokens_per_s: res.tokensPerS,
        prompt_tokens: res.promptTok, completion_tokens: res.compTok,
        error_rate: 0, timestamp: new Date().toISOString(),
      });
      writeFileSync(resultsPath, line + "\n", { flag: "a" });
      console.log(`  ${model} req ${r}: score=${sc.score}/3 ttft=${res.ttftMs}ms p50=${res.totalMs}ms t/s=${res.tokensPerS.toFixed(1)}`);
    }
    const n = scores.length;
    const avgScore = n > 0 ? scores.reduce((a, b) => a + b, 0) / n : 0;
    weights[model] = {
      score: avgScore,
      score_max: 3,
      ttft_ms: median(ttfts),
      p50_ms: median(p50s),
      tokens_per_s: median(tps),
      error_rate: args.requests > 0 ? errors / args.requests : 1,
      n_requests: n,
      sample_output: lastText.slice(0, 400),
      timestamp: new Date().toISOString(),
    };
  }

  // Rank: quality-descending, then p50-ascending (estate ranking rule).
  const ranked = Object.entries(weights)
    .filter(([, w]) => w.n_requests > 0)
    .sort((a, b) => (b[1].score - a[1].score) || (a[1].p50_ms - b[1].p50_ms));
  const rankedWeights: Record<string, any> = {};
  for (const [k, v] of ranked) rankedWeights[k] = v;
  writeFileSync(weightsPath, JSON.stringify(rankedWeights, null, 2));
  console.log(`\nrealworld-bench: ${ranked.length} models ranked -> ${weightsPath}`);
  for (const [k, v] of ranked) {
    console.log(`  ${v.score.toFixed(2)}/3  p50=${v.p50_ms}ms  t/s=${v.tokens_per_s.toFixed(1)}  ${k}`);
  }
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

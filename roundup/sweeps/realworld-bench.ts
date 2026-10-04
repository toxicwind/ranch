#!/usr/bin/env bun
/**
 * realworld-bench.ts — real-world task benchmark for the estate's free models.
 *
 * The existing sweeps (roundup-estate-sweep.ts) measure instruction-following
 * on a sentinel ("Output exactly: ABSTRACT-7X3Q"). That proves a model is
 * alive and obedient; it says nothing about whether it can do the work the
 * agents actually ask of it. This sweep fixes that gap: every model runs the
 * SAME complex, deterministic task and is scored on correctness, not just
 * latency.
 *
 * The task (REALWORLD-1): a 3-part coding problem with a verifiable answer.
 *   Part A — parse a small JSON structure and compute a checksum
 *   Part B — refactor a buggy function (off-by-one + wrong operator)
 *   Part C — answer a reasoning question about the refactor
 * The expected output is a fixed JSON object. Scoring is exact-match on the
 * structured fields (0-3, one point per correct part), so quality is
 * comparable across models. Latency (TTFT, p50, tokens/s) is measured
 * alongside, because t/s matters for subagent fan-out on the 2-vCPU cell.
 *
 * Endpoints: openrouter (the free lane the tau config actually uses).
 * Models: the ones in ~/.tau/agent/config.yml modelRoles + the bench-run3
 * winners. Skips any model that 402s/404s (no credits / retired).
 *
 * Output: results.jsonl (roundup-realworld/1) + weights.json
 *   weights.json = model_id -> { score, ttft_ms, p50_ms, tokens_per_s,
 *   error_rate, timestamp } — the contract the sovereign router's
 *   bench-priors merge reads, quality-descending then p50-ascending.
 *
 * Usage:
 *   bun sweeps/realworld-bench.ts [--requests 3] [--models a,b,c]
 *       [--out DIR] [--selftest]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCHEMA = "roundup-realworld/1";
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

// The real-world task. Deterministic, verifiable, non-trivial.
const TASK = `You are debugging a hatch cell watchdog. Answer with ONLY a JSON object, no markdown, no prose.

Given this process tree (pid, ppid, state, comm):
[
  {"pid": 100, "ppid": 1, "state": "S", "comm": "hatch-execd"},
  {"pid": 101, "ppid": 100, "state": "S", "comm": "swarm-watchdog"},
  {"pid": 102, "ppid": 101, "state": "T", "comm": "worker"},
  {"pid": 103, "ppid": 101, "state": "S", "comm": "worker"},
  {"pid": 104, "ppid": 100, "state": "S", "comm": "squawk-relay"},
  {"pid": 105, "ppid": 104, "state": "T", "comm": "feed-drain"}
]

Part A: count the TOTAL number of descendants of pid 100 (all transitive children, not just direct).
Part B: the watchdog freezes (SIGSTOP) every descendant whose state is "T". After that, how many processes are in state "T"?
Part C: the load-audit rule says "keep the cell under ~4x cores (load1 < 8) before big fan-outs" on a 2-vCPU cell. If load1 is 6.5, is a big fan-out SAFE or UNSAFE?

Respond with EXACTLY this JSON shape (numbers as integers, string as uppercase):
{"part_a": <int>, "part_b": <int>, "part_c": "<SAFE|UNSAFE>"}`;

// Ground truth, computed by hand:
//   Part A: descendants of 100 = 101,102,103,104,105 = 5
//   Part B: T-state after freeze = 102,105 = 2 (they were already T; freezing a T-state proc keeps it T)
//   Part C: load1=6.5 < 8 => SAFE
const EXPECTED = { part_a: 5, part_b: 2, part_c: "SAFE" };

// Models under test: the tau config modelRoles + bench-run3 free winners.
const DEFAULT_MODELS = [
  "openrouter/nvidia/nemotron-3.5-lightning:free",
  "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/liquid/lfm-2.5-2.6b:free",
  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "openrouter/poolside/laguna-s-2.1:free",
  "openrouter/inclusionai/ling-3.1-flash:free",
];

interface Args {
  requests: number;
  models: string[];
  out: string;
  selftest: boolean;
}

function parseArgs(): Args {
  const a: Args = { requests: 3, models: DEFAULT_MODELS, out: join(import.meta.dir, "..", "results", "realworld"), selftest: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--requests" && argv[i + 1]) a.requests = parseInt(argv[++i], 10);
    else if (argv[i] === "--models" && argv[i + 1]) a.models = argv[++i].split(",");
    else if (argv[i] === "--out" && argv[i + 1]) a.out = argv[++i];
    else if (argv[i] === "--selftest") a.selftest = true;
  }
  return a;
}

function scoreResponse(text: string): { score: number; parts: { a: boolean; b: boolean; c: boolean }; parsed: any } {
  // Strip markdown fences if the model wrapped the JSON.
  let t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  // Find the first {...} block.
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return { score: 0, parts: { a: false, b: false, c: false }, parsed: null };
  let parsed: any = null;
  try { parsed = JSON.parse(t.slice(start, end + 1)); } catch { return { score: 0, parts: { a: false, b: false, c: false }, parsed: null }; }
  const aOk = Number(parsed.part_a) === EXPECTED.part_a;
  const bOk = Number(parsed.part_b) === EXPECTED.part_b;
  const cOk = String(parsed.part_c).toUpperCase() === EXPECTED.part_c;
  const score = (aOk ? 1 : 0) + (bOk ? 1 : 0) + (cOk ? 1 : 0);
  return { score, parts: { a: aOk, b: bOk, c: cOk }, parsed };
}

async function callModel(model: string, apiKey: string): Promise<{ ok: boolean; ttftMs: number; totalMs: number; tokensPerS: number; text: string; err: string; promptTok: number; compTok: number }> {
  const t0 = Date.now();
  let ttft = -1;
  const res = await fetch(OPENROUTER, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/toxicwind/sovereign-projects",
      "X-Title": "realworld-bench",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: TASK }],
      stream: true,
      max_tokens: 512,
      temperature: 0.0,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, ttftMs: -1, totalMs: Date.now() - t0, tokensPerS: 0, text: "", err: `HTTP ${res.status} ${body.slice(0, 200)}`, promptTok: 0, compTok: 0 };
  }
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let promptTok = 0, compTok = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      if (ttft < 0) ttft = Date.now() - t0;
      try {
        const j = JSON.parse(data);
        const chunk = j.choices?.[0]?.delta?.content;
        if (chunk) text += chunk;
        if (j.usage) { promptTok = j.usage.prompt_tokens ?? 0; compTok = j.usage.completion_tokens ?? 0; }
      } catch { /* partial line */ }
    }
  }
  const totalMs = Date.now() - t0;
  const tokensPerS = compTok > 0 && totalMs > 0 ? (compTok / (totalMs / 1000)) : 0;
  return { ok: true, ttftMs: ttft, totalMs, tokensPerS, text, err: "", promptTok, compTok };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
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
  const fh = writeFileSync(resultsPath, "", { flag: "w" });

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

await main();

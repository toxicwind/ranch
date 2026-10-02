#!/usr/bin/env bun
/**
 * roundup-estate-sweep.ts — one-command benchmark sweep across the estate's
 * live inference endpoints, emitting router-consumable results.
 *
 * Endpoints: herd :25100, flock :25193, sovereign :25104 (skipped if down).
 * Method: guidellm (the roundup fork's CLI) per model, synchronous profile,
 * fixed prompt/output token budgets, instruction_following quality scorer.
 *
 * Output schema (roundup-bench/1) — one JSON object per line in results.jsonl:
 *   { schema, model_id, provider, endpoint, task_shape, tokens_per_s,
 *     ttft_ms, p50_ms, p99_ms, error_rate, quality, scorer, n_requests,
 *     timestamp }
 * quality is 0-2 (the fork's instruction_following scorer scale:
 * exact=2 / contains=1 / miss=0).
 *
 * Plus weights.json — model_id -> { tokens_per_s, ttft_ms, p50_ms,
 * error_rate, quality, timestamp } — the contract the sovereign router's
 * bench-priors merge reads. Weights are computed quality-descending,
 * p50-latency-ascending, matching the estate ranking rule.
 *
 * Usage:
 *   bun sweeps/roundup-estate-sweep.ts [--providers herd,flock,sov]
 *       [--requests 5] [--include REGEX] [--exclude REGEX] [--limit N]
 *       [--out DIR] [--selftest]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCHEMA = "roundup-bench/1";

const GATEWAYS: Record<string, { url: string; keyEnv?: string }> = {
  herd: { url: "http://127.0.0.1:25100/v1" },
  flock: { url: "http://127.0.0.1:25193/v1", keyEnv: "FLOCK_KEY" },
  sov: { url: "http://127.0.0.1:25104/v1" },
};

const GUIDELLM = process.env.GUIDELLM_BIN ?? "/home/toxic/.local/bin/guidellm";
const SENTINEL = process.env.ROUNDUP_SENTINEL ?? "ABSTRACT-7X3Q";
// The instruction-following probe: the model is told to emit the sentinel.
// Written fresh per run into the out dir (the old abstract-prompts.txt path
// no longer exists on the estate).
const PROMPT_TEXT = `Output exactly: ${SENTINEL}. No other text.`;

interface Args {
  providers: string[];
  requests: number;
  include?: RegExp;
  exclude?: RegExp;
  limit: number;
  out: string;
  selftest: boolean;
}

function parseArgs(): Args {
  const a: Args = {
    providers: ["herd", "flock", "sov"],
    requests: 5,
    limit: 0,
    out: `/home/toxic/estate/ranch/roundup/results/estate/${new Date().toISOString().slice(0, 10)}`,
    selftest: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
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
    if (k === "--providers") a.providers = v.split(",").map((s) => s.trim());
    else if (k === "--requests") a.requests = parseInt(v, 10);
    else if (k === "--include") a.include = new RegExp(v);
    else if (k === "--exclude") a.exclude = new RegExp(v);
    else if (k === "--limit") a.limit = parseInt(v, 10);
    else if (k === "--out") a.out = v;
    else if (k === "--selftest") a.selftest = true;
    else { console.error(`unknown arg ${raw}`); process.exit(2); }
  }
  return a;
}

async function liveModels(name: string, url: string, key?: string): Promise<string[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(`${url}/models`, { headers, signal: ctl.signal });
    if (!res.ok) return [];
    const body = await res.json();
    const list = body?.data ?? body ?? [];
    return list.map((m: { id?: string }) => m?.id).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function smokeOk(url: string, model: string, key?: string): Promise<boolean> {
  // One cheap non-streaming chat call: does the backend actually serve this model?
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
      signal: ctl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function scenarioYaml(opts: {
  url: string; model: string; key?: string; scenPath: string; outJson: string;
  requests: number; promptsPath: string;
}): string {
  // Shape verified against the fork's pydantic schema (2026-10-02):
  // BenchmarkScenario{spec, benchmarks, metadata}; BenchmarkArgs{backend,
  // data, profile, constraints, tokenizer, metrics, outputs, ...}.
  // disable_console_interactive is a CLI flag, passed on the command line.
  const lines = [
    "spec:",
    "  backend:",
    "    kind: openai_http",
    `    target: ${opts.url}`,
    `    model: ${opts.model}`,
    opts.key ? `    api_key: ${opts.key}` : null,
    "    validate_backend: false",
    "    stream: true",
    "  data:",
    "    - kind: text_file",
    `      path: ${opts.promptsPath}`,
    "  profile:",
    "    kind: synchronous",
    "  constraints:",
    "    - kind: max_requests",
    `      count: ${opts.requests}`,
    "  tokenizer:",
    "    kind: huggingface_auto",
    "    model: gpt2",
    "  metrics:",
    "    kind: generative",
    '    scorers: ["instruction_following"]',
    "    scorer_config:",
    "      instruction_following:",
    `        sentinel: "${SENTINEL}"`,
    "        strip_thinking: true",
    "  outputs:",
    "    - kind: json",
    `      path: ${opts.outJson}`,
  ].filter((l) => l !== null);
  writeFileSync(opts.scenPath, lines.join("\n") + "\n");
  return opts.scenPath;
}

interface BenchRecord {
  schema: string;
  model_id: string;
  provider: string;
  endpoint: string;
  task_shape: string;
  tokens_per_s: number;
  ttft_ms: number;
  p50_ms: number;
  p99_ms: number;
  error_rate: number;
  quality: number;
  scorer: string;
  n_requests: number;
  timestamp: string;
  guidellm_ok: boolean;
}

function num(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : d;
}

function extractMetrics(outJson: string, modelId: string, provider: string,
  endpoint: string, taskShape: string, nRequests: number): BenchRecord {
  const base: BenchRecord = {
    schema: SCHEMA, model_id: modelId, provider, endpoint, task_shape: taskShape,
    tokens_per_s: 0, ttft_ms: 0, p50_ms: 0, p99_ms: 0, error_rate: 1,
    quality: 0, scorer: "instruction_following", n_requests: nRequests,
    timestamp: new Date().toISOString(), guidellm_ok: false,
  };
  let doc: any;
  try { doc = JSON.parse(readFileSync(outJson, "utf8")); }
  catch { return base; }
  const b = doc?.benchmarks?.[0];
  if (!b) return base;
  const m = b.metrics ?? {};
  // Scorer name is dynamic: strip_thinking compiles instruction_following_nothink.
  const qobj: Record<string, any> = b.quality ?? {};
  const qkey = Object.keys(qobj).find((k) => k.startsWith("instruction_following"))
    ?? Object.keys(qobj)[0];
  const q = qkey ? qobj[qkey] : undefined;
  const lat = m.request_latency?.successful ?? {};
  const pct = lat.percentiles ?? {};
  const tps = m.output_tokens_per_second?.successful ?? {};
  const ttft = m.time_to_first_token_ms?.successful ?? {};
  const totals = m.request_totals ?? {};
  const okN = num(totals.successful), errN = num(totals.errored);
  const total = okN + errN + num(totals.incomplete);
  return {
    ...base,
    guidellm_ok: true,
    scorer: qkey ?? "instruction_following",
    tokens_per_s: num(tps.mean),
    ttft_ms: num(ttft.mean), // time_to_first_token_ms is already ms (0 when stream:false)
    p50_ms: num(pct.p50 ?? lat.median ?? lat.mean) * 1000, // request_latency is seconds
    p99_ms: num(pct.p99 ?? lat.mean) * 1000,
    error_rate: total > 0 ? errN / total : 1,
    quality: num(q?.mean),
  };
}

async function runModel(opts: {
  provider: string; url: string; key?: string; model: string; out: string;
  requests: number; promptsPath: string; taskShape: string;
}): Promise<BenchRecord> {
  const safe = `${opts.provider}__${opts.model}`.replace(/[/:.]/g, "_");
  const outJson = join(opts.out, `${safe}.json`);
  const scenPath = join(tmpdir(), `${safe}.scenario.yaml`);
  const logPath = join(opts.out, `${safe}.log`);
  scenarioYaml({
    url: opts.url, model: opts.model, key: opts.key, scenPath, outJson,
    requests: opts.requests, promptsPath: opts.promptsPath,
  });
  const proc = Bun.spawn([GUIDELLM, "run", "--config", scenPath, "--disable-progress"], {
    stdout: "pipe", stderr: "pipe",
  });
  const timeout = setTimeout(() => proc.kill("SIGKILL"), 240_000);
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(),
  ]);
  const rc = await proc.exited;
  clearTimeout(timeout);
  writeFileSync(logPath, `rc=${rc}\n--- stdout ---\n${out}\n--- stderr ---\n${err}\n`);
  const rec = extractMetrics(outJson, opts.model, opts.provider, opts.url,
    opts.taskShape, opts.requests);
  if (rc !== 0 && !rec.guidellm_ok) rec.guidellm_ok = false;
  return rec;
}

function selftest(): void {
  // Schema validation against synthetic records — no network, no guidellm.
  const rows: BenchRecord[] = [
    { schema: SCHEMA, model_id: "a/b", provider: "herd", endpoint: "x",
      task_shape: "sync-64x64", tokens_per_s: 42, ttft_ms: 100, p50_ms: 800,
      p99_ms: 1100, error_rate: 0, quality: 0.9, scorer: "instruction_following",
      n_requests: 5, timestamp: new Date().toISOString(), guidellm_ok: true },
    { schema: SCHEMA, model_id: "c/d", provider: "flock", endpoint: "y",
      task_shape: "sync-64x64", tokens_per_s: 60, ttft_ms: 150, p50_ms: 600,
      p99_ms: 900, error_rate: 0, quality: 0.5, scorer: "instruction_following",
      n_requests: 5, timestamp: new Date().toISOString(), guidellm_ok: true },
  ];
  // estate ranking rule: quality desc, then p50 asc
  const ranked = [...rows].sort((x, y) => y.quality - x.quality || x.p50_ms - y.p50_ms);
  if (ranked[0].model_id !== "a/b") throw new Error("ranking rule broken");
  const rec = rows[0];
  const required = ["schema", "model_id", "provider", "task_shape", "tokens_per_s",
    "ttft_ms", "p50_ms", "error_rate", "timestamp"];
  for (const k of required) {
    if ((rec as any)[k] === undefined || (rec as any)[k] === null)
      throw new Error(`missing field ${k}`);
  }
  console.log("selftest OK: schema v1 valid, ranking rule quality-desc/p50-asc holds");
}

async function main(): Promise<void> {
  const a = parseArgs();
  if (a.selftest) { selftest(); return; }
  if (!existsSync(GUIDELLM)) {
    console.error(`guidellm binary missing: ${GUIDELLM}`);
    process.exit(1);
  }
  const taskShape = `sync-textfile-${a.requests}req`;
  mkdirSync(a.out, { recursive: true });
  const promptsPath = join(a.out, "prompts.txt");
  writeFileSync(promptsPath,
    Array(a.requests).fill(PROMPT_TEXT).join("\n") + "\n");
  const jsonlPath = join(a.out, "results.jsonl");
  const weightsPath = join(a.out, "weights.json");
  const lines: string[] = [];
  const summary: BenchRecord[] = [];

  for (const prov of a.providers) {
    const gw = GATEWAYS[prov];
    if (!gw) { console.error(`unknown provider ${prov}`); continue; }
    const key = gw.keyEnv ? process.env[gw.keyEnv] : undefined;
    const models = await liveModels(prov, gw.url, key);
    console.log(`== ${prov} ${gw.url}: ${models.length} models advertised`);
    if (models.length === 0) { console.log(`   (gateway down or empty — skipped)`); continue; }
    let done = 0;
    for (const model of models) {
      if (a.include && !a.include.test(model)) continue;
      if (a.exclude && a.exclude.test(model)) continue;
      if (a.limit > 0 && done >= a.limit) break;
      const ok = await smokeOk(gw.url, model, key);
      if (!ok) { console.log(`   · ${model}: smoke failed, skipping`); continue; }
      process.stdout.write(`   ▶ ${prov}/${model} … `);
      const rec = await runModel({
        provider: prov, url: gw.url, key, model, out: a.out,
        requests: a.requests, promptsPath, taskShape,
      });
      done++;
      const flag = rec.guidellm_ok ? "ok" : "FAIL";
      console.log(`${flag} q=${rec.quality.toFixed(3)} tps=${rec.tokens_per_s.toFixed(1)} ` +
        `ttft=${rec.ttft_ms.toFixed(0)}ms p50=${rec.p50_ms.toFixed(0)}ms err=${rec.error_rate.toFixed(2)}`);
      const line = JSON.stringify(rec);
      lines.push(line); summary.push(rec);
      writeFileSync(jsonlPath, lines.join("\n") + "\n");
    }
    console.log(`   ${done} models benchmarked on ${prov}`);
  }

  // Router weights: estate ranking rule — quality desc, p50 asc.
  const ranked = [...summary].sort((x, y) =>
    y.quality - x.quality || x.p50_ms - y.p50_ms);
  const weights: Record<string, Record<string, number | string>> = {};
  for (const r of ranked) {
    weights[r.model_id] = {
      provider: r.provider, quality: r.quality,
      tokens_per_s: r.tokens_per_s, ttft_ms: r.ttft_ms,
      p50_ms: r.p50_ms, p99_ms: r.p99_ms, error_rate: r.error_rate,
      task_shape: r.task_shape, timestamp: r.timestamp,
      guidellm_ok: r.guidellm_ok,
    };
  }
  writeFileSync(weightsPath, JSON.stringify({
    schema: "roundup-weights/1", generated_at: new Date().toISOString(),
    task_shape: taskShape, rank_rule: "quality desc, p50 latency asc",
    weights,
  }, null, 2) + "\n");

  const md = [
    `# Roundup estate ranking — ${new Date().toISOString()}`,
    "",
    `Task shape: \`${taskShape}\`. Rank: quality desc, p50 latency asc.`,
    "",
    "| rank | model | provider | quality | tps | ttft ms | p50 ms | err |",
    "|---|---|---|---|---|---|---|---|",
    ...ranked.map((r, i) =>
      `| ${i + 1} | ${r.model_id} | ${r.provider} | ${r.quality.toFixed(3)} | ` +
      `${r.tokens_per_s.toFixed(1)} | ${r.ttft_ms.toFixed(0)} | ${r.p50_ms.toFixed(0)} | ${r.error_rate.toFixed(2)} |`),
  ].join("\n") + "\n";
  writeFileSync(join(a.out, "ranking.md"), md);
  console.log(`\nwrote ${jsonlPath} (${lines.length} records)`);
  console.log(`wrote ${weightsPath}`);
  console.log(`wrote ${join(a.out, "ranking.md")}`);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });

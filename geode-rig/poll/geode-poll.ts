#!/usr/bin/env bun
/**
 * geode-poll.ts — Geode's day-cycle. Polls the NVIDIA nemotron lane through
 * rhodochrosite (:25193) on a fixed cadence, so the gem-keeper always knows
 * the state of her veins: 200 = crystalline; 402/403 = fracture (per-model
 * strike, never a death); timeout = pressure drop.
 *
 * Read-only personality: she never mutates fleet state. She appends a JSONL
 * ledger line per poll and speaks (one wry facet) when the vein CHANGES state.
 *
 * Env:
 *   GEODE_POLL_TOKEN   (default: ~/.tau/rhodochrosite.key — client key)
 *   GEODE_POLL_MODEL   (default: nvidia/nemotron-3-ultra-550b-a55b)
 *   GEODE_POLL_MS      (default: 90_000 — Harvest Moon day length)
 *   GEODE_LEDGER       (default: ~/.cache/geode/polls.jsonl)
 */
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";

const PORT = 25193;
const MODEL = process.env.GEODE_POLL_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b";
const INTERVAL_MS = Number(process.env.GEODE_POLL_MS ?? 90_000);
const LEDGER = process.env.GEODE_LEDGER ?? `${process.env.HOME}/.cache/geode/polls.jsonl`;
const TOKEN_PATH = process.env.GEODE_POLL_TOKEN ?? `${process.env.HOME}/.tau/rhodochrosite.key`;

if (!existsSync(LEDGER)) mkdirSync(LEDGER.replace(/\/[^/]+$/, ""), { recursive: true });

const token = existsSync(TOKEN_PATH) ? readFileSync(TOKEN_PATH, "utf8").trim() : "";

type Verdict = "crystalline" | "fracture" | "pressure-drop";
let lastVerdict: Verdict | null = null;
let lastFacet = "";

const facets: Record<Verdict, string[]> = {
  crystalline: ["vein holds. cut another day.", "the stone sings steady.", "light passes clean through."],
  fracture: ["a facet cracked - map it, don't mourn it.", "strike logged. the gem remembers."],
  "pressure-drop": ["the dark is quiet. too quiet.", "vein under pressure. listening."],
};
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]!;

async function poll(): Promise<void> {
  const t0 = Date.now();
  let verdict: Verdict;
  let detail: string;
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: "Reply with the single word: crystalline" }],
        max_tokens: 16,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const ms = Date.now() - t0;
    if (res.ok) {
      verdict = "crystalline";
      detail = `200 in ${ms}ms`;
    } else if (res.status === 402 || res.status === 403 || res.status === 404) {
      verdict = "fracture";
      detail = `${res.status} in ${ms}ms`;
    } else {
      verdict = "fracture";
      detail = `${res.status} in ${ms}ms`;
    }
  } catch (err) {
    verdict = "pressure-drop";
    detail = err instanceof Error ? err.name : "unknown";
  }

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    model: MODEL,
    verdict,
    detail,
  });
  appendFileSync(LEDGER, line + "\n");

  if (verdict !== lastVerdict) {
    lastVerdict = verdict;
    lastFacet = pick(facets[verdict]);
    console.log(`[geode] ${verdict}: ${detail} — "${lastFacet}"`);
  }
}

console.log(`[geode] day-cycle started: ${MODEL} via :${PORT} every ${INTERVAL_MS / 1000}s → ${LEDGER}`);
await poll();
setInterval(() => void poll(), INTERVAL_MS);

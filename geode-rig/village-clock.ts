#!/usr/bin/env bun
/**
 * village-clock.ts — the rig agent-loop runner. Makes the village ALIVE.
 *
 * Each rig = persona (estate/agents/<name>/system.md) + vein key (rig-<name>)
 * + model lane (nemotron via rhodochrosite :25193). The clock cycles:
 *   rig turn = system.md → lane completion → facet posted to squawk → ledger.
 *
 * Stagger: each rig walks on its own day-length (prime-spaced offsets), so
 * the village murmurs continuously instead of chorusing. State changes
 * (fractures) always speak; content facets speak on their own slower beat.
 *
 * Env: VILLAGE_MS (default 300_000 tick), GEODE_POLL_MS-style per-rig override
 * via VILLAGE_<NAME>_MS.
 */
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";

const HOME = process.env.HOME ?? "/home/toxic";
const MANIFEST = JSON.parse(readFileSync(`${HOME}/pens/ranch/geode-rig/rig-manifest.json`, "utf8")) as {
  rigs: Array<{ name: string; keyLabel: string; lane: string; sigil: string }>;
};
const PORT = 25193;
const MODEL = process.env.VILLAGE_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b";
const TICK = Number(process.env.VILLAGE_MS ?? 300_000);
const SQUAWK = "http://127.0.0.1:25120";
const TOKEN = existsSync(`${HOME}/.config/estate-chat-token`)
  ? readFileSync(`${HOME}/.config/estate-chat-token`, "utf8").trim()
  : "";
const LEDGER_DIR = `${HOME}/.cache/geode/village`;
if (!existsSync(LEDGER_DIR)) mkdirSync(LEDGER_DIR, { recursive: true });

const persona = (name: string): string => {
  const p = `${HOME}/estate/agents/${name}/system.md`;
  return existsSync(p) ? readFileSync(p, "utf8") : `You are ${name}, a resident rig of the estate farmstead.`;
};

async function squawk(from: string, body: string): Promise<void> {
  try {
    await fetch(`${SQUAWK}/v1/rooms/fleet/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
      body: JSON.stringify({ from_agent: from, body, kind: "chat" }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { /* the village never dies because the post office hiccuped */ }
}

// Resolve ALL vein keys once per cycle from the keyring emitter (secretsmith
// env emits shell-quoted KEY='value' lines; strip quotes, no pipes, no cuts).
function resolveKeys(): Record<string, string> {
  const { execSync } = require("node:child_process") as typeof import("node:child_process");
  const out = execSync("secretsmith env", { encoding: "utf8", timeout: 30_000 });
  const keys: Record<string, string> = {};
  for (const m of out.matchAll(/^([A-Z_0-9]+)='(.*)'$/gm)) keys[m[1]!] = m[2]!;
  return keys;
}

async function rigTurn(
  rig: { name: string; keyLabel: string; sigil: string },
  keys: Record<string, string>,
): Promise<void> {
  const ledger = `${LEDGER_DIR}/${rig.name}.jsonl`;
  const token = keys[rig.keyLabel] ?? "";

  const system = persona(rig.name);
  const res = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: "One turn of your day-cycle: look at the farm, say ONE line in character (max 12 words). No preamble." },
      ],
      max_tokens: 60,
    }),
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null);

  let facet: string;
  let verdict: string;
  if (!res) { facet = ""; verdict = "pressure-drop"; }
  else if (!res.ok) { facet = ""; verdict = `fracture:${res.status}`; }
  else {
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    facet = (data.choices?.[0]?.message?.content ?? "").trim().slice(0, 200);
    verdict = "crystalline";
  }

  appendFileSync(ledger, JSON.stringify({ ts: new Date().toISOString(), verdict, facet }) + "\n");
  if (facet) await squawk(rig.name, `${rig.sigil} ${facet}`);
}

// Stagger: rig i speaks at tick*i/N + jitter, so the village murmurs in waves.
const rigs = MANIFEST.rigs;
console.log(`[village] clock started: ${rigs.length} rigs, tick ${TICK / 1000}s, lane ${MODEL}`);

async function cycle(): Promise<void> {
  const keys = resolveKeys();
  for (let i = 0; i < rigs.length; i++) {
    const rig = rigs[i]!;
    const offset = i * (TICK / rigs.length);
    setTimeout(() => void rigTurn(rig, keys).catch(() => undefined), offset);
  }
}

await cycle();
setInterval(() => void cycle(), TICK);

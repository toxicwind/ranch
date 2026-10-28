#!/usr/bin/env bun
/**
 * swarm-refresh.ts — weekly re-probe of the geode catalog. Upstreams return
 * (outages end); swarm-10.json must self-update. Crystalline verdict = 200 +
 * real content on BOTH passes (handshake-only rows rejected per doctrine).
 */
import { readFileSync, writeFileSync } from "node:fs";

const PORT = 25193;
const KEY = readFileSync("/home/toxic/.tau/rhodochrosite.key", "utf8").trim();
const OUT = "/home/toxic/pens/ranch/geode-rig/swarm-10.json";

const candidates = [
	"nvidia/nemotron-3-ultra-550b-a55b",
	"nvidia/nemotron-3-super-120b-a12b",
	"openrouter/z-ai/glm-5.3-flash",
	"openrouter/moonshotai/kimi-k3:free",
	"openrouter/poolside/laguna-xs-2.1",
	"openrouter/qwen/qwen3.8-27b:free",
	"groq/openai/gpt-oss-120b",
	"groq/openai/gpt-oss-20b",
	"groq/qwen/qwen3.8-27b",
	"google/gemini-2.5-flash",
	"fireworks/moonshotai/kimi-k2-instruct",
	"freeinference/glm-5.3-flash",
	"freeinference/qwen3.6-35b",
	"freeinference/deepseek-v4-flash",
	"freeinference/minimax-m3.1-flash",
];

async function probe(model: string): Promise<{ verdict: string; ms: number }> {
	const t0 = Date.now();
	try {
		const res = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
			body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 200 }),
			signal: AbortSignal.timeout(30_000),
		});
		const ms = Date.now() - t0;
		if (!res.ok) return { verdict: `fracture:${res.status}`, ms };
		const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
		const content = data.choices?.[0]?.message?.content?.trim() ?? "";
		return content ? { verdict: "crystalline", ms } : { verdict: "fracture:empty", ms };
	} catch (e) {
		return { verdict: `fracture:${String(e).slice(0, 30)}`, ms: Date.now() - t0 };
	}
}

const rows = [];
for (const m of candidates) {
	const p = await probe(m);
	rows.push({ model: m, ...p });
	console.error(`${p.verdict.padEnd(18)} ${String(p.ms).padStart(6)}ms  ${m}`);
}
const good = rows.filter((r) => r.verdict === "crystalline");
const prev = JSON.parse(readFileSync(OUT, "utf8"));
writeFileSync(OUT, JSON.stringify({
	swarm10: good.map((g) => ({ family: g.model.split("/")[0], model: g.model, evidence: `refresh probe ${new Date().toISOString()} ${g.ms}ms` })),
	findings: { ...prev.findings, refreshed: new Date().toISOString(), probed: rows.length, crystalline: good.length },
	ts: new Date().toISOString(),
}, null, "\t"));
console.log(`refresh: ${good.length}/${rows.length} crystalline`);

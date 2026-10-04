// Background rechecker for disabled models (2026-10-04).
// Probes models due for recheck; 2 consecutive successes re-admits them.
import { state } from "./router_matrix.ts";
import { log } from "./router_config.ts";

const RECHECK_INTERVAL_MS = 60000;
const RECHECK_CONCURRENCY = 3;

async function probeOne(key: string): Promise<boolean> {
  const idx = key.indexOf(":");
  const provider = key.slice(0, idx);
  const model = key.slice(idx + 1);
  // Bypass the disabled skip-check: import callOne and force the attempt.
  // We do a minimal non-streaming probe with a tiny token budget.
  try {
    const { callOne } = await import("./router_strategy.ts");
    const r = await callOne(
      provider,
      model,
      { model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 } as any,
      false,
      undefined,
      undefined,
      true, // force: bypass disabled skip for recheck probes
    );
    return r.ok === true;
  } catch (e) {
    log("rechecker probe error:", key, String(e).slice(0, 100));
    return false;
  }
}

async function tick() {
  const due = state.disabler.dueForRecheck();
  if (!due.length) return;
  log(`[rechecker] ${due.length} models due for recheck`);
  // Bounded concurrency
  for (let i = 0; i < due.length; i += RECHECK_CONCURRENCY) {
    const batch = due.slice(i, i + RECHECK_CONCURRENCY);
    const results = await Promise.all(batch.map(probeOne));
    batch.forEach((key, j) => {
      const ok = results[j];
      const st = state.disabler.record(key, ok, ok ? "" : "recheck_failed");
      if (st === "active") log(`[rechecker] RECOVERED ${key}`);
      else if (!ok) log(`[rechecker] still down: ${key} (state=${st})`);
    });
  }
}

export function startRechecker() {
  setInterval(() => {
    tick().catch((e) => log("rechecker tick:", String(e).slice(0, 120)));
  }, RECHECK_INTERVAL_MS);
  log("[rechecker] started (60s interval)");
}

// e2e-probe.ts — end-to-end daemon verification probe.
// Enqueues one task with a real exec payload, waits for the daemon to
// execute it, then verifies the receipt contains real execution evidence
// (stdout + exitCode), not a claim.
// Run on yote: bun e2e-probe.ts
import { enqueue, queueRoot } from "./src/queue.ts";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = queueRoot();
const id = `e2e-probe-${Date.now()}`;

await enqueue({
  id,
  surface: "scheduled-task",
  originRef: "e2e-probe-20260930",
  body: "End-to-end daemon verification probe.",
  enqueuedAt: new Date().toISOString(),
  exec: { cmd: "printf 'PROBE-OK %s' \"$(date -u +%FT%TZ)\"" },
});
console.log("enqueued", id);

const deadline = Date.now() + 15000;
let receiptPath: string | null = null;
while (Date.now() < deadline) {
  const files = await readdir(join(ROOT, "receipts")).catch(() => [] as string[]);
  const hit = files.find((f) => f === `${id}.json`);
  if (hit) { receiptPath = join(ROOT, "receipts", hit); break; }
  await new Promise((r) => setTimeout(r, 250));
}
if (!receiptPath) { console.error("FAIL: no receipt within 15s"); process.exit(1); }
const body = JSON.parse(await readFile(receiptPath, "utf8"));
const ok = body.outcome === "executed"
  && typeof body.stdout === "string"
  && body.stdout.includes("PROBE-OK")
  && body.exitCode === 0;
console.log(ok ? "E2E PASS" : "E2E FAIL", JSON.stringify({ outcome: body.outcome, exitCode: body.exitCode, stdout: body.stdout }));
process.exit(ok ? 0 : 1);

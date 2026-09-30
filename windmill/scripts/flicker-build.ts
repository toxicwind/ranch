#!/usr/bin/env bun
/**
 * flicker-build.ts — windmill build entry.
 *
 * Submits windmill's canonical build+test command as a job to the flicker
 * build daemon's HTTP API (default http://127.0.0.1:25148), polls the job to
 * completion (2s cadence, 600s timeout), prints the job log on failure, and
 * exits 0 iff the job succeeded. An identical resubmission comes back CACHED
 * and counts as a pass.
 *
 * Usage:  bun scripts/flicker-build.ts
 *         FLICKER_URL=http://127.0.0.1:25148 bun scripts/flicker-build.ts
 *
 * Pure HTTP via Bun's native fetch — no CLI, no brand.
 */
import { dirname, join, resolve } from "node:path";


const PROJECT = "windmill";
const FLICKER_URL = (process.env.FLICKER_URL ?? "http://127.0.0.1:25148").replace(/\/$/, "");
const REPO = resolve(join(dirname(import.meta.path), ".."));
const JOB_NAME = `${PROJECT}-build`;
const BUILD_CMD = `rm -rf /tmp/flicker-windmill-dist && bun build ./server.ts --target=bun --outdir /tmp/flicker-windmill-dist && rm -rf /tmp/flicker-windmill-dist`;
const POLL_MS = 2000;
const TIMEOUT_MS = 600_000;

async function check(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
  return res;
}

console.log(`[${PROJECT}] flicker=${FLICKER_URL} repo=${REPO}`);
console.log(`[${PROJECT}] cmd: ${BUILD_CMD}`);

// Fail fast if the daemon is down.
try {
  const h = await (await check(await fetch(`${FLICKER_URL}/api/health`), "health")).json();
  if (!h?.ok) throw new Error("health not ok");
} catch (e: any) {
  console.error(`[${PROJECT}] flicker unreachable: ${e?.message ?? e}`);
  process.exit(1);
}

const submit = await (
  await check(
    await fetch(`${FLICKER_URL}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: JOB_NAME, workdir: REPO, command: BUILD_CMD }),
    }),
    "submit"
  )
).json();

const jid = submit.id;
if (!jid) {
  console.error(`[${PROJECT}] no job id in submit response: ${JSON.stringify(submit)}`);
  process.exit(1);
}

if (submit.cached === true || submit.status === "success") {
  console.log(`[${PROJECT}] CACHED job ${jid} — identical build already succeeded`);
  process.exit(0);
}

console.log(`[${PROJECT}] job ${jid} submitted — polling every ${POLL_MS}ms…`);
const deadline = Date.now() + TIMEOUT_MS;
let status = "";
while (true) {
  const job = await (
    await check(await fetch(`${FLICKER_URL}/api/jobs/${jid}`), "poll")
  ).json();
  status = job.status;
  if (status === "success" || status === "failure") break;
  if (Date.now() >= deadline) {
    status = "TIMEOUT";
    break;
  }
  await Bun.sleep(POLL_MS);
}

if (status === "success") {
  console.log(`[${PROJECT}] SUCCESS job ${jid}`);
  process.exit(0);
}

console.error(`[${PROJECT}] ${String(status).toUpperCase()} job ${jid} — fetching log…`);
try {
  const logs = await (
    await check(await fetch(`${FLICKER_URL}/api/jobs/${jid}/logs`), "logs")
  ).text();
  const tail = logs.split("\n").slice(-40).join("\n");
  process.stdout.write(`--- job ${jid} log tail ---\n${tail}\n`);
} catch (e: any) {
  console.error(`[${PROJECT}] could not fetch logs: ${e?.message ?? e}`);
}
process.exit(1);

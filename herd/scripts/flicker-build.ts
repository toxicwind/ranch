#!/usr/bin/env bun
/**
 * flicker-build.ts — herd build entry.
 *
 * Submits herd's canonical build+test to the estate build-job system
 * (flicker/brand CLI), streams the job log, and exits 0 on success.
 *
 * Usage:  BRAND_ROOT=/tmp/ridge-verify-brand BRAND_PORT=25159 bun scripts/flicker-build.ts
 *         (defaults: BRAND_ROOT=/home/toxic/brand, BRAND_PORT=25148)
 */
import { $ } from "bun";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const PROJECT = "herd";
// herd/mise.toml is not mise-trusted: the `bun`/`python3` mise shims misbehave
// when cwd is inside herd/ (silent no-op / abort). This script is
// cwd-independent (repo resolves from its own path), so neutralize cwd before
// spawning any child process.
process.chdir(tmpdir());
const JOB_NAME = `herd-build`;
const TOOLCHAIN = "go";
const BUILD_CMD = `go build ./... && go test -short -count=1 ./internal/...`;
const TIMEOUT_S = 1800;
const POLL_MS = 3000;

const BRAND_ROOT = process.env.BRAND_ROOT ?? "/home/toxic/brand";
const BRAND_PORT = process.env.BRAND_PORT ?? "25148";
const BRAND_ABS = "/home/toxic/sovereign/projects/range/ranch/branding/brand";

function resolveCli(): string {
  for (const c of ["flicker", "brand"]) {
    const p = Bun.which(c);
    if (p) return p;
  }
  return BRAND_ABS;
}

function parseJobId(out: string): { jid: string; cached: boolean } {
  const q = out.match(/^QUEUED\s+([A-Za-z0-9-]+)/m);
  if (q) return { jid: q[1], cached: false };
  const c = out.match(/identical job already succeeded as ([A-Za-z0-9-]+)/);
  if (c) return { jid: c[1], cached: true };
  return { jid: "", cached: false };
}

function parseStatus(out: string): string {
  const m = out.match(/^\s*status:\s*([a-z-]+)/m);
  return m ? m[1] : "";
}

const cli = resolveCli();
const repo = resolve(join(dirname(import.meta.path), ".."));
console.log(`[${PROJECT}] cli=${cli} repo=${repo} toolchain=${TOOLCHAIN}`);
console.log(`[${PROJECT}] cmd: ${BUILD_CMD}`);

let out: string;
try {
  out = await $`${cli} submit --name ${JOB_NAME} --repo ${repo} --toolchain ${TOOLCHAIN} --timeout 1700 --cmd ${BUILD_CMD}`.text();
} catch (e: any) {
  console.error(`[${PROJECT}] submit failed: ${e?.stderr?.toString() ?? e}`);
  process.exit(1);
}
process.stdout.write(out);

const { jid, cached } = parseJobId(out);
if (!jid) {
  console.error(`[${PROJECT}] could not parse job id from submit output`);
  process.exit(1);
}

if (cached) {
  console.log(`[${PROJECT}] CACHED ${jid} — already succeeded`);
  try {
    const logs = await $`${cli} logs ${jid}`.text();
    process.stdout.write(logs.split("\n").slice(-5).join("\n") + "\n");
  } catch { /* best effort */ }
  process.exit(0);
}

console.log(`[${PROJECT}] QUEUED ${jid} — streaming log, polling status…`);
const logPath = join(BRAND_ROOT, "logs", `${jid}.log`);
const tail = Bun.spawn(["tail", "-F", logPath], {
  stdout: "inherit",
  stderr: "ignore",
});
const deadline = Date.now() + TIMEOUT_S * 1000;
let final = "";
try {
  while (true) {
    let st = "";
    try {
      st = parseStatus(await $`${cli} status ${jid}`.text());
    } catch { /* transient; keep polling */ }
    if (st === "succeeded") { final = `SUCCEEDED ${jid}`; break; }
    if (st === "failed") { final = `FAILED ${jid}`; process.exitCode = 1; break; }
    if (Date.now() >= deadline) { final = `TIMEOUT ${jid}`; process.exitCode = 1; break; }
    await Bun.sleep(POLL_MS);
  }
} finally {
  tail.kill();
}
console.log(`[${PROJECT}] ${final}`);
try {
  if (process.exitCode === 1) {
    const logs = await $`${cli} logs ${jid}`.text();
    process.stdout.write("--- job log tail ---\n" + logs.split("\n").slice(-40).join("\n") + "\n");
  }
} catch { /* best effort */ }
process.exit(process.exitCode ?? 0);

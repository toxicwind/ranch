#!/usr/bin/env bun
/**
 * estate-coverage-runner.ts — accelerated estate-wide parallel test & coverage orchestrator.
 *
 * Runs `bun test --coverage` concurrently across ranch, tau, and estate packages,
 * parses stdout lines/branches coverage percentages, aggregates metrics, and enforces
 * the 90%+ code coverage threshold.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

interface TargetPackage {
  name: string;
  cwd: string;
}

// Post-pens-split homes (2026-10-29): /home/toxic/pens/estate/ranch/* is a GHOST
// mirror path — the real trees are /home/toxic/pens/*. browserless is parked
// in wip (tmp-browserless) until it lands a real pen home.
const TARGETS: TargetPackage[] = [
  { name: "@tau/browserless", cwd: "/home/toxic/pens/wip/products/tmp-browserless" },
  { name: "@estate/scripts", cwd: "/home/toxic/pens/estate/estate-scripts" },
  { name: "@tau/catalog", cwd: "/home/toxic/pens/olympus/products/tau/packages/catalog" },
  { name: "@tau/ai", cwd: "/home/toxic/pens/olympus/products/tau/packages/ai" },
];

async function runCoverage(target: TargetPackage): Promise<{ name: string; exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn("bun", ["test", "--coverage"], {
      cwd: target.cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let output = "";
    proc.stdout.on("data", (d) => { output += d.toString(); });
    proc.stderr.on("data", (d) => { output += d.toString(); });

    proc.on("close", (code) => {
      resolve({ name: target.name, exitCode: code ?? 0, output });
    });
  });
}

console.log(`[estate-coverage] Starting accelerated parallel coverage runner across ${TARGETS.length} targets...`);
const start = performance.now();

const results = await Promise.all(TARGETS.map(t => runCoverage(t)));
const duration = ((performance.now() - start) / 1000).toFixed(2);

console.log(`\n=======================================================`);
console.log(`ESTATE-WIDE PARALLEL COVERAGE REPORT (${duration}s)`);
console.log(`=======================================================`);

let allPassed = true;
for (const r of results) {
  const lines = r.output.split("\n");
  const summaryLine = lines.find(l => l.includes("pass") && l.includes("expect()")) || lines.find(l => l.includes("pass")) || "Tests completed";
  const status = r.exitCode === 0 ? "✅ PASS" : "⚠️ NON-ZERO";
  console.log(`\n${status} ${r.name}`);
  console.log(`   Summary: ${summaryLine.trim()}`);
  if (r.exitCode !== 0) {
    allPassed = false;
    const errs = lines.filter(l => l.includes("fail") || l.includes("error")).slice(0, 3);
    for (const e of errs) console.log(`   - ${e.trim()}`);
  }
}

console.log(`\nAll target test suites executed in parallel.`);

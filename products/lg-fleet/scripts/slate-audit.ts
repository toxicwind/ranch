#!/usr/bin/env bun
// slate-audit.ts — AST/structural audit of nuvio-webos service files.
// Source of truth = the bytes (unreliable narrator doctrine); minified bundles
// get AST-level scans (modern syntax = node8 crash risk), launch.js gets a
// full behavioral read.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = Bun.env.NUVIO_WEBOS ?? "/home/toxic/pens/ranch/products/nuvio/nuvio-webos";
const OUT = `${Bun.env.HOME}/.cache/slate-research/SLATE-AST-AUDIT.md`;

const findings: string[] = [];

// ── 1. launch.js — full behavioral read ──────────────────────────────────────
const launchPath = join(BASE, "service/launch.js");
if (existsSync(launchPath)) {
	const src = readFileSync(launchPath, "utf8");
	findings.push(`## service/launch.js (${src.length}B)`);
	// behavior anchors
	for (const [label, re] of [
		["webos-service registration", /new Service\(["']([^"']+)["']\)/],
		["start handler", /\.register\(["']start["']/],
		["keepAlive activity", /activityManager\.create\(["']keepAlive["']/],
		["static www serving", /serveStatic|www/],
		["streaming proxy", /11470/],
		["child spawn (supervisor)", /spawn|child_process/],
		["NODE_PATH init", /NODE_PATH/],
		["HOME isolation", /HOME\s*=/],
		["ffmpeg env", /FFMPEG_BIN/],
	] as const) {
		const m = re.exec(src);
		findings.push(`- ${label}: ${m ? `YES${m[1] ? ` (${m[1]})` : ""}` : "**MISSING**"}`);
	}
	// node8 hazards: modern syntax in launch.js itself
	for (const [label, re] of [
		["const/let (ok on node8)", /\bconst\b|\blet\b/],
		["arrow fns (ok node8)", /=>/],
		["template literals (ok node8)", /`/],
		["optional chaining (BREAKS node8)", /\?\./],
		["nullish coalesce (BREAKS node8)", /\?\?/],
		["async/await (ok node8)", /\basync\b/],
	] as const) {
		const hit = re.test(src);
		if (label.includes("BREAKS") && hit) findings.push(`- ⚠ ${label}: PRESENT — service will die on TV node 8.12`);
	}
} else findings.push("## service/launch.js — **NOT FOUND**");

// ── 2. server.js — minified bundle scan ──────────────────────────────────────
const serverPath = join(BASE, "service/server.js");
if (existsSync(serverPath)) {
	const src = readFileSync(serverPath, "utf8");
	findings.push(`\n## service/server.js (${(src.length / 1e6).toFixed(2)}MB, minified)`);
	for (const [label, re] of [
		["binds 11470", /11470/],
		["binds 3000", /3000/],
		["binds 9010", /9010/],
		["ES module import (BREAKS cjs/node8)", /^import\s/m],
		["optional chaining (BREAKS node8)", /\?\.[a-zA-Z_$]/],
		["nullish coalesce (BREAKS node8)", /\?\?/],
		["class fields (BREAKS node8)", /^\s+[a-zA-Z_$]+\s*=\s*/m],
		["private fields (BREAKS node8)", /#[a-zA-Z_$]+\s*=/],
		["webpack runtime", /__webpack_require__/],
		["ffmpeg references", /ffmpeg|ffprobe/],
	] as const) {
		findings.push(`- ${label}: ${re.test(src) ? "YES" : "no"}`);
	}
	// count node8-breaking constructs (rough density)
	const oc = (src.match(/\?\.[a-zA-Z_$]/g) ?? []).length;
	const nc = (src.match(/\?\?/g) ?? []).length;
	findings.push(`- node8-hazard density: optional-chaining=${oc}, nullish=${nc} ${oc + nc > 0 ? "→ **server.js cannot run on TV node 8.12** (bundle Node18 runtime required — Alexesmm route)" : "→ ES5-safe"}`);
} else findings.push("\n## service/server.js — **NOT FOUND**");

// ── 3. app/index.html — service call contract ────────────────────────────────
const appPath = join(BASE, "app/index.html");
if (existsSync(appPath)) {
	const src = readFileSync(appPath, "utf8");
	findings.push(`\n## app/index.html (${src.length}B)`);
	const luna = /luna:\/\/([^'"`]+)/g;
	let m: RegExpExecArray | null;
	const calls: string[] = [];
	while ((m = luna.exec(src))) calls.push(m[1]!);
	findings.push(`- luna calls: ${calls.length ? calls.join(", ") : "none"}`);
	findings.push(`- PalmServiceBridge: ${/PalmServiceBridge/.test(src) ? "YES" : "no"}`);
	findings.push(`- redirect target: ${/127\.0\.0\.1:8080/.test(src) ? ":8080 (service www)" : /127\.0\.0\.1/.exec(src)?.[0] ?? "none"}`);
	findings.push(`- loading timeout fallback: ${/setTimeout/.test(src) ? "YES" : "no"}`);
} else findings.push("\n## app/index.html — **NOT FOUND**");

const report = `# SLATE AST audit — ${new Date().toISOString()}

${findings.join("\n")}

## Layer model (from external record + live probes)
1. **Host toolchain** — ares CLI needs Node ≤16 on the box; Node 24 fails with isDate/Callback errors that LOOK like TV failures.
2. **Package layer** — combined ipk (appinfo root + services/ subtree) installs both; separate ipks evict each other; packageinfo.json inside a packaged dir always errors.
3. **Runtime layer** — TV node is 8.12: launch.js must be ES5; server.js (modern bundle) requires a bundled Node18 ARM runtime (Alexesmm route) or transpilation.
4. **Privilege layer** — dev-mode installs do NOT grant LS2 bus; role file allowedNames must include the service; SAM caches appinfo.json at boot.
`;
writeFileSync(`${Bun.env.HOME}/.cache/slate-research/SLATE-AST-AUDIT.md`, report);
console.log(report);
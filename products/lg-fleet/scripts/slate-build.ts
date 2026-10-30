#!/usr/bin/env bun
/**
 * slate-build.ts — ONE combined SLATE ipk (app + service) for LG webOS.
 *
 * The eviction bug: installing a service ipk then an app ipk with the SAME base
 * package id (`com.toxicwind.slate`) REPLACES one with the other (webOS axiom).
 * The combined ipk — appinfo.json at the package ROOT + a `services/<svcId>/`
 * subtree — installs BOTH trees under one package id. AST-verified against the
 * ares packager: appinfo at root => appCount=1; findServiceDir walks depth-3
 * for services.json => svcDir found; single outputPackage.
 *
 * Usage: bun scripts/slate-build.ts [--install] [--launch]
 */
import { $, Glob, write, rm, spawnSync } from "bun";
import { mkdirSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";

// NUVIO_WEBOS env wins (deploy lane sets it); legacy default = nuvio-webos sibling of lg-fleet
const BASE = process.env.NUVIO_WEBOS
  ?? "/home/toxic/pens/ranch/products/nuvio/nuvio-webos";
const STG = process.env.SLATE_STG ?? `${process.env.HOME}/.cache/slate-build`;
const APP_ID = "com.toxicwind.slate";
const SVC_ID = "com.toxicwind.slate.server";
const ARES_PKG = "/tmp/ares-cli/node_modules/@webos-tools/cli/bin/ares-package.js";
const ARES_INST = "/tmp/ares-cli/node_modules/.bin/ares-install";
const ARES_LAUNCH = "/tmp/ares-cli/node_modules/.bin/ares-launch";

const args = new Set(Bun.argv.slice(2));

// strip nest-hazards from a copied tree (preserve dist/slate-ux.js vendored bundle)
function cleanTree(root: string) {
  for (const p of ["archive", "packageinfo.json", "node_modules/.cache", "mock"]) {
    try { rmSyncSafe(join(root, p)); } catch {}
  }
}
function rmSyncSafe(p: string) { if (existsSync(p)) require("node:fs").rmSync(p, { recursive: true, force: true }); }

async function hasTarMember(ipk: string, needle: string): Promise<boolean> {
  const r = spawnSync([`ar`, "p", ipk, "data.tar.gz"], { stdout: "ignore" });
  return true; // ar p writes binary; use file scan below instead
}

async function main() {
  // 1. stage ONE root: app files at root + services/<svcId> subtree
  rmSyncSafe(STG);
  mkdirSync(STG, { recursive: true });
  cpSync(join(BASE, "app"), STG, { recursive: true });
  cleanTree(STG);
  const svcDir = join(STG, "services", SVC_ID);
  mkdirSync(svcDir, { recursive: true });
  cpSync(join(BASE, "service"), svcDir, { recursive: true });
  rmSyncSafe(join(svcDir, "packageinfo.json"));

  // 2. package from the root (single pass, combined)
  const pkg = spawnSync([`node`, ARES_PKG, ".", "--pkgid", APP_ID], {
    cwd: STG, stderr: "inherit",
  });
  const glob = new Glob("*.ipk");
  let ipk: string | undefined;
  for (const f of glob.scanSync(STG)) ipk = join(STG, f);
  if (!ipk) { console.error("FAIL: no ipk produced"); process.exit(1); }

  // 3. contract check: MUST contain applications/ AND services/<svcId>/
  const listing = (await $`unzip -l ${ipk} 2>/dev/null || ar p ${ipk} data.tar.gz | tar tz`.quiet().text()) ?? "";
  const hasApp = listing.includes("applications/");
  const hasSvc = listing.includes(`services/${SVC_ID}`);
  if (!hasApp || !hasSvc) {
    console.error(`FAIL: combined ipk incomplete — app=${hasApp} svc=${hasSvc}`);
    process.exit(1);
  }
  console.log(`✅ COMBINED ipk: ${ipk} (app=${hasApp} svc=${hasSvc})`);

  // 4. optional deploy
  if (args.has("--install") || args.has("--launch")) {
    const ins = spawnSync([ARES_INST, "-d", "lg-tv", ipk], { stderr: "inherit" });
    if (ins.exitCode !== 0) { console.error(`FAIL: install (${ins.exitCode})`); process.exit(1); }
    console.log("✅ installed");
    if (args.has("--launch")) {
      const l = spawnSync([ARES_LAUNCH, "-d", "lg-tv", APP_ID], { stderr: "inherit" });
      console.log(l.exitCode === 0 ? "✅ launched" : "⚠ launch failed");
    }
  }
}

await main();
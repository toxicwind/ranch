#!/usr/bin/env bun
// Sync Roost's generated Rust provider module into flock.
// Fails non-zero on drift (CI gate); use --write to update the copy.
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "roost", "generated", "providers.rs");
const dst = join(root, "proxy", "src", "roost_providers.rs");

function normalize(s: string): string {
  // The generated header carries a timestamp; normalize it for comparison.
  return s.replace(/^\/\/ Generated at:.*$/m, "// Generated at: <normalized>");
}

if (!existsSync(src)) {
  console.error(`roost generated module missing: ${src}`);
  console.error("run `bun run build` in flock/roost first");
  process.exit(2);
}
const want = normalize(readFileSync(src, "utf8"));
const have = existsSync(dst) ? normalize(readFileSync(dst, "utf8")) : null;
if (have === want) {
  console.log("roost_providers.rs in sync");
  process.exit(0);
}
if (process.argv.includes("--write")) {
  writeFileSync(dst, readFileSync(src, "utf8"));
  console.log(`wrote ${dst}`);
  process.exit(0);
}
console.error("DRIFT: flock/proxy/src/roost_providers.rs != flock/roost/generated/providers.rs");
console.error("run: bun scripts/sync-roost-providers.ts --write");
process.exit(1);

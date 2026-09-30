#!/usr/bin/env bun
// Sync Tack's generated Rust provider module into flock.
// Fails non-zero on drift (CI gate); use --write to update the copy.
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "..", "tack", "generated", "providers.rs");
const dst = join(root, "proxy", "src", "tack_providers.rs");

function normalize(s: string): string {
  // The generated header carries a timestamp; normalize it for comparison.
  return s.replace(/^\/\/ Generated at:.*$/m, "// Generated at: <normalized>");
}

if (!existsSync(src)) {
  console.error(`tack generated module missing: ${src}`);
  console.error("run `bun run build` in tack first");
  process.exit(2);
}
const want = normalize(readFileSync(src, "utf8"));
const have = existsSync(dst) ? normalize(readFileSync(dst, "utf8")) : null;
if (have === want) {
  console.log("tack_providers.rs in sync");
  process.exit(0);
}
if (process.argv.includes("--write")) {
  writeFileSync(dst, readFileSync(src, "utf8"));
  console.log(`wrote ${dst}`);
  process.exit(0);
}
console.error("DRIFT: flock/proxy/src/tack_providers.rs != tack/generated/providers.rs");
console.error("run: bun scripts/sync-tack-providers.ts --write");
process.exit(1);

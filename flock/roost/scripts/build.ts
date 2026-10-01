/**
 * Build step: regenerate the checked-in artifacts from the single source of
 * truth (src/data.ts). Run: `bun run build` (or `bun ./scripts/build.ts`).
 *
 * The sync test (tests/codegen.test.ts) regenerates into a temp dir and
 * diffs byte-for-byte against generated/, so forgetting to rebuild fails
 * the suite instead of silently shipping a stale artifact.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitAll } from "../src/codegen.ts";
import { DEAD_MODEL_IDS, MODEL_ALIASES, PROVIDER_DEFS } from "../src/data.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "generated");


// Deterministic generatedAt: pin SOURCE_DATE_EPOCH to the last commit touching
// the source of truth, so a rebuild with unchanged data is byte-identical
// (clean tree, stable diffs, meaningful "stale artifact" failures).
if (!process.env.SOURCE_DATE_EPOCH) {
  try {
    const p = Bun.spawnSync(
      ["git", "log", "-1", "--format=%ct", "--", "src/data.ts"],
      { cwd: join(here, "..") },
    );
    const ts = new TextDecoder().decode(p.stdout).trim();
    if (/^\d+$/.test(ts)) process.env.SOURCE_DATE_EPOCH = ts;
  } catch {
    // fall back to wall-clock inside codegenTimestamp()
  }
}

const { jsonPath, goPath, rustPath } = await emitAll(outDir, {
  defs: PROVIDER_DEFS,
  aliases: MODEL_ALIASES,
  deadIds: DEAD_MODEL_IDS,
  provenance: "@ranch/roost src/data.ts",
});

console.log(`wrote ${jsonPath}`);
console.log(`wrote ${goPath}`);
console.log(`wrote ${rustPath}`);

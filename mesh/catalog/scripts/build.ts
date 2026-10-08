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
import { buildInstalledTauYaml, emitAll } from "../src/codegen.ts";
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

const { jsonPath, goPath, rustPath, tauPath } = await emitAll(outDir, {
  defs: PROVIDER_DEFS,
  aliases: MODEL_ALIASES,
  deadIds: DEAD_MODEL_IDS,
  provenance: "@ranch/roost src/data.ts",
});

console.log(`wrote ${jsonPath}`);
console.log(`wrote ${goPath}`);
console.log(`wrote ${rustPath}`);
console.log(`wrote ${tauPath}`);

async function loadEnvFile(path: string): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  const file = Bun.file(path);
  if (!(await file.exists())) return env;
  for (const line of (await file.text()).split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const eq = s.indexOf("=");
    let k = s.slice(0, eq).trim().replace(/^export\s+/, "");
    let v = s.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k) env[k] = v;
  }
  return env;
}

const installedEnv = {
  ...(await loadEnvFile("/home/toxic/.tau/.env")),
  ...(await loadEnvFile("/home/toxic/.secrets")),
};
const installed = buildInstalledTauYaml(
  {
    defs: PROVIDER_DEFS,
    aliases: MODEL_ALIASES,
    deadIds: DEAD_MODEL_IDS,
    provenance: "@ranch/roost src/data.ts",
  },
  installedEnv,
);
await Bun.write("/home/toxic/.tau/models.yml", installed);
await Bun.write("/home/toxic/estate/config/tau/models.yml", installed);
console.log("synced installed slice to ~/.tau/models.yml and estate/config/tau/models.yml");

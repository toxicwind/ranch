// verify.ts — spark-harvest integrity check.
// Parses profile.json, asserts the corpus layout and the fork's recorded
// identifiers. Local-only: no network, no credentials.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir;
const CORPUS = "/home/toxic/estate/hatch/spark-corpus";
const HARVEST = "/home/toxic/estate/hatch/spark-harvest";

let failures: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log((ok ? "ok  " : "FAIL") + " " + name);
  if (!ok) failures.push(name);
};

const profile = JSON.parse(readFileSync(join(ROOT, "profile.json"), "utf8"));
check("profile.json parses", true);
check("profile name", profile.name === "spark-harvest");
check("model_family Muse Spark", profile.model_family === "Muse Spark");
check("model_org Meta Superintelligence Labs", profile.model_org === "Meta Superintelligence Labs");
check("runtime stays hatch", profile.runtime === "hatch");
check("vm_domain metaaivm.com", profile.vm_domain === "metaaivm.com");
check("google-vm rejected with reasons",
  (profile.rejected_claims ?? []).includes("google-vm") &&
  typeof profile.rejected_claim_reasons?.["google-vm"] === "string");
check("fork recorded", profile.fork === "toxicwind/meta-muse-spark-api");
check("corpus dir exists", existsSync(CORPUS));
const repos = existsSync(CORPUS) ? readdirSync(CORPUS) : [];
for (const r of ["meta-muse-spark-api", "muse-spark", "fork"]) {
  check("corpus has " + r, repos.includes(r));
}
check("harvest.ts exists", existsSync(join(ROOT, "harvest.ts")));
check("task_directive present", typeof profile.task_directive === "string" && profile.task_directive.length > 20);
check("harvest dir exists", existsSync(HARVEST));

if (failures.length) {
  console.error("FAILURES: " + failures.join(", "));
  process.exit(1);
}
console.log("spark-harvest verify: all checks pass");

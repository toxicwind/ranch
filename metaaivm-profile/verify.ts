// verify.ts — metaaivm-profile integrity check.
// Parses profile.json, asserts the corpus layout and the fork's recorded
// identifiers. Local-only: no network, no credentials.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir;
const CORPUS = "/home/toxic/sovereign/hatch/metaaivm-corpus";

let failures: string[] = [];
const check = (name: string, ok: boolean) => {
  console.log((ok ? "ok  " : "FAIL") + " " + name);
  if (!ok) failures.push(name);
};

const profile = JSON.parse(readFileSync(join(ROOT, "profile.json"), "utf8"));
check("profile.json parses", true);
check("profile name", profile.name === "metaaivm-profile");
check("identifiers include hatch-autoloaded", (profile.identifiers ?? []).includes("hatch-autoloaded"));
check("identifiers include ipnext", (profile.identifiers ?? []).includes("ipnext"));
check("vm_domain metaaivm.com", profile.vm_domain === "metaaivm.com");
check("gateway host hatch.metaaivm.com", profile.gateway?.host === "hatch.metaaivm.com");
check("corpus dir exists", existsSync(CORPUS));
const repos = existsSync(CORPUS) ? readdirSync(CORPUS) : [];
for (const r of ["muse-cli", "muse-endo-teardown", "Muse-Chat-MCP", "muse-mcp"]) {
  check("corpus has " + r, repos.includes(r));
}
check("task_directive present", typeof profile.task_directive === "string" && profile.task_directive.length > 20);

if (failures.length) {
  console.error("FAILURES: " + failures.join(", "));
  process.exit(1);
}
console.log("metaaivm-profile verify: all checks pass");

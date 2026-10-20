/**
 * src/apply-scaffold.ts — apply the maximal bun scaffold to estate projects.
 *
 * Options:
 *   --root <dir>      subtree to scan (default /home/toxic/estate/ranch)
 *   --target <dir>    apply ONLY to this project dir (skip LLM detection)
 *   --llm             for each package.json, ask freeinference deepseek v4 flash
 *                     to produce the maximal scaffold patch (default ON for scan)
 *   --yes             write changes without prompting
 *   --dry-run         show what would change, don't write
 *
 * The scaffold template = the committed files in this repo (bunfig.toml,
 * package.json scripts), applied per project, personalized via the LLM when
 * --llm (rides DelendAI lllm-client conventions + freeinference deepseek).
 */

import { completeOver, type ChatMsg } from "./llm";
import { scanPackageJsons } from "./detect-bizarre-package-json";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCAFFOLD_BUNFIG = readFileSync(
  new URL("../bunfig.toml", import.meta.url),
  "utf8",
);
const ROOT =
  process.argv[process.argv.indexOf("--root") + 1] ||
  "/home/toxic/estate/ranch";
const TARGET = process.argv[process.argv.indexOf("--target") + 1] || null;
const USE_LLM = process.argv.includes("--llm");
const DRY_RUN = process.argv.includes("--dry-run");
const YES = process.argv.includes("--yes");

function banner(msg: string) {
  console.log(`\n# ${msg}`);
}

async function main() {
  banner(
    `bun-scaffold apply — root=${ROOT} target=${TARGET ?? "auto"} llm=${USE_LLM} dry=${DRY_RUN}`,
  );

  if (!USE_LLM && !TARGET) {
    console.log(
      "No --llm and no --target; running detection only. Add --llm to scaffold, or --target <dir>.",
    );
    const findings = scanPackageJsons(ROOT);
    console.log(
      `Detected ${findings.length} findings. Re-run with --llm to scaffold them.`,
    );
    return;
  }

  if (TARGET) {
    // Single-project apply: install the scaffold files.
    const pkgPath = existsSync(`${TARGET}/package.json`)
      ? `${TARGET}/package.json`
      : null;
    if (!pkgPath) {
      console.error(`No package.json at ${TARGET}`);
      process.exit(1);
    }
    banner(`applying scaffold to ${TARGET}`);
    const write = (dest: string, body: string) => {
      if (DRY_RUN) {
        console.log(`  [dry-run] would write ${dest} (${body.length} bytes)`);
        return;
      }
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, body);
      console.log(`  wrote ${dest}`);
    };
    write(`${TARGET}/bunfig.toml`, SCAFFOLD_BUNFIG);
    if (USE_LLM) {
      // Let deepseek refine the package.json scripts for this project.
      const current = readFileSync(pkgPath, "utf8");
      const msg: ChatMsg[] = [
        {
          role: "system",
          content:
            "You are a Bun build-scaffold engineer. Given a project's package.json, emit ONLY a JSON patch adding/keeping a maximal script set: validate, typecheck, test, test:coverage, lint. Reply with a single JSON object of scripts ONLY.",
        },
        { role: "user", content: current.slice(0, 4000) },
      ];
      const r = await completeOver([current], () => msg, {}, 1);
      if (r[0].ok && r[0].text) {
        console.log(`  [llm] proposed scripts:\n${r[0].text.slice(0, 800)}`);
      } else {
        console.log(`  [llm] skipped: ${r[0].error ?? "no text"}`);
      }
    }
    return;
  }

  // ROOT-wide: detect then scaffold each via LLM.
  const findings = scanPackageJsons(ROOT);
  banner(`detected ${findings.length} projects needing attention`);
  if (USE_LLM) {
    const projectDirs = [
      ...new Set(findings.map((f) => dirname(f.path))),
    ].slice(0, 40);
    const msgs = projectDirs.map((d): ChatMsg[] => [
      {
        role: "system",
        content:
          "You are applying a maximal Bun scaffold. Given this project dir+pkg, suggest missing scripts/meta. Keep it short.",
      },
      {
        role: "user",
        content: `dir=${d}\n${readFileSync(`${d}/package.json`, "utf8").slice(0, 2000)}`,
      },
    ]);
    const results = await completeOver(projectDirs, (_d, i) => msgs[i], {}, 8);
    for (const r of results) {
      console.log(
        r.ok
          ? `  [llm] ${r.item}:\n${(r.text ?? "").slice(0, 600)}`
          : `  [fail] ${r.item}: ${r.error}`,
      );
    }
  }
}

await main();

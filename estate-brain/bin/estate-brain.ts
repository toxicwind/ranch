#!/usr/bin/env bun

/**
 * estate-brain — the fleet's single source of truth for crew rosters,
 * personas, signing identities, keys, and tokens. One persona = (identity,
 * key, token, role, channels). (squawk-persona is a back-compat alias.)
 *
 * Commands:
 *   list                    profile table
 *   show <p>                detail for one persona
 *   resolve <p>             machine-readable persona (key/token paths)
 *   env <p>                 source-able shell exports
 *   keygen <p>              ensure the persona's signing key exists (0600)
 *   gen-runners [--root R]  regenerate $R/runners.yml from personas.yml
 *   validate                check registry + every key/token path resolves
 *   keys-dir                print the resolved keys dir
 *
 * INTEGRATION WITH SQUAWK
 *   - `bin/squawk --profile <p>` reads $SQUAWK_ROOT/runners.yml. gen-runners
 *     produces it from this registry so deployed profiles always match.
 *   - every HMAC signer honors FLEET_KEYS_DIR; keygen drops keys there.
 *   - `source <(squawk-persona env <p>)` drops a shell into the persona.
 *
 * Secrets are NEVER printed — tokens surface only as paths, never values.
 */

import { join } from "node:path";
import { Command, Option } from "commander";
import pc from "picocolors";
import {
  ensureKey,
  renderRunners,
  runCheckpoint,
  runCorral,
} from "../src/actions";
import { deployAgents, loadAgents } from "../src/agents";
import {
  DEFAULT_KEYS_DIR,
  DEFAULT_SQUAWK_ROOT,
  loadRegistry,
  resolvePersona,
  tokenFile,
} from "../src/registry";

const program = new Command();

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

program
  .name("estate-brain")
  .description("single source of truth for squawk identities, keys, and tokens")
  .version("0.1.0");

program
  .command("list")
  .description("profile table")
  .action(async () => {
    const reg = await loadRegistry();
    console.log(
      `${pad("persona", 14)}${pad("identity", 16)}${pad("key", 12)}${pad("token", 14)}${pad("role", 14)}channels`,
    );
    for (const [name, p] of Object.entries(reg.profiles)) {
      console.log(
        `${pad(name, 14)}${pad(p.identity, 16)}${pad(p.key, 12)}${pad(p.token ?? "-", 14)}${pad(p.role, 14)}[${p.channels.join(", ")}]`,
      );
    }
  });

program
  .command("show")
  .description("detail for one persona")
  .argument("<persona>", "persona name")
  .action(async (name: string) => {
    const reg = await loadRegistry();
    const r = resolvePersona(reg, name);
    console.log(`persona: ${pc.cyan(r.persona)}`);
    console.log(`identity: ${r.identity}`);
    console.log(`key: ${r.key}`);
    console.log(`key_file: ${r.key_file}`);
    console.log(`token_file: ${r.token_file ?? "-"}`);
    console.log(`role: ${r.role}`);
    console.log(`channels: [${r.channels.join(", ")}]`);
  });

program
  .command("resolve")
  .description("machine-readable persona")
  .argument("<persona>", "persona name")
  .action(async (name: string) => {
    const reg = await loadRegistry();
    console.log(JSON.stringify(resolvePersona(reg, name), null, 2));
  });

program
  .command("env")
  .description("source-able shell exports for a persona")
  .argument("<persona>", "persona name")
  .action(async (name: string) => {
    const reg = await loadRegistry();
    const r = resolvePersona(reg, name);
    const out = [
      `export FLEET_KEYS_DIR=${DEFAULT_KEYS_DIR}`,
      `export SQUAWK_SENDER=${r.identity}`,
      `export SQUAWK_PERSONA_KEY=${r.key_file}`,
    ];
    if (r.token_file) out.push(`export SQUAWK_PERSONA_TOKEN=${r.token_file}`);
    console.log(out.join("\n"));
  });

program
  .command("keygen")
  .description("ensure persona signing key exists (0600)")
  .argument("<persona>", "persona name")
  .action(async (name: string) => {
    const reg = await loadRegistry();
    const r = resolvePersona(reg, name);
    console.log(await ensureKey(r.key_file));
  });

program
  .command("gen-runners")
  .description("regenerate $SQUAWK_ROOT/runners.yml from personas.yml")
  .addOption(
    new Option("--root <path>", "squawk root").default(DEFAULT_SQUAWK_ROOT),
  )
  .action(async (opts: { root: string }) => {
    const reg = await loadRegistry();
    const path = join(opts.root, "runners.yml");
    await Bun.write(path, renderRunners(reg));
    console.log(`wrote ${path}`);
    console.log(`  profiles: ${Object.keys(reg.profiles).join(", ")}`);
  });

program
  .command("validate")
  .description("check registry + every key/token path resolves")
  .addOption(
    new Option("--keys-dir <path>", "override keys dir").default(
      DEFAULT_KEYS_DIR,
    ),
  )
  .action(async (opts: { keysDir: string }) => {
    const reg = await loadRegistry();
    let fail = 0;
    const lines: string[] = [];
    for (const [name, p] of Object.entries(reg.profiles)) {
      const kf = join(opts.keysDir, `${p.key}.key`);
      // eslint-disable-next-line no-await-in-loop
      const keyOk = await Bun.file(kf).exists();
      for (const ch of p.channels) {
        if (!/^[a-z0-9_-]+$/.test(ch)) {
          lines.push(`${pc.red("✗")} ${name}: bad channel '${ch}'`);
          fail++;
        }
      }
      if (p.token) {
        const tf = tokenFile(reg, p.token);
        const tokOk = tf ? await Bun.file(tf).exists() : false;
        if (!tokOk) {
          lines.push(`${pc.red("✗")} ${name}: token '${p.token}' missing`);
          fail++;
        }
      }
      lines.push(
        `${keyOk ? pc.green("✓") : pc.yellow("~")} ${name}: key ${keyOk ? "present" : "MISSING (run keygen)"}`,
      );
    }
    console.log(lines.join("\n"));
    console.log(
      fail ? pc.red(`\n${fail} problem(s)`) : pc.green("\nall checks passed"),
    );
    process.exit(fail ? 1 : 0);
  });

program
  .command("keys-dir")
  .description("print the resolved keys dir")
  .action(() => console.log(DEFAULT_KEYS_DIR));

program
  .command("agents")
  .description("list estate/Rig agent configs, bound to personas")
  .action(async () => {
    const reg = await loadRegistry();
    const agents = await loadAgents(reg);
    console.log(
      `${pad("agent", 18)}${pad("persona", 16)}${pad("identity", 16)}sigil\trole`,
    );
    for (const a of agents) {
      console.log(
        `${pad(a.name, 18)}${pad(a.persona ?? "-", 16)}${pad(a.identity ?? "-", 16)}${a.sigil || "-"}\t${(a.role || "").slice(0, 40)}`,
      );
    }
    console.log(`\n${agents.length} agent configs in agents/`);
  });

program
  .command("deploy")
  .description("copy canonical agent.toml to the live OpenFang agents dir")
  .addOption(
    new Option("--live-dir <path>", "OpenFang live agents dir").default(
      join(process.env.HOME ?? "/home/toxic", ".openfang", "agents"),
    ),
  )
  .action(async (opts: { liveDir: string }) => {
    const reg = await loadRegistry();
    const agents = await loadAgents(reg);
    const written = await deployAgents(agents, opts.liveDir);
    console.log(
      written.length
        ? `deployed ${written.length} agent.toml -> ${opts.liveDir}`
        : `no agent.toml found to deploy (${written.length})`,
    );
    for (const w of written) console.log(`  ${w}`);
  });

program
  .command("corral")
  .description("run a Corral orchestration command under a persona identity")
  .argument("<persona>", "persona to act as")
  .argument("[args...]", "corral command and args")
  .addOption(
    new Option("--corral-bin <path>", "corral CLI").default(
      process.env.CORRAL_BIN ?? "corral",
    ),
  )
  .action(
    async (persona: string, args: string[], opts: { corralBin: string }) => {
      const reg = await loadRegistry();
      const { status, stdout, stderr } = await runCorral(
        reg,
        persona,
        DEFAULT_KEYS_DIR,
        opts.corralBin,
        args,
      );
      process.stdout.write(stdout);
      process.stderr.write(stderr);
      process.exit(status);
    },
  );

program
  .command("checkpoint")
  .description("DelendAI shared-checkout-merge checkpoint + push as a persona")
  .argument("<persona>", "persona to act as")
  .requiredOption("-m, --message <msg>", "commit message")
  .addOption(
    new Option("--delend-bin <path>", "delend-quick helper").default(
      process.env.DELEND_BIN ?? "/home/toxic/estate/bin/delend-quick",
    ),
  )
  .action(
    async (persona: string, opts: { message: string; delendBin: string }) => {
      const reg = await loadRegistry();
      const { status, stdout, stderr } = await runCheckpoint(
        reg,
        persona,
        DEFAULT_KEYS_DIR,
        opts.delendBin,
        opts.message,
      );
      process.stdout.write(stdout);
      process.stderr.write(stderr);
      process.exit(status);
    },
  );

program.parse(process.argv);

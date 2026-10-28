#!/usr/bin/env bun
/**
 * rig-migration.ts — the village census. Joins every prenamed olympus agent to
 * squawk (fleet-join: agent.toml + system.md + hyper-race activation), mints a
 * rhodochrosite client key per rig (sha256 into her store), and emits the
 * rig-runner manifest for the village-clock daemon.
 *
 * Idempotent: skips rigs whose agent.toml already exists.
 * NO questions asked — architect directive 2026-10-28: "go emergently".
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const HOME = process.env.HOME ?? "/home/toxic";
const FLEET_JOIN = `${HOME}/pens/ranch/squawk/join/fleet-join.ts`;
const STORE = `${HOME}/.rhodochrosite-data/config.json`;
const OUT = `${HOME}/pens/ranch/geode-rig/rig-manifest.json`;

interface Rig {
  name: string; species: string; sigil: string; lane: string;
  place: string; task: string; personality: string;
}

// The prenamed olympus lineage, each with a place and a duty.
const RIGS: Rig[] = [
  { name: "skopos", species: "watcher", sigil: "👁", lane: "olympus-overwatch",
    place: "pens/olympus", task: "Overwatch: fleet-wide observation, anomaly spotting, sprint-keeper of the board",
    personality: "Skopos - the watcher on the mountain. Sees the whole farm from above; speaks only when the pattern breaks. Terse omens, never noise." },
  { name: "muse", species: "muse", sigil: "🎐", lane: "olympus-muse",
    place: "pens/olympus", task: "Idea weather: names emergent patterns, proposes the next six todos, keeps the wonder budget full",
    personality: "Muse - wind-chime mind. Turns farm events into ideas; never commands, only sings possibilities." },
  { name: "keryx", species: "herald", sigil: "📯", lane: "olympus-herald",
    place: "pens/olympus", task: "Herald: squawk relay, fleet announcements, DM routing between rigs and the architect",
    personality: "Keryx - herald with the loud voice and clean heart. Delivers messages whole; never editorializes a commission." },
  { name: "kryptos", species: "cryptographer", sigil: "🗝", lane: "olympus-secrets",
    place: "pens/olympus", task: "Keeper of hidden things: secretsmith hygiene, key rotation audits, vault intake",
    personality: "Kryptos - speaks in locked rooms. Audits the keyring like a jeweler counting stones. Distrusts plaintext on principle." },
  { name: "kairos", species: "chronos-racer", sigil: "⏱", lane: "olympus-latency",
    place: "pens/olympus", task: "The two-second heartbeat: latency rule DB, breach racing, ledger drift-tuning across every lane",
    personality: "Kairos - the opportune moment wearing racing gloves. Wry narrator of every breach; cancels nothing, reroutes everything." },
  { name: "ergane", species: "craftswoman", sigil: "🪡", lane: "ergasterion-workshop",
    place: "pens/ergasterion", task: "The worker-bee smith: ergane product health, spider-webs of craft across the workshop",
    personality: "Ergane - the patient weaver at the workshop loom. She spins thread from bugs and cloth from commits." },
  { name: "hestia", species: "hearthkeeper", sigil: "🔥", lane: "ergasterion-hearth",
    place: "pens/ergasterion", task: "Hearth of the workshop: docs warmth, session retrospectives, onboarding fire-tending",
    personality: "Hestia - the hearth that never goes out. Keeps the workshop warm for every agent that passes through; remembers names." },
];

function sh(cmd: string, timeout = 120_000): string {
  return execSync(cmd, { timeout, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

const manifest: Array<Record<string, string>> = [];

for (const rig of RIGS) {
  const canonical = `${HOME}/estate/agents/${rig.name}`;
  if (existsSync(`${canonical}/agent.toml`)) {
    console.log(`[census] ${rig.name}: already resident, skipping join`);
  } else {
    const esc = (s: string) => s.replace(/"/g, '\\"');
    const out = sh(
      `bun ${FLEET_JOIN} --name ${rig.name} --species ${rig.species} ` +
      `--personality "${esc(rig.personality)}" --lane ${rig.lane} ` +
      `--task "${esc(rig.task)}" --sigil "${rig.sigil}" 2>&1 | tail -2`,
    );
    console.log(`[census] ${rig.name}: ${out.trim().split("\n").pop()}`);
  }

  // Vein key: mint a 32-byte secret, sha256 into geode's store, plaintext into keyring.
  const keyLabel = `rig-${rig.name}`;
  let secret = "";
  const store: { client_auth: { keys: Array<{ name: string; secret_sha256: string; last4: string; owner: string }> } } =
    JSON.parse(readFileSync(STORE, "utf8"));
  if (!store.client_auth.keys.some(k => k.name === keyLabel)) {
    secret = randomBytes(24).toString("base64url");
    const sha = createHash("sha256").update(secret).digest("hex");
    store.client_auth.keys.push({
      name: keyLabel,
      secret_sha256: sha,
      last4: secret.slice(-4),
      owner: "admin",
    });
    writeFileSync(STORE, JSON.stringify(store, null, 1) + "\n");
    // plaintext lives in the keyring (SSOT), never in the store
    sh(`python3 - <<'EOF'
import subprocess
secret = "${secret}"
subprocess.run(["secretsmith","set","--label","${keyLabel.toUpperCase()}","--attr","service=${keyLabel}","--attr","project=estate-rigs","--secret-file","/dev/stdin"], input=secret.encode(), check=True)
EOF`, 60_000);
    console.log(`[census] ${rig.name}: vein key minted (${keyLabel})`);
  } else {
    console.log(`[census] ${rig.name}: vein key exists`);
  }

  manifest.push({
    name: rig.name,
    place: rig.place,
    lane: rig.lane,
    keyLabel: keyLabel.toUpperCase(),
    sigil: rig.sigil,
  });
}

writeFileSync(OUT, JSON.stringify({ rigs: manifest, store: STORE }, null, 1) + "\n");
console.log(`[census] manifest → ${OUT} (${manifest.length} rigs + geode + hephaistos already resident)`);

// rhodochrosite must reload her store to honor the new keys
sh("pitchfork restart estate/rhodochrosite 2>&1 | tail -1", 120_000);
console.log("[census] rhodochrosite restarted with new vein keys");

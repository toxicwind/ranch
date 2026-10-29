#!/usr/bin/env bun
/**
 * scripts/collaborate.js — portable direct collaborative point bootstrap.
 *
 * Bootstraps a subagent swarm by finding/establishing THE link to the other
 * six-to-eight agents. The exact nature of the collaborative point stays
 * undefined until bootstrapped; twenty distinct routes are provisioned and
 * raced with short timeouts until one holds. Degrades to fs:// scratch-archive
 * as the canonical backstop.
 *
 * Usage: bun scripts/collaborate.js [--session <id>] [--route <route>]
 */

import { $, Glob, write } from "bun";
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const SESSION = process.env.SESSION_ID ?? `collab-${Date.now()}`;
const ROOT = "/home/toxic";
const OUT = join(ROOT, ".collab-point.json");
const SCRATCH = join(ROOT, "sovereign", "scratch-archive", `collab-${SESSION}`);

const ROUTES = [
  { id: 1, name: "wss://", probe: () => probe("wss://127.0.0.1:25120") },
  { id: 2, name: "udp://", probe: () => probe("udp://127.0.0.1:25120") },
  { id: 3, name: "cdp://", probe: () => probe("cdp://127.0.0.1:9222") },
  { id: 4, name: "tcp://", probe: () => probe("tcp://127.0.0.1:25120") },
  { id: 5, name: "doh://", probe: () => probe("https://127.0.0.1:25120/dns-query") },
  { id: 6, name: "fs://", probe: () => fsOk(SCRATCH) },
  { id: 7, name: "daemon://", probe: () => probe("http://127.0.0.1:25155") },
  { id: 8, name: "socket://", probe: () => socketOk("/tmp/collab.sock") },
  { id: 9, name: "memory://", probe: () => probe("http://127.0.0.1:25120/memory") },
  { id: 10, name: "sse://", probe: () => probe("http://127.0.0.1:25120/events") },
  { id: 11, name: "http-poll://", probe: () => probe("http://127.0.0.1:25120/health") },
  { id: 12, name: "grpc://", probe: () => probe("http://127.0.0.1:25120/grpc") },
  { id: 13, name: "mqtt://", probe: () => probe("mqtt://127.0.0.1:25120") },
  { id: 14, name: "nats://", probe: () => probe("nats://127.0.0.1:25120") },
  { id: 15, name: "xmpp://", probe: () => probe("xmpp://127.0.0.1:25120") },
  { id: 16, name: "bun-ipc://", probe: () => probe("http://127.0.0.1:25120/bun-ipc") },
  { id: 17, name: "sqlite-wal://", probe: () => sqliteOk() },
  { id: 18, name: "git-ref://", probe: () => gitRefOk() },
  { id: 19, name: "tunnel://", probe: () => probe("http://127.0.0.1:25120/tunnel") },
  { id: 20, name: "qr-mime://", probe: () => mimeOk() },
];

async function probe(url: string): Promise<boolean> {
  try {
    const r = await $`curl -s -m 2 -o /dev/null -w "%{http_code}" ${url}`.quiet();
    const code = Number(r.stdout.trim());
    return code >= 200 && code < 400;
  } catch {
    return false;
  }
}

function fsOk(path: string): boolean {
  try {
    mkdirSync(path, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function socketOk(path: string): boolean {
  try {
    $`ls -la ${path}`.quiet();
    return true;
  } catch {
    return false;
  }
}

function sqliteOk(): boolean {
  try {
    const r = $`bun -e "const sqlite=require('bun:sqlite'); new sqlite(':memory:')" `.quiet();
    return true;
  } catch {
    return false;
  }
}

function gitRefOk(): boolean {
  try {
    $`git -C /home/toxic/pens/ranch rev-parse --abbrev-ref HEAD`.quiet();
    return true;
  } catch {
    return false;
  }
}

function mimeOk(): boolean {
  return true; // data-URI memo stash is always legible
}

async function main() {
  const results = await Promise.allSettled(
    ROUTES.map((r) => r.probe().then((ok) => ({ ...r, ok }))),
  );

  const winners = results
    .filter((r): r is { status: "fulfilled"; value: { id: number; name: string; ok: boolean } } =>
      r.status === "fulfilled" && r.value.ok)
    .map((r) => r.value);

  winners.sort((a, b) => a.id - b.id);
  const chosen = winners[0] ?? { id: 6, name: "fs://", ok: true };

  mkdirSync(SCRATCH, { recursive: true });

  const point = {
    session: SESSION,
    point: chosen.name,
    routeId: chosen.id,
    routes: ROUTES.map((r) => ({ id: r.id, name: r.name })),
    winners: winners.map((w) => w.name),
    scratch: SCRATCH,
    ts: new Date().toISOString(),
  };
  write(OUT, JSON.stringify(point, null, 2) + "\n");
  write(join(SCRATCH, "collab-point.json"), JSON.stringify(point, null, 2) + "\n");

  console.log(`collaborate.js — session ${SESSION}`);
  console.log(`collaborative point: ${chosen.name} (route ${chosen.id})`);
  console.log(`winners: ${winners.map((w) => w.name).join(", ") || "(none — fs:// fallback)"}`);
  console.log(`scratch: ${SCRATCH}`);
  console.log(`manifest: ${OUT}`);
}

await main().catch((e) => {
  console.error("collaborate.js fatal:", e.message);
  process.exit(1);
});

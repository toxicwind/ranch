#!/usr/bin/env bun
/**
 * switchboard — master skill router (MCP server, stdio, newline-delimited JSON-RPC)
 *
 * The central capability plane for the estate:
 *  - skill_search / skill_get : index every SKILL.md (name + description
 *    frontmatter) across the estate's skill dirs; route agent intents to skills.
 *  - infra_* : the Portainer-replacement slice — container/stack management an
 *    OpenFang agent drives through MCP instead of a dashboard.
 *
 * Protocol: each stdin line is one JSON-RPC 2.0 request; each stdout line is
 * one response. Handles: initialize, notifications/initialized, tools/list,
 * tools/call. (Borrowed framing from hashline's MCP server.)
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SKILL_DIRS = [
  "/home/toxic/sovereign/skills",
  "/home/toxic/hatch/skills",
].filter((d) => existsSync(d));

const STACKS_ROOT = "/home/toxic/switchboard/stacks";
mkdirSync(STACKS_ROOT, { recursive: true });

type Skill = { name: string; description: string; path: string };

function loadSkills(): Skill[] {
  const out: Skill[] = [];
  for (const dir of SKILL_DIRS) {
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const e of entries) {
      const p = join(dir, e, "SKILL.md");
      if (!existsSync(p)) continue;
      try {
        const text = readFileSync(p, "utf8");
        const m = text.match(/^---\n([\s\S]*?)\n---/);
        if (!m) continue;
        const fm = m[1];
        const name = (fm.match(/^name:\s*(.+)$/m)?.[1] ?? e).trim();
        const dm = fm.match(/^description:\s*>?\s*\n?([\s\S]*)$/m);
        const desc = (dm?.[1] ?? "").split("\n").map((l) => l.replace(/^\s+/, "")).join(" ").trim().slice(0, 500);
        out.push({ name, description: desc, path: p });
      } catch { /* skip unreadable */ }
    }
  }
  return out;
}

let SKILLS: Skill[] = loadSkills();

async function sh(cmd: string[], opts: { timeoutMs?: number } = {}): Promise<{ ok: boolean; out: string }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => { try { proc.kill(); } catch {} }, opts.timeoutMs ?? 30000);
  const [so, se, code] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  clearTimeout(timer);
  return { ok: code === 0, out: (so + se).trim().slice(0, 8000) };
}

const TOOLS = [
  {
    name: "skill_search",
    description: "Search the estate's skill index by intent keywords. Returns ranked skills (name, description, path). This is the master skill router: agents ask what capability fits, switchboard answers.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "skill_get",
    description: "Return the full SKILL.md for a named skill.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "infra_containers",
    description: "List all docker containers (name, image, status). Replaces Portainer's container list.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "infra_deploy",
    description: "Deploy a stack: writes docker-compose.yml under switchboard/stacks/<name>/ and runs `docker compose up -d`. Replaces Portainer webhook deploys.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, compose_yaml: { type: "string" } },
      required: ["name", "compose_yaml"],
    },
  },
  {
    name: "infra_logs",
    description: "Tail logs for a container.",
    inputSchema: {
      type: "object",
      properties: { container: { type: "string" }, tail: { type: "number" } },
      required: ["container"],
    },
  },
  {
    name: "infra_down",
    description: "Tear down a switchboard-managed stack (rollback path).",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
];

function scoreSkill(q: string, s: Skill): number {
  const hay = (s.name + " " + s.description).toLowerCase();
  let score = 0;
  for (const tok of q.toLowerCase().split(/\s+/)) {
    if (s.name.toLowerCase().includes(tok)) score += 3;
    else if (hay.includes(tok)) score += 1;
  }
  return score;
}

async function callTool(name: string, args: any): Promise<any> {
  switch (name) {
    case "skill_search": {
      const q = String(args.query ?? "");
      const ranked = SKILLS.map((s) => ({ s, score: scoreSkill(q, s) }))
        .filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 10)
        .map((r) => ({ name: r.s.name, description: r.s.description, path: r.s.path, score: r.score }));
      return { query: q, count: ranked.length, skills: ranked };
    }
    case "skill_get": {
      const s = SKILLS.find((x) => x.name === args.name);
      if (!s) throw new Error(`skill not found: ${args.name}`);
      return { name: s.name, path: s.path, content: readFileSync(s.path, "utf8").slice(0, 12000) };
    }
    case "infra_containers": {
      const r = await sh(["docker", "ps", "-a", "--format", "{{.Names}}|{{.Image}}|{{.Status}}"]);
      return { ok: r.ok, containers: r.out.split("\n").filter(Boolean) };
    }
    case "infra_deploy": {
      const sname = String(args.name).replace(/[^a-z0-9-_]/gi, "");
      if (!sname) throw new Error("bad stack name");
      const dir = join(STACKS_ROOT, sname);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "docker-compose.yml"), String(args.compose_yaml));
      const r = await sh(["docker", "compose", "-f", join(dir, "docker-compose.yml"), "up", "-d"], { timeoutMs: 120000 });
      return { ok: r.ok, stack: sname, dir, output: r.out };
    }
    case "infra_logs": {
      const r = await sh(["docker", "logs", "--tail", String(args.tail ?? 50), String(args.container)]);
      return { ok: r.ok, logs: r.out };
    }
    case "infra_down": {
      const sname = String(args.name).replace(/[^a-z0-9-_]/gi, "");
      const dir = join(STACKS_ROOT, sname);
      if (!existsSync(join(dir, "docker-compose.yml"))) throw new Error(`unknown stack: ${sname}`);
      const r = await sh(["docker", "compose", "-f", join(dir, "docker-compose.yml"), "down"], { timeoutMs: 60000 });
      return { ok: r.ok, output: r.out };
    }
    default: throw new Error(`unknown tool: ${name}`);
  }
}

async function main() {
  const rl = (await import("node:readline")).createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    let req: any;
    try { req = JSON.parse(t); } catch { continue; }
    const respond = (result: any) =>
      console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id ?? null, result }));
    const fail = (msg: string) =>
      console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id ?? null, error: { code: -32000, message: msg } }));
    try {
      if (req.method === "initialize") {
        respond({
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "switchboard", version: "0.1.0" },
        });
      } else if (req.method === "notifications/initialized") {
        // no-op
      } else if (req.method === "tools/list") {
        respond({ tools: TOOLS });
      } else if (req.method === "tools/call") {
        const out = await callTool(req.params?.name, req.params?.arguments ?? {});
        respond({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } else {
        fail(`unknown method: ${req.method}`);
      }
    } catch (e: any) {
      fail(e?.message ?? String(e));
    }
  }
}

main();

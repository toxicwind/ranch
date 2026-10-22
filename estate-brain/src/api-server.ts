// estate-brain-api — the fleet brain as a small local HTTP API (Bun).
// Exposes the same surface as the CLI + MCP server so agents and dashboards
// can query personas, agents, roster, and trigger pipeline actions.
//
// Endpoints (JSON):
//   GET  /health                  liveness
//   GET  /personas                all personas (identity/key/role/channels)
//   GET  /personas/:name          one persona (resolve key/token paths)
//   GET  /agents                  rig agent configs bound to personas
//   GET  /roster                  per-crew ownership records (name + status)
//   GET  /specs                   identity-specs (keygen/rotation/verification)
//   POST /keygen   {persona}      ensure signing key
//   POST /gen-runners [root]      regenerate runners.yml
//   POST /deploy   [live_dir]     mirror agent.toml to OpenFang run dir
//   POST /corral   {persona,args} run corral as persona
//   POST /checkpoint {persona,message}  delend checkpoint as persona
//
// Mutating endpoints require `confirm: true`. Secrets are never returned —
// only key/token PATHS. Listens on 127.0.0.1 by default.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { runCheckpoint, runCorral } from "./actions";
import { deployAgents, loadAgents } from "./agents";
import { DEFAULT_KEYS_DIR, loadRegistry, resolvePersona } from "./registry";

const PORT = Number(process.env.ESTATE_BRAIN_PORT ?? 25228);
const HELD = Number(process.env.ESTATE_BRAIN_HELD ?? 0); // 0 = all interfaces resp. loopback-if-empty

export function getRoutes() {
  return {
    async health() {
      return { ok: true, ts: Date.now() };
    },
    async personas() {
      const reg = await loadRegistry();
      return Object.fromEntries(
        Object.entries(reg.profiles).map(([n, p]) => [
          n,
          {
            identity: p.identity,
            role: p.role,
            token: p.token ?? null,
            channels: p.channels,
          },
        ]),
      );
    },
    async persona(name: string) {
      const reg = await loadRegistry();
      const r = resolvePersona(reg, name);
      return r;
    },
    async agents() {
      const reg = await loadRegistry();
      return loadAgents(reg);
    },
    async roster() {
      // Per-crew ownership record: name -> frontmatter status/owner/order.
      const dir = new URL("../roster", import.meta.url).pathname;
      const out: Record<string, string> = {};
      const names = await readdir(dir).catch(() => [] as string[]);
      for (const n of (names ?? []) as string[]) {
        if (!n.endsWith(".md")) continue;
        const raw = (await Bun.file(join(dir, n)).text()) || "";
        const status = raw.match(/^status:\s*'(.*)'/m)?.[1] ?? "";
        out[n.replace(/\.md$/, "")] = status;
      }
      return out;
    },
    async specs() {
      const dir = new URL("../docs/identity-specs", import.meta.url).pathname;
      const names = await readdir(dir).catch(() => [] as string[]);
      return names;
    },
  };
}

export async function keygen(
  persona: string,
  confirm: boolean,
): Promise<object> {
  if (!confirm) return { error: "refused: confirm:true required" };
  const reg = await loadRegistry();
  const r = resolvePersona(reg, persona);
  const { ensureKey } = await import("./actions");
  const msg = await ensureKey(r.key_file);
  return { ok: true, msg, key_file: r.key_file };
}

export async function genRunners(
  confirm: boolean,
  root?: string,
): Promise<object> {
  if (!confirm) return { error: "refused: confirm:true required" };
  const reg = await loadRegistry();
  const { renderRunners } = await import("./actions");
  const target =
    root ??
    join(process.env.HOME ?? "/home/toxic", ".fleet-bus", "squawk-root");
  const path = join(target, "runners.yml");
  await Bun.write(path, renderRunners(reg));
  return { ok: true, wrote: path, profiles: Object.keys(reg.profiles).length };
}

export async function deploy(
  confirm: boolean,
  liveDir?: string,
): Promise<object> {
  if (!confirm) return { error: "refused: confirm:true required" };
  const reg = await loadRegistry();
  const agents = await loadAgents(reg);
  const target =
    liveDir ?? join(process.env.HOME ?? "/home/toxic", ".openfang", "agents");
  const written = await deployAgents(agents, target);
  return { ok: true, deployed: written.length, target };
}

export async function corral(
  persona: string,
  args: string[],
  confirm: boolean,
): Promise<object> {
  if (!confirm) return { error: "refused: confirm:true required" };
  const reg = await loadRegistry();
  const r = await runCorral(reg, persona, DEFAULT_KEYS_DIR, "corral", args);
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
  };
}

export async function checkpoint(
  persona: string,
  message: string,
  confirm: boolean,
): Promise<object> {
  if (!confirm) return { error: "refused: confirm:true required" };
  const reg = await loadRegistry();
  const r = await runCheckpoint(
    reg,
    persona,
    DEFAULT_KEYS_DIR,
    process.env.DELEND_BIN ?? "/home/toxic/estate/bin/delend-quick",
    message,
  );
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
  };
}

export const server = Bun.serve({
  port: PORT,
  hostname: HELD ? "0.0.0.0" : "127.0.0.1",
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method;
    const json = (o: object, code = 200) =>
      new Response(JSON.stringify(o), {
        status: code,
        headers: { "content-type": "application/json" },
      });

    const routes = getRoutes();
    try {
      if (method === "GET" && path === "/health")
        return json(await routes.health());
      if (method === "GET" && path === "/personas")
        return json(await routes.personas());
      const pmatch = path.match(/^\/personas\/([^/]+)$/);
      if (method === "GET" && pmatch)
        return json(await routes.persona(decodeURIComponent(pmatch[1])));
      if (method === "GET" && path === "/agents")
        return json(await routes.agents());
      if (method === "GET" && path === "/roster")
        return json(await routes.roster());
      if (method === "GET" && path === "/specs")
        return json(await routes.specs());

      if (method === "POST") {
        const body: Record<string, unknown> = req.body
          ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
          : {};
        if (path === "/keygen")
          return json(
            await keygen(String(body.persona ?? ""), body.confirm === true),
          );
        if (path === "/gen-runners")
          return json(
            await genRunners(
              body.confirm === true,
              typeof body.root === "string" ? body.root : undefined,
            ),
          );
        if (path === "/deploy")
          return json(
            await deploy(
              body.confirm === true,
              typeof body.live_dir === "string" ? body.live_dir : undefined,
            ),
          );
        if (path === "/corral")
          return json(
            await corral(
              String(body.persona ?? ""),
              Array.isArray(body.args) ? body.args.map(String) : [],
              body.confirm === true,
            ),
          );
        if (path === "/checkpoint")
          return json(
            await checkpoint(
              String(body.persona ?? ""),
              String(body.message ?? ""),
              body.confirm === true,
            ),
          );
      }
      return json({ error: "not found" }, 404);
    } catch (e: unknown) {
      return json({ error: String((e as Error)?.message ?? e) }, 500);
    }
  },
});

if (import.meta.main) {
  console.log(`estate-brain-api listening on http://127.0.0.1:${server.port}`);
}

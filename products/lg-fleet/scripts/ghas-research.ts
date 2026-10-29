#!/usr/bin/env bun
/**
 * ghas-research.ts — OSINT via verified ghas MCP (:25113).
 * Full MCP handshake: initialize -> notifications/initialized -> tools/call.
 * Finds what nuvio/IPTV forks MISS vs Netflix-Max TV UX; candidate repos to vendor.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const BASE = "http://127.0.0.1:25113/mcp";
const OUT = "/tmp/ghas-research";
mkdirSync(OUT, { recursive: true });

let sid: string | undefined;
let initialized = false;

function raw(method: string, params?: Record<string, unknown>, notify = false): string {
  const id = notify ? undefined : Date.now();
  const headers = [
    "Content-Type: application/json",
    "Accept: application/json, text/event-stream",
  ];
  if (sid) headers.push(`Mcp-Session-Id: ${sid}`);
  const payload = JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, ...(params ? { params } : {}) });
  const args = ["curl", "-s", "-m", "30", "-D", `${OUT}/headers.txt`, "-X", "POST", BASE];
  for (const h of headers) args.push("-H", h);
  args.push("-d", payload);
  const r = spawnSync("curl", args);
  const out = r.stdout.toString("utf8");
  if (!sid) {
    const h = readFileSync(`${OUT}/headers.txt`, "utf8");
    const m = h.match(/Mcp-Session-Id: ([^\r\n]+)/i);
    if (m) sid = m[1].trim();
  }
  return out;
}

function callTool(name: string, args: Record<string, unknown>): string {
  return raw("tools/call", { name, arguments: args });
}

function save(tag: string, body: string) {
  writeFileSync(join(OUT, `${tag}.json`), body, "utf8");
}

function main() {
  // 1) initialize
  const init = raw("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: { roots: { listChanged: false } },
    clientInfo: { name: "ghas-research", version: "1.0.0" },
  });
  console.log("initialize:", init.slice(0, 300));

  // 2) notifications/initialized
  const notif = raw("notifications/initialized", {}, true);
  console.log("initialized ack:", notif.slice(0, 200));

  // 3) tools/list
  const toolsOut = raw("tools/list");
  let tools: string[] = [];
  try { tools = (JSON.parse(toolsOut).result?.tools ?? []).map((t: any) => t.name); }
  catch { console.log("tools/list raw:", toolsOut.slice(0, 500)); }
  console.log("ghas tools:", tools.join(", "));

  const codeSearch = tools.includes("ghas_search_code");
  const repoSearch = tools.includes("ghas_search_repositories");

  const searches: [string, Record<string, unknown>][] = [
    ["netflix-webos-tv-ui", { query: "netflix webOS TV UI html5 spatial grid hero focus", perPage: 10, categories: ["repositories"] }],
    ["nuvio-fork-lineage", { query: "nuvio webos iptv fork stremio", perPage: 10, categories: ["repositories"] }],
    ["nuvio-missing-features", { query: "nuvio iptv webos epg rails hero billboard focus engine", perPage: 10, categories: ["code"] }],
    ["stremio-webos-tv", { query: "stremio webos tv app spatial grid netflix aesthetic", perPage: 10, categories: ["repositories"] }],
    ["tizen-netflix-ui", { query: "tizen netflix html5 tv ui focus grid hero", perPage: 10, categories: ["repositories"] }],
  ];

  for (const [tag, params] of searches) {
    let out = "";
    if (codeSearch) out = callTool("ghas_search_code", params);
    else if (repoSearch) out = callTool("ghas_search_repositories", params);
    else out = JSON.stringify({ error: "no search tool", tools });
    save(tag, out);
    console.log(`\n=== ${tag} ===`);
    try { console.log(JSON.stringify(JSON.parse(out), null, 2).slice(0, 2500)); }
    catch { console.log(out.slice(0, 800)); }
  }
  console.log(`\nartifacts in ${OUT}`);
}

main().catch((e) => { console.error("fatal:", e.message); process.exit(1); });

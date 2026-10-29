#!/usr/bin/env bun
/**
 * ghas-fetch.ts — fetch full file contents via ghas MCP (:25113).
 * Full handshake per process: initialize -> tools/call.
 * Usage: bun ghas-fetch.ts <repo> <path> [outfile]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const BASE = "http://127.0.0.1:25113/mcp";
const [repo, path, outfile = "/tmp/ghas-fetch.out"] = process.argv.slice(2);
if (!repo || !path) { console.error("usage: bun ghas-fetch.ts <repo> <path> [out]"); process.exit(2); }

let sid: string | undefined;
function raw(method: string, params: Record<string, unknown> = {}): string {
  const id = Date.now();
  const headers = ["Content-Type: application/json", "Accept: application/json, text/event-stream"];
  if (sid) headers.push(`Mcp-Session-Id: ${sid}`);
  const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  const args = ["curl", "-s", "-m", "30", "-D", "/tmp/ghas-headers.txt", "-X", "POST", BASE];
  for (const h of headers) args.push("-H", h);
  args.push("-d", payload);
  const r = spawnSync("curl", args);
  const out = r.stdout.toString("utf8");
  if (!sid) {
    try {
      const h = readFileSync("/tmp/ghas-headers.txt", "utf8");
      const m = h.match(/Mcp-Session-Id: ([^\r\n]+)/i);
      if (m) sid = m[1].trim();
    } catch {}
  }
  return out;
}

raw("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "ghas-fetch", version: "1.0.0" } });
raw("notifications/initialized", {}, true);

const out = raw("tools/call", { name: "ghas_get_file_contents", arguments: { repo, path } });
try {
  const d = JSON.parse(out);
  const text = d.result?.content?.[0]?.text ?? JSON.stringify(d, null, 2);
  writeFileSync(outfile, text, "utf8");
  console.log(`fetched ${repo}/${path} -> ${outfile} (${text.length} chars)`);
  console.log(text.slice(0, 2000));
} catch {
  console.log("raw:", out.slice(0, 1500));
}

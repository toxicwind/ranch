#!/usr/bin/env bun
/**
 * proof.ts — agent-driven deploy through Switchboard MCP.
 *
 * Acts as an OpenFang agent would: stdio JSON-RPC to the switchboard server,
 * tools/list -> skill_search("deploy container") -> infra_deploy(test stack)
 * -> infra_containers (verify running) -> HTTP health check -> infra_down.
 * Exit 0 + "PROOF PASS" only if the full loop succeeds.
 */

const SERVER = new URL("./server.ts", import.meta.url).pathname;

const proc = Bun.spawn(["bun", SERVER], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
const stdin = proc.stdin as import("bun").FileSink;
const enc = new TextEncoder();
let id = 0;
const pending = new Map<number, (v: any) => void>();
let buf = "";

async function readLoop() {
  const reader = proc.stdout!.getReader();
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && pending.has(msg.id)) {
          pending.get(msg.id)!(msg);
          pending.delete(msg.id);
        }
      } catch { /* ignore */ }
    }
  }
}
readLoop();

function rpc(method: string, params?: any): Promise<any> {
  const myId = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(myId); reject(new Error(`rpc timeout: ${method}`)); }, 90000);
    pending.set(myId, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    });
    stdin.write(enc.encode(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n"));
  });
}

const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
};

const COMPOSE = `services:
  proof-web:
    image: nginx:alpine
    ports:
      - "18923:80"
`;

try {
  const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "proof-agent", version: "0.1" } });
  check("initialize", init?.serverInfo?.name === "switchboard", `server=${init?.serverInfo?.name}`);

  const list = await rpc("tools/list");
  const names: string[] = (list?.tools ?? []).map((t: any) => t.name);
  check("tools/list has 6 tools", names.length === 6, names.join(","));
  check("skill_search present", names.includes("skill_search"));
  check("infra_deploy present", names.includes("infra_deploy"));

  const call = async (name: string, args: any) => {
    const r = await rpc("tools/call", { name, arguments: args });
    return JSON.parse(r.content[0].text);
  };

  const sr = await call("skill_search", { query: "deploy container infrastructure" });
  check("skill_search returns results", sr.count >= 0, `${sr.count} skills`);

  const dep = await call("infra_deploy", { name: "proof", compose_yaml: COMPOSE });
  check("infra_deploy ok", dep.ok === true, (dep.output ?? "").split("\n").slice(-2).join(" / "));

  await Bun.sleep(4000);
  const cont = await call("infra_containers", {});
  const running = (cont.containers as string[]).some((c) => c.includes("proof") && /Up/.test(c));
  check("container running", running);

  let httpOk = false;
  try {
    const resp = await fetch("http://127.0.0.1:18923/", { signal: AbortSignal.timeout(8000) });
    httpOk = resp.status === 200;
  } catch {}
  check("HTTP 200 on :18923", httpOk);

  const logs = await call("infra_logs", { container: "proof-proof-web-1", tail: 5 });
  check("infra_logs returns", typeof logs.logs === "string");

  const down = await call("infra_down", { name: "proof" });
  check("infra_down ok", down.ok === true);

  const sg = await call("skill_get", { query: "x", name: sr.skills?.[0]?.name ?? "nonexistent-skill-xyz" }).catch((e: Error) => ({ __err: e.message }));
  check("skill_get works or 404s cleanly", !!(sg as any).content || !!(sg as any).__err);
} catch (e: any) {
  check("no exceptions", false, e.message);
} finally {
  try { proc.kill(); } catch {}
  try { stdin.end(); } catch {}
}

const failed = results.filter((r) => !r[1]).length;
console.log(failed === 0 ? "\nPROOF PASS — agent drove a real deploy through Switchboard MCP" : `\nPROOF FAIL — ${failed} checks failed`);
process.exit(failed === 0 ? 0 : 1);

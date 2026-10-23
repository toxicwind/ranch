/**
 * gateway.ts — McpGateway: HTTP MCP fan-out over upstream MCP proxies.
 *
 * Backends (in preference order, first one that answers wins for a call):
 *   1. gatehouse  — 127.0.0.1:25127 (the estate MCP proxy; retrieve_tools routing)
 *   2. herd       — 127.0.0.1:25100  (llama-swap HTTP MCP surface)
 *   3. SCOUT_BASE_URL — optional third backend, full URL override
 *
 * Semantics:
 *   - tools/list  → merged tool lists from every healthy backend, namespaced
 *     as `server__tool` when the same name exists on more than one backend.
 *   - tools/call  → routed to the backend that advertised the tool.
 *   - Upstream auth: reads MCPPROXY_API_KEY (gatehouse bearer) from env.
 *   - A backend that fails health is skipped for the request, never fatal.
 */

const GATEHOUSE_URL = process.env.GATEHOUSE_URL || "http://127.0.0.1:25127/mcp";
const HERD_URL = process.env.HERD_URL || "http://127.0.0.1:25100/mcp";
const SCOUT_URL = process.env.SCOUT_BASE_URL || "";
const GATEHOUSE_KEY = process.env.MCPPROXY_API_KEY || "";

type RpcId = string | number | null;
interface RpcReq { jsonrpc: "2.0"; id: RpcId; method: string; params?: any }
interface RpcRes { jsonrpc: "2.0"; id: RpcId; result?: any; error?: any }

interface Backend {
  name: string;
  url: string;
  headers: Record<string, string>;
}

function backends(): Backend[] {
  const list: Backend[] = [
    { name: "gatehouse", url: GATEHOUSE_URL, headers: GATEHOUSE_KEY ? { Authorization: `Bearer ${GATEHOUSE_KEY}` } : {} },
    { name: "herd", url: HERD_URL, headers: {} },
  ];
  if (SCOUT_URL) list.push({ name: "scout", url: SCOUT_URL, headers: {} });
  return list;
}

async function rpcOne(b: Backend, req: RpcReq, timeoutMs = 30000): Promise<RpcRes | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(b.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...b.headers },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    if (ct.includes("text/event-stream")) {
      // SSE stream: take the first data: payload that parses as JSON-RPC.
      for (const line of text.split("\n")) {
        const t = line.trim();
        if (t.startsWith("data:")) {
          try { return JSON.parse(t.slice(5).trim()); } catch { /* keep scanning */ }
        }
      }
      return null;
    }
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export class McpGateway {
  /** Fan a JSON-RPC request across backends; returns the first successful response. */
  static async handle(req: Request): Promise<Response> {
    let rpc: RpcReq;
    try {
      rpc = await req.json();
    } catch {
      return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, { status: 400 });
    }

    // Notification (no id): fire-and-forget to every backend.
    if (rpc.id === undefined || rpc.id === null) {
      await Promise.allSettled(backends().map((b) => rpcOne(b, rpc)));
      return new Response(null, { status: 202 });
    }

    if (rpc.method === "initialize") {
      return Response.json({
        jsonrpc: "2.0", id: rpc.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "mcp-gateway", version: "1.0.0" },
        },
      });
    }

    if (rpc.method === "tools/list") {
      // Merge across backends; namespaced duplicates.
      const tools: any[] = [];
      const seen = new Map<string, number>();
      const results = await Promise.all(backends().map(async (b) => {
        const res = await rpcOne(b, { ...rpc, id: `gw-${b.name}` });
        if (!res?.result?.tools) return;
        for (const tool of res.result.tools) {
          const n = seen.get(tool.name) || 0;
          seen.set(tool.name, n + 1);
          if (n > 0) tools.push({ ...tool, name: `${b.name}__${tool.name}` });
          else tools.push(tool);
        }
      }));
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result: { tools } });
    }

    if (rpc.method === "tools/call") {
      const name: string = rpc.params?.name || "";
      const candidates = backends().filter((b) =>
        name.startsWith(`${b.name}__`) ? (rpc.params.name = name.slice(b.name.length + 3), true) : true
      );
      for (const b of candidates) {
        const res = await rpcOne(b, rpc);
        if (res && !res.error) return Response.json(res);
      }
      return Response.json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: `no backend served tool ${name}` } });
    }

    // ping and everything else: first healthy backend answers.
    for (const b of backends()) {
      const res = await rpcOne(b, rpc, 10000);
      if (res) return Response.json(res);
    }
    return Response.json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: "all backends unhealthy" } });
  }
}

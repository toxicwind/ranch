#!/usr/bin/env bun
// @estate/gatehouse — MCP gateway plugin for kappa-cli
// Maximalized: integrates gatehouse with Kappa's tool system
// Namespace-qualified to avoid 81% name collision problem (arXiv 2609.23809)

type ToolResult = string | {
  title?: string;
  output: string;
  metadata?: Record<string, unknown>;
  attachments?: Array<{
    type: "file";
    mime: string;
    url: string;
    filename?: string;
  }>;
};

type GatehouseServer = {
  name: string;
  description: string;
  url?: string;
  tools: Array<{ name: string; description: string }>;
};

export default function estateGatehousePlugin() {
  const BASE_URL = process.env.GATEHOUSE_URL || "http://127.0.0.1:25127";

  return {
    name: "estate/gatehouse",
    description: "MCP gateway integration — discover, call, and audit MCP tools through gatehouse",
    tools: {
      gatehouse_servers: {
        description: "List all MCP servers connected to gatehouse with their tool counts",
        parameters: {
          type: "object" as const,
          properties: {
            statusOnly: { type: "boolean", description: "If true, only return server status, not full details" },
          },
        },
        handler: async (_args: { statusOnly?: boolean }) => {
          const r = await fetch(`${BASE_URL}/api/v1/servers`);
          const data = await r.json();
          if (_args.statusOnly) {
            return data.servers.map((s: GatehouseServer) => ({
              name: s.name,
              status: s.url ? "connected" : "disconnected",
              toolCount: s.tools?.length || 0,
            }));
          }
          return data;
        },
      },
      gatehouse_search_tools: {
        description: "Search across all MCP servers for tools matching a query",
        parameters: {
          type: "object" as const,
          properties: {
            query: { type: "string", description: "Natural language query for tool discovery" },
            limit: { type: "number", description: "Maximum number of results" },
            server: { type: "string", description: "Optional server name to search within" },
          },
          required: ["query"],
        },
        handler: async (args: { query: string; limit?: number; server?: string }) => {
          const url = new URL(`${BASE_URL}/api/v1/tools/retrieve`);
          url.searchParams.set("query", args.query);
          if (args.limit) url.searchParams.set("limit", String(args.limit));
          if (args.server) url.searchParams.set("server", args.server);
          const r = await fetch(url.toString());
          return r.json();
        },
      },
      gatehouse_call: {
        description: "Call a tool on a specific MCP server through gatehouse",
        parameters: {
          type: "object" as const,
          properties: {
            server: { type: "string", description: "Server name (e.g. github, filesystem)" },
            tool: { type: "string", description: "Tool name" },
            args: { type: "object", description: "Tool arguments" },
            timeout: { type: "number", description: "Timeout in seconds" },
          },
          required: ["server", "tool"],
        },
        handler: async (args: {
          server: string;
          tool: string;
          args?: Record<string, unknown>;
          timeout?: number;
        }) => {
          const url = `${BASE_URL}/api/v1/servers/${encodeURIComponent(args.server)}/tools/${encodeURIComponent(args.tool)}/call`;
          const body = JSON.stringify({
            args: args.args || {},
            timeout: args.timeout || 30,
          });
          const r = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body,
          });
          return r.json();
        },
      },
    },
    metadata: {
      name: "estate/gatehouse",
      version: "1.0.0",
      category: "providers",
      targets: ["server"],
      conformsTo: "Agent Plugins v1.0.0",
    },
  };
}

export const plugin = {
  default: estateGatehousePlugin,
  metadata: {
    name: "estate/gatehouse",
    version: "1.0.0",
    category: "providers",
    targets: ["server"],
    conformsTo: "Agent Plugins v1.0.0",
  },
};
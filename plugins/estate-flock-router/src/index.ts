#!/usr/bin/env bun
// @estate/flock-router — Provider routing plugin for kappa-code
// Integrates flock's strategy routing into Kappa's model selection

export default function flockRouterPlugin() {
  const FLOCK_URL = process.env.FLOCK_URL || "http://127.0.0.1:25193";

  return {
    name: "estate/flock-router",
    description: "flock provider router — query strategy weights, health, and routing decisions",
    tools: {
      flock_status: {
        description: "Get flock status: all providers, health, weights, and last error",
        parameters: { type: "object" as const, properties: {} },
        handler: async () => {
          const r = await fetch(`${FLOCK_URL}/api/v1/status`);
          return r.json();
        },
      },
      flock_strategies: {
        description: "List all available routing strategies with their descriptions",
        parameters: { type: "object" as const, properties: {} },
        handler: async () => {
          const r = await fetch(`${FLOCK_URL}/api/v1/strategies`);
          return r.json();
        },
      },
      flock_route: {
        description: "Get the routing decision for a model — which provider would be chosen",
        parameters: {
          type: "object" as const,
          properties: {
            model: { type: "string", description: "Model name (e.g. qwen2.5:7b)" },
            parameters: { type: "object", description: "Inference parameters" },
          },
          required: ["model"],
        },
        handler: async (args: { model: string; parameters?: Record<string, unknown> }) => {
          const r = await fetch(`${FLOCK_URL}/api/v1/route`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: args.model, parameters: args.parameters || {} }),
          });
          return r.json();
        },
      },
    },
    metadata: {
      name: "estate/flock-router",
      version: "1.0.0",
      category: "providers",
      targets: ["server"],
      conformsTo: "Agent Plugins v1.0.0",
    },
  };
}

export const plugin = {
  default: flockRouterPlugin,
  metadata: {
    name: "estate/flock-router",
    version: "1.0.0",
    category: "providers",
    targets: ["server"],
    conformsTo: "Agent Plugins v1.0.0",
  },
};
#!/usr/bin/env bun
// @estate/herd-models — Model catalog plugin for kilo-code
// Exposes herd's model catalog as Kilo model providers for chat completion

export default function herdModelsPlugin() {
  const HERD_URL = process.env.HERD_URL || "http://127.0.0.1:25100";

  return {
    name: "estate/herd-models",
    description: "herd model catalog — expose local LLM models as kilo model providers",
    tools: {
      herd_list: {
        description: "List all models served by herd with their parameters",
        parameters: { type: "object" as const, properties: {} },
        handler: async () => {
          const r = await fetch(`${HERD_URL}/v1/models`);
          return r.json();
        },
      },
      herd_chat: {
        description: "Send a completion request to a herd model",
        parameters: {
          type: "object" as const,
          properties: {
            model: { type: "string", description: "Model ID (e.g. qwen2.5:7b)" },
            messages: { type: "object", description: "Chat messages array" },
            temperature: { type: "number", description: "Temperature" },
            max_tokens: { type: "number", description: "Max tokens" },
          },
          required: ["model", "messages"],
        },
        handler: async (args: { model: string; messages: unknown; temperature?: number; max_tokens?: number }) => {
          const r = await fetch(`${HERD_URL}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: args.model,
              messages: args.messages,
              temperature: args.temperature,
              max_tokens: args.max_tokens,
            }),
          });
          return r.json();
        },
      },
    },
    metadata: {
      name: "estate/herd-models",
      version: "1.0.0",
      category: "models",
      targets: ["server"],
      conformsTo: "Agent Plugins v1.0.0",
    },
  };
}

export const plugin = {
  default: herdModelsPlugin,
  metadata: {
    name: "estate/herd-models",
    version: "1.0.0",
    category: "models",
    targets: ["server"],
    conformsTo: "Agent Plugins v1.0.0",
  },
};
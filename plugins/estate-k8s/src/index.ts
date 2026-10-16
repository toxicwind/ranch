#!/usr/bin/env bun
// @estate/k8s — Kubernetes plugin for kilo-code
// Query cluster state using kubectl or direct API if available

export default function k8sPlugin() {
  const KUBECTL = "kubectl";

  return {
    name: "estate/k8s",
    description: "Kubernetes integration — query cluster state, pods, services, deployments",
    tools: {
      k8s_nodes: {
        description: "List all Kubernetes nodes with their status",
        parameters: { type: "object" as const, properties: {} },
        handler: async () => {
          const { stdout } = await Bun.spawn([KUBECTL, "get", "nodes", "-o", "json"]);
          return JSON.parse(stdout.toString());
        },
      },
      k8s_pods: {
        description: "List pods in a namespace (default: all namespaces)",
        parameters: {
          type: "object" as const,
          properties: {
            namespace: { type: "string", description: "Namespace name (optional)" },
            labelSelector: { type: "string", description: "Label selector" },
          },
        },
        handler: async (args: { namespace?: string; labelSelector?: string }) => {
          const cmd = [KUBECTL, "get", "pods"];
          if (args.namespace) {
            cmd.push("-n");
            cmd.push(args.namespace);
          }
          if (args.labelSelector) {
            cmd.push("-l");
            cmd.push(args.labelSelector);
          }
          cmd.push("-o");
          cmd.push("json");
          const { stdout } = await Bun.spawn(cmd);
          return JSON.parse(stdout.toString());
        },
      },
      k8s_services: {
        description: "List services in a namespace",
        parameters: {
          type: "object" as const,
          properties: {
            namespace: { type: "string", description: "Namespace name (optional)" },
          },
        },
        handler: async (args: { namespace?: string }) => {
          const cmd = [KUBECTL, "get", "services"];
          if (args.namespace) {
            cmd.push("-n");
            cmd.push(args.namespace);
          }
          cmd.push("-o");
          cmd.push("json");
          const { stdout } = await Bun.spawn(cmd);
          return JSON.parse(stdout.toString());
        },
      },
      k8s_deployments: {
        description: "List deployments in a namespace",
        parameters: {
          type: "object" as const,
          properties: {
            namespace: { type: "string", description: "Namespace name (optional)" },
          },
        },
        handler: async (args: { namespace?: string }) => {
          const cmd = [KUBECTL, "get", "deployments"];
          if (args.namespace) {
            cmd.push("-n");
            cmd.push(args.namespace);
          }
          cmd.push("-o");
          cmd.push("json");
          const { stdout } = await Bun.spawn(cmd);
          return JSON.parse(stdout.toString());
        },
      },
    },
    metadata: {
      name: "estate/k8s",
      version: "1.0.0",
      category: "infrastructure",
      targets: ["server"],
      conformsTo: "Agent Plugins v1.0.0",
    },
  };
}

export const plugin = {
  default: k8sPlugin,
  metadata: {
    name: "estate/k8s",
    version: "1.0.0",
    category: "infrastructure",
    targets: ["server"],
    conformsTo: "Agent Plugins v1.0.0",
  },
};
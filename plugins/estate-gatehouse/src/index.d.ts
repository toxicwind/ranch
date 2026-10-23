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

export default function estateGatehousePlugin(): {
  name: string;
  description: string;
  tools: Record<string, {
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string }>;
    };
    handler: (args: Record<string, unknown>) => Promise<ToolResult>;
  }>;
  metadata: {
    name: string;
    version: string;
    category: string;
    targets: string[];
    conformsTo: string;
  };
};

export declare const plugin: {
  default: typeof estateGatehousePlugin;
  metadata: {
    name: string;
    version: string;
    category: string;
    targets: string[];
    conformsTo: string;
  };
};
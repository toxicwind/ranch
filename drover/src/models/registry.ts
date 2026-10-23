/**
 * Drover Models Registry and Types
 */

export interface ModelCapabilities {
  coding?: number;
  reasoning?: number;
  writing?: number;
  learning?: number;
  security?: number;
  speed?: number;
  [key: string]: number | undefined;
}

export interface ModelDefinition {
  id: string;
  provider: string;
  displayName: string;
  contextLength: number;
  capabilities: ModelCapabilities;
  description: string;
  lastVerified?: string;
  inputPricePerM?: number;
  outputPricePerM?: number;
  supportsNativeTools?: boolean;
  maxOutputTokens?: number;
  safeInputTokens?: number;
  available?: boolean;
}

export const CATALOG: ModelDefinition[] = [
  {
    id: 'deepseek-ai/deepseek-r1',
    provider: 'nvidia',
    displayName: 'DeepSeek R1 (NVIDIA)',
    contextLength: 128000,
    capabilities: { coding: 9, reasoning: 10, writing: 8, learning: 8, security: 8, speed: 6 },
    description: 'Premier open-weight reasoning model from DeepSeek via NVIDIA NIM.',
    supportsNativeTools: true,
    available: true
  },
  {
    id: 'meta/llama-3.3-70b-instruct',
    provider: 'nvidia',
    displayName: 'Llama 3.3 70B Instruct (NVIDIA)',
    contextLength: 128000,
    capabilities: { coding: 8, reasoning: 9, writing: 9, learning: 9, security: 7, speed: 8 },
    description: 'Meta flagship open-weight 70B model via NVIDIA NIM.',
    supportsNativeTools: true,
    available: true
  },
  {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    displayName: 'Llama 3.3 70B Versatile (Groq)',
    contextLength: 128000,
    capabilities: { coding: 8, reasoning: 8, writing: 9, learning: 9, security: 7, speed: 10 },
    description: 'Ultra low latency 70B model served on Groq LPU.',
    supportsNativeTools: false,
    available: true
  },
  {
    id: 'llama3.1-70b',
    provider: 'cerebras',
    displayName: 'Llama 3.1 70B (Cerebras)',
    contextLength: 8192,
    capabilities: { coding: 8, reasoning: 8, writing: 8, learning: 8, security: 7, speed: 10 },
    description: 'Extremely fast inference on Cerebras CS-3 wafer scale engine.',
    supportsNativeTools: false,
    available: true
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    provider: 'openrouter',
    displayName: 'Claude 3.5 Sonnet (OpenRouter)',
    contextLength: 200000,
    capabilities: { coding: 10, reasoning: 10, writing: 10, learning: 9, security: 9, speed: 7 },
    description: 'Frontier reasoning and coding model from Anthropic.',
    supportsNativeTools: true,
    available: true
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    provider: 'local',
    displayName: 'Qwen 2.5 Coder 32B (Local Herd)',
    contextLength: 32768,
    capabilities: { coding: 9, reasoning: 8, writing: 7, learning: 8, security: 7, speed: 9 },
    description: 'Self-hosted local llama.cpp / herd model on 127.0.0.1:25100.',
    supportsNativeTools: true,
    available: true
  }
];

export class ModelRegistry {
  private models: Map<string, ModelDefinition> = new Map();
  private lastErrors: string[] = [];

  constructor(initial: ModelDefinition[] = CATALOG) {
    for (const m of initial) {
      this.models.set(`${m.provider}::${m.id}`, { ...m, available: m.available ?? true });
    }
  }

  getAll(): ModelDefinition[] {
    return Array.from(this.models.values());
  }

  getAvailable(): ModelDefinition[] {
    return this.getAll().filter(m => m.available);
  }

  getById(provider: string, id: string): ModelDefinition | undefined {
    return this.models.get(`${provider}::${id}`);
  }

  register(model: ModelDefinition): void {
    this.models.set(`${model.provider}::${model.id}`, model);
  }

  setAvailability(provider: string, id: string, available: boolean): void {
    const m = this.getById(provider, id);
    if (m) {
      m.available = available;
    }
  }

  getLastErrors(): string[] {
    return this.lastErrors;
  }
}

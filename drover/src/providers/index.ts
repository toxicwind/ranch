/**
 * Drover Providers Interface & Implementations
 */
import { ChatMessage, normalizeToolMessages } from '../util/helpers';

export interface ChatOptions {
  maxTokens?: number;
  stream?: boolean;
  timeout?: number;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: string) => void;
  [key: string]: any;
}

export interface ChatResponse {
  content: string;
  provider: string;
  modelId: string;
  toolCalls?: any[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export abstract class BaseProvider {
  abstract name: string;
  abstract baseUrl: string;
  protected apiKeys: string[] = [];
  protected keyCooldowns: Map<string, number> = new Map();

  constructor(apiKeys: string[] = []) {
    this.apiKeys = apiKeys;
  }

  setApiKeys(keys: string[]): void {
    this.apiKeys = keys;
  }

  getApiKeys(): string[] {
    return this.apiKeys;
  }

  isConfigured(): boolean {
    return this.apiKeys.some(k => k.trim().length > 0);
  }

  getHeaders(key: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (key.trim()) {
      headers['Authorization'] = `Bearer ${key}`;
    }
    return headers;
  }

  getCooldownRemainingMs(): number {
    const validKeys = this.apiKeys.filter(k => k.trim().length > 0);
    if (validKeys.length === 0) return 0;
    const now = Date.now();
    let minCooldown = Infinity;
    let hasAvailable = false;

    for (const k of validKeys) {
      const cooldownUntil = this.keyCooldowns.get(k) ?? 0;
      const remaining = cooldownUntil - now;
      if (remaining <= 0) {
        hasAvailable = true;
        break;
      }
      if (remaining < minCooldown) {
        minCooldown = remaining;
      }
    }
    return hasAvailable ? 0 : minCooldown;
  }

  setCooldown(key: string, durationMs: number): void {
    this.keyCooldowns.set(key, Date.now() + durationMs);
  }

  clearCooldowns(): void {
    this.keyCooldowns.clear();
  }

  async chat(
    modelId: string,
    messages: ChatMessage[],
    tools?: any[],
    options: ChatOptions = {}
  ): Promise<ChatResponse> {
    const validKeys = this.apiKeys.filter(k => k.trim().length > 0);
    if (validKeys.length === 0 && this.name !== 'local') {
      throw new Error(`Provider ${this.name} has no API keys configured.`);
    }

    const key = validKeys[0] || 'local-no-key';
    const payload: any = {
      model: modelId,
      messages: tools && tools.length > 0 ? messages : normalizeToolMessages(messages),
      max_tokens: options.maxTokens ?? 4096,
      stream: options.stream ?? false
    };
    if (tools && tools.length > 0) {
      payload.tools = tools;
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(key),
      body: JSON.stringify(payload),
      signal: options.abortSignal
    });

    if (res.status === 429) {
      this.setCooldown(key, 60000);
      throw new Error(`Rate limit exceeded (429) for provider ${this.name}`);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API error (${res.status}) on ${this.name}: ${errText}`);
    }

    const data: any = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) {
      throw new Error('Empty response received from model.');
    }

    return {
      content: msg.content || '',
      provider: this.name,
      modelId,
      toolCalls: msg.tool_calls,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0
      } : undefined
    };
  }
}

export class NvidiaProvider extends BaseProvider {
  name = 'nvidia';
  baseUrl = 'https://integrate.api.nvidia.com/v1';
}

export class GroqProvider extends BaseProvider {
  name = 'groq';
  baseUrl = 'https://api.groq.com/openai/v1';
}

export class CerebrasProvider extends BaseProvider {
  name = 'cerebras';
  baseUrl = 'https://api.cerebras.ai/v1';
}

export class OpenRouterProvider extends BaseProvider {
  name = 'openrouter';
  baseUrl = 'https://openrouter.ai/api/v1';
}

export class LocalHerdProvider extends BaseProvider {
  name = 'local';
  baseUrl = 'http://127.0.0.1:25100/v1';

  isConfigured(): boolean {
    return true; // Local herd requires no external cloud keys
  }
}

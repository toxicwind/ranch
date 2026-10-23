import { describe, it, expect, mock } from 'bun:test';
import {
  NvidiaProvider,
  GroqProvider,
  CerebrasProvider,
  OpenRouterProvider,
  LocalHerdProvider
} from '../src/providers/index';

describe('Providers Interface & Implementations', () => {
  it('should initialize and manage API keys and configuration status', () => {
    const nvidia = new NvidiaProvider();
    expect(nvidia.isConfigured()).toBe(false);

    nvidia.setApiKeys(['nv-key-1', '  ']);
    expect(nvidia.isConfigured()).toBe(true);
    expect(nvidia.getApiKeys()).toEqual(['nv-key-1', '  ']);

    const local = new LocalHerdProvider();
    expect(local.isConfigured()).toBe(true); // Local herd needs no external cloud key
  });

  it('should generate proper headers', () => {
    const groq = new GroqProvider();
    const headers = groq.getHeaders('groq-key-123');
    expect(headers['Authorization']).toBe('Bearer groq-key-123');
    expect(headers['Content-Type']).toBe('application/json');

    const noAuth = groq.getHeaders('');
    expect(noAuth['Authorization']).toBeUndefined();
  });

  it('should track and clear key cooldowns', () => {
    const cerebras = new CerebrasProvider(['cerebras-key-1']);
    expect(cerebras.getCooldownRemainingMs()).toBe(0);

    cerebras.setCooldown('cerebras-key-1', 5000);
    expect(cerebras.getCooldownRemainingMs()).toBeGreaterThan(0);

    cerebras.clearCooldowns();
    expect(cerebras.getCooldownRemainingMs()).toBe(0);
  });

  it('should reject chat if provider has no keys configured and is not local', async () => {
    const openrouter = new OpenRouterProvider([]);
    expect(
      openrouter.chat('anthropic/claude-3.5-sonnet', [{ role: 'user', content: 'test' }])
    ).rejects.toThrow('Provider openrouter has no API keys configured');
  });

  it('should mock chat requests successfully', async () => {
    const local = new LocalHerdProvider();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({
        choices: [
          { message: { content: 'Local herd response', tool_calls: [] } }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }), { status: 200 });
    }) as any;

    try {
      const resp = await local.chat('qwen/qwen-2.5-coder-32b-instruct', [
        { role: 'user', content: 'hello' }
      ]);
      expect(resp.content).toBe('Local herd response');
      expect(resp.provider).toBe('local');
      expect(resp.usage?.totalTokens).toBe(15);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should handle 429 rate limit errors with automatic cooldown trigger', async () => {
    const groq = new GroqProvider(['test-groq-key']);
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(async () => {
      return new Response('Rate limit reached', { status: 429 });
    }) as any;

    try {
      await expect(
        groq.chat('llama-3.3-70b-versatile', [{ role: 'user', content: 'test' }])
      ).rejects.toThrow('Rate limit exceeded (429)');

      expect(groq.getCooldownRemainingMs()).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

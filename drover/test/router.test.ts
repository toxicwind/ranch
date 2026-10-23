import { describe, it, expect, mock } from 'bun:test';
import { HerdRouter, HealthTracker } from '../src/router/index';
import { LocalHerdProvider, NvidiaProvider } from '../src/providers/index';
import { ModelRecommendation } from '../experts/profiles';
import { ModelDefinition } from '../models/registry';

describe('HerdRouter & HealthTracker', () => {
  it('should track success, latency, and failures in HealthTracker', () => {
    const tracker = new HealthTracker();
    expect(tracker.isHealthy('nvidia')).toBe(true);

    tracker.recordSuccess('nvidia', 100);
    const stats = tracker.getStats('nvidia');
    expect(stats?.totalRequests).toBe(1);
    expect(stats?.avgLatencyMs).toBe(100);

    tracker.recordSuccess('nvidia', 200);
    expect(tracker.getStats('nvidia')?.avgLatencyMs).toBe(130);

    tracker.recordFailure('nvidia');
    tracker.recordFailure('nvidia');
    tracker.recordFailure('nvidia');
    expect(tracker.isHealthy('nvidia')).toBe(false);

    tracker.clear();
    expect(tracker.getStats('nvidia')).toBeUndefined();
    expect(tracker.isHealthy('nvidia')).toBe(true);
  });

  it('should route chat to healthy available candidate', async () => {
    const local = new LocalHerdProvider();
    const router = new HerdRouter([local]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Routed successfully' } }]
      }), { status: 200 });
    }) as any;

    try {
      const candidates: ModelRecommendation[] = [
        {
          model: {
            id: 'qwen/qwen-2.5-coder-32b-instruct',
            provider: 'local',
            displayName: 'Local Herd Qwen',
            contextLength: 32768,
            capabilities: { speed: 9 },
            description: ''
          },
          rank: 1,
          score: 8.5,
          reason: 'Best fit'
        }
      ];

      const res = await router.route(candidates, [{ role: 'user', content: 'hello router' }]);
      expect(res.content).toBe('Routed successfully');
      expect(router.healthTracker.isHealthy('local')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should fallback to next candidate when first fails', async () => {
    const nvidia = new NvidiaProvider(['nv-key']);
    const local = new LocalHerdProvider();
    const router = new HerdRouter([nvidia, local]);

    const originalFetch = globalThis.fetch;
    let callCount = 0;

    globalThis.fetch = mock(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response('Nvidia down', { status: 500 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Local fallback win' } }]
      }), { status: 200 });
    }) as any;

    try {
      const candidates: ModelRecommendation[] = [
        {
          model: {
            id: 'deepseek-ai/deepseek-r1',
            provider: 'nvidia',
            displayName: 'Nvidia R1',
            contextLength: 128000,
            capabilities: {},
            description: ''
          },
          rank: 1,
          score: 9.5,
          reason: 'Tier 1'
        },
        {
          model: {
            id: 'qwen/qwen-2.5-coder-32b-instruct',
            provider: 'local',
            displayName: 'Local Herd',
            contextLength: 32768,
            capabilities: {},
            description: ''
          },
          rank: 2,
          score: 8.0,
          reason: 'Tier 2 fallback'
        }
      ];

      const res = await router.route(candidates, [{ role: 'user', content: 'test fallback' }]);
      expect(res.content).toBe('Local fallback win');
      expect(router.healthTracker.getStats('nvidia')?.failures).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should throw error when all candidates fail', async () => {
    const local = new LocalHerdProvider();
    const router = new HerdRouter([local]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response('Fatal error', { status: 500 });
    }) as any;

    try {
      const candidates: ModelRecommendation[] = [
        {
          model: {
            id: 'qwen/qwen-2.5-coder-32b-instruct',
            provider: 'local',
            displayName: 'Local Herd',
            contextLength: 32768,
            capabilities: {},
            description: ''
          },
          rank: 1,
          score: 8.0,
          reason: 'Tier 1'
        }
      ];

      await expect(
        router.route(candidates, [{ role: 'user', content: 'fail test' }])
      ).rejects.toThrow('All recommended models failed');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

/**
 * Drover Herd & Latency Router
 */
import { BaseProvider, ChatOptions, ChatResponse } from '../providers/index';
import { ModelRecommendation } from '../experts/profiles';
import { ChatMessage, trimContext } from '../util/helpers';

export interface ProviderHealth {
  lastSuccess: number;
  failures: number;
  avgLatencyMs: number;
  totalRequests: number;
}

export class HealthTracker {
  private stats: Map<string, ProviderHealth> = new Map();

  getOrCreate(provider: string): ProviderHealth {
    let s = this.stats.get(provider);
    if (!s) {
      s = { lastSuccess: 0, failures: 0, avgLatencyMs: 0, totalRequests: 0 };
      this.stats.set(provider, s);
    }
    return s;
  }

  recordSuccess(provider: string, latencyMs: number): void {
    const s = this.getOrCreate(provider);
    s.lastSuccess = Date.now();
    s.failures = 0;
    s.totalRequests += 1;
    if (s.avgLatencyMs === 0) {
      s.avgLatencyMs = latencyMs;
    } else {
      s.avgLatencyMs = Math.round(s.avgLatencyMs * 0.7 + latencyMs * 0.3);
    }
  }

  recordFailure(provider: string): void {
    const s = this.getOrCreate(provider);
    s.failures += 1;
  }

  isHealthy(provider: string): boolean {
    const s = this.stats.get(provider);
    return s ? s.failures < 3 : true;
  }

  getStats(provider: string): ProviderHealth | undefined {
    return this.stats.get(provider);
  }

  clear(): void {
    this.stats.clear();
  }
}

export class HerdRouter {
  public healthTracker: HealthTracker = new HealthTracker();

  constructor(private providers: BaseProvider[]) {}

  getProvider(name: string): BaseProvider | undefined {
    return this.providers.find(p => p.name === name);
  }

  async route(
    candidates: ModelRecommendation[],
    messages: ChatMessage[],
    tools?: any[],
    options: ChatOptions = {}
  ): Promise<ChatResponse> {
    const availableCandidates = candidates.filter(c => {
      const p = this.getProvider(c.model.provider);
      return p ? p.isConfigured() : false;
    });

    if (availableCandidates.length === 0) {
      throw new Error('No models available. Please configure your API keys or local herd.');
    }

    // Sort by health status and cooldown
    const sorted = [...availableCandidates].sort((a, b) => {
      const aHealthy = this.healthTracker.isHealthy(a.model.provider);
      const bHealthy = this.healthTracker.isHealthy(b.model.provider);
      if (aHealthy !== bHealthy) {
        return aHealthy ? -1 : 1;
      }
      const aProv = this.getProvider(a.model.provider);
      const bProv = this.getProvider(b.model.provider);
      const aCooldown = aProv ? aProv.getCooldownRemainingMs() : 0;
      const bCooldown = bProv ? bProv.getCooldownRemainingMs() : 0;
      if (aCooldown !== bCooldown) {
        return aCooldown - bCooldown;
      }
      return b.score - a.score;
    });

    const errors: string[] = [];
    for (const cand of sorted) {
      const provider = this.getProvider(cand.model.provider);
      if (!provider) continue;

      const start = Date.now();
      try {
        const safeLimit = cand.model.safeInputTokens ?? Math.floor(cand.model.contextLength / 4 * 0.75);
        const trimmed = trimContext(messages, safeLimit);
        const res = await provider.chat(cand.model.id, trimmed, tools, options);
        this.healthTracker.recordSuccess(cand.model.provider, Date.now() - start);
        return res;
      } catch (err: any) {
        this.healthTracker.recordFailure(cand.model.provider);
        errors.push(`${cand.model.displayName} (${cand.model.provider}): ${err.message || String(err)}`);
      }
    }

    throw new Error(`All recommended models failed:\n${errors.map(e => `- ${e}`).join('\n')}`);
  }
}

/**
 * Per-provider circuit breaking and rate limiting.
 *
 * Two failure modes, two mechanisms, one rule: neither may be bypassed.
 *
 * The breaker (`opossum`) stops us hammering a provider that is down. Without
 * it, a dead provider turns every request into its full timeout — the agent
 * waits on a provider that will never answer, and the *other* providers idle.
 * With it, the third failure trips the gate and the router picks a different
 * one on the next request instead of the same dead one.
 *
 * The limiter (`bottleneck`) is the sliding-window RPM ceiling. Providers
 * answer 429 far more often than they answer, and a 429 storm spends our quota
 * of the thing being rate-limited.
 *
 * Both are keyed by provider so one provider's outage never degrades another's
 * path — the isolation is the whole point.
 */

import CircuitBreaker from "opossum";
import Bottleneck from "bottleneck";
import type { Config } from "./config.ts";

export type BreakerState = "closed" | "open" | "half-open";

export class ProviderGate {
  private breakers = new Map<string, CircuitBreaker<[unknown], unknown>>();
  private limiters = new Map<string, Bottleneck>();
  private empties = new Map<string, number>();

  constructor(private cfg: Config) {}

  private breaker(provider: string): CircuitBreaker<[unknown], unknown> {
    const existing = this.breakers.get(provider);
    if (existing) return existing;
    const made = new CircuitBreaker(
      async (fn: unknown) => (fn as () => Promise<unknown>)(),
      {
        timeout: this.cfg.breakerResetMs,
        errorThresholdPercentage: 100,
        resetTimeout: this.cfg.breakerResetMs,
        rollingCountTimeout: this.cfg.breakerResetMs * 4,
        name: provider,
      },
    );
    this.breakers.set(provider, made);
    return made;
  }

  private limiter(provider: string): Bottleneck {
    const existing = this.limiters.get(provider);
    if (existing) return existing;
    const rpm = this.cfg.rpm[provider] ?? 0;
    // Bottleneck's `reservoir` option is a size, not an object: it sets the
    // burst ceiling the token bucket refills to once per interval.
    const made = new Bottleneck({
      maxConcurrent: this.cfg.maxConcurrent,
      ...(rpm > 0 ? { minTime: Math.ceil(60_000 / rpm), reservoir: rpm } : {}),
    });
    this.limiters.set(provider, made);
    return made;
  }

  /**
   * Runs `fn` under the provider's breaker and limiter.
   *
   * An open breaker rejects immediately rather than waiting out the timeout, so
   * the caller can try another provider within the request's own budget.
   */
  async run<T>(provider: string, fn: () => Promise<T>): Promise<T> {
    const limit = this.limiter(provider);
    // oposum's `fire` is typed against the `[unknown]` tuple we constructed the
    // breaker with, so the result arrives as unknown. The cast is confined here
    // where the caller's contract is actually known.
    const out = await limit.schedule(() => this.breaker(provider).fire(fn));
    return out as T;
  }

  /**
   * Counts a 200-shaped but empty response.
   *
   * An upstream that returns success with no content is not healthy. The
   * metric name is `cuttinggate_model_empty_strikes`, kept in the same family
   * as flock's `flock_model_empty_strikes` and sovereign-router's
   * `sovereign_router_model_empty_strikes` so the three stacks correlate.
   */
  noteEmpty(model: string): number {
    const n = (this.empties.get(model) ?? 0) + 1;
    this.empties.set(model, n);
    return n;
  }

  emptyStrikes(model: string): number {
    return this.empties.get(model) ?? 0;
  }

  state(provider: string): BreakerState {
    const b = this.breakers.get(provider);
    if (!b) return "closed";
    if (b.opened) return "open";
    if (b.halfOpen) return "half-open";
    return "closed";
  }

  snapshot(): { provider: string; state: BreakerState; failures: number; successes: number }[] {
    return [...this.breakers.entries()].map(([provider, b]) => ({
      provider,
      state: b.opened ? "open" : b.halfOpen ? "half-open" : "closed",
      failures: b.stats.failures,
      successes: b.stats.successes,
    }));
  }
}
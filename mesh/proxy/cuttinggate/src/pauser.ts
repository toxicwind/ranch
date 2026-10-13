/**
 * First-class model pausing.
 *
 * When a provider gives direct errors (5xx, timeouts, connection failures),
 * the model gets PAUSED — temporarily removed from routing — instead of being
 * hammered. Pauses auto-expire with exponential backoff. This is distinct from
 * quarantine (dead slugs, 404s) and circuit breakers (provider-level).
 *
 * Red herrings that NEVER pause:
 * - 404 → quarantine (the slug is dead, not sick)
 * - 429 → rate limit (keypool backs off, the model is fine)
 * - 400 → client error (our request was bad, not the provider)
 * - 401/402/403 → key issues (credential plane handles)
 * - empty content → model quality (ledger tracks, not a pause trigger)
 *
 * Pause triggers (real failures):
 * - Timeouts (AbortSignal, network timeouts)
 * - 5xx (provider server errors)
 * - Connection failures (ECONNREFUSED, DNS, TLS, status 0)
 *
 * Provider-level: if 3+ models on a provider pause within 5 minutes,
 * the whole provider pauses for 5 minutes.
 */

export type PauseReason =
  | "timeout"
  | "server-error"
  | "connection-failed"
  | "manual"
  | "provider-cascade";

export type PauseEntry = {
  /** "model|provider" for model pauses, "provider:*" for provider pauses. */
  key: string;
  model: string | null;
  provider: string;
  reason: PauseReason;
  /** Consecutive pause-worthy failures. */
  strikes: number;
  /** When the pause lifts (epoch ms). */
  resumeAt: number;
  firstSeen: number;
  lastSeen: number;
  detail: string;
};

/** Backoff schedule: 30s, 60s, 2m, 5m, 10m (max). */
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000];

/** Provider cascade: 3 model pauses within 5m → pause the provider for 5m. */
const CASCADE_THRESHOLD = 3;
const CASCADE_WINDOW_MS = 5 * 60_000;
const CASCADE_PAUSE_MS = 5 * 60_000;

/** Statuses that are RED HERRINGS — never pause on these. */
const RED_HERRINGS = new Set([400, 401, 402, 403, 404, 429]);

/** Statuses that trigger a pause (real provider failures). */
const PAUSE_STATUSES = new Set([500, 502, 503, 504]);

/** Error substrings that indicate timeouts or connection failures. */
const TIMEOUT_PATTERNS = [
  "timeout",
  "timed out",
  "aborted",
  "econnreset",
  "econnrefused",
  "enotfound",
  "eai_again",
  "network",
  "fetch failed",
];

export function isRedHerring(status: number | null): boolean {
  if (status === null) return false; // null status = network failure, not a herring
  return RED_HERRINGS.has(status);
}

export function shouldPause(status: number | null, error: string): boolean {
  // Explicit pause triggers: 5xx or timeout/connection patterns.
  if (status !== null && PAUSE_STATUSES.has(status)) return true;
  if (status === 0 || status === null) {
    const lower = error.toLowerCase();
    return TIMEOUT_PATTERNS.some((p) => lower.includes(p));
  }
  return false;
}

export class Pauser {
  private entries = new Map<string, PauseEntry>();
  /** Recent model pauses per provider, for cascade detection. */
  private recentPauses = new Map<string, number[]>();

  private key(model: string | null, provider: string): string {
    return model ? `${model}|${provider}` : `${provider}:*`;
  }

  isPaused(model: string, provider: string): boolean {
    const now = Date.now();
    // Check model-level pause. Expired entries are kept (for strike count)
    // but report as not paused; list() prunes them.
    const mk = this.key(model, provider);
    const me = this.entries.get(mk);
    if (me && me.resumeAt > now) return true;
    // Check provider-level pause.
    const pk = this.key(null, provider);
    const pe = this.entries.get(pk);
    if (pe && pe.resumeAt > now) return true;
    return false;
  }

  get(model: string, provider: string): PauseEntry | undefined {
    return this.entries.get(this.key(model, provider));
  }

  list(): PauseEntry[] {
    const now = Date.now();
    // Prune expired.
    for (const [k, e] of this.entries) {
      if (e.resumeAt <= now) this.entries.delete(k);
    }
    return [...this.entries.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  get count(): number {
    return this.list().length;
  }

  /**
   * Record a failure. Returns true if this triggered (or extended) a pause.
   * Red herrings return false immediately.
   */
  noteFailure(
    model: string,
    provider: string,
    status: number | null,
    error: string,
    detail: string = "",
  ): boolean {
    if (isRedHerring(status)) return false;
    if (!shouldPause(status, error)) return false;

    const now = Date.now();
    const k = this.key(model, provider);
    const existing = this.entries.get(k);

    let reason: PauseReason = "server-error";
    if (status === 0 || status === null) {
      const lower = error.toLowerCase();
      reason = TIMEOUT_PATTERNS.some((p) => lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted"))
        ? "timeout"
        : "connection-failed";
    }

    const strikes = (existing?.strikes ?? 0) + 1;
    const backoffIdx = Math.min(strikes - 1, BACKOFF_MS.length - 1);
    const resumeAt = now + BACKOFF_MS[backoffIdx]!;

    this.entries.set(k, {
      key: k,
      model,
      provider,
      reason,
      strikes,
      resumeAt,
      firstSeen: existing?.firstSeen ?? now,
      lastSeen: now,
      detail: detail || `${status ?? "network"}: ${error.slice(0, 200)}`,
    });

    // Cascade check: 3+ model pauses on this provider within 5m?
    this.recordRecentPause(provider, now);
    this.checkCascade(provider, now);

    return true;
  }

  /** Manually pause a model or provider. */
  pause(model: string | null, provider: string, durationMs: number, reason: PauseReason = "manual", detail: string = ""): void {
    const now = Date.now();
    const k = this.key(model, provider);
    this.entries.set(k, {
      key: k,
      model,
      provider,
      reason,
      strikes: 1,
      resumeAt: now + durationMs,
      firstSeen: now,
      lastSeen: now,
      detail,
    });
  }

  /** Manually resume (unpause) a model or provider. */
  resume(model: string | null, provider: string): boolean {
    return this.entries.delete(this.key(model, provider));
  }

  private recordRecentPause(provider: string, now: number): void {
    const arr = this.recentPauses.get(provider) ?? [];
    arr.push(now);
    // Prune outside the window.
    const cutoff = now - CASCADE_WINDOW_MS;
    this.recentPauses.set(provider, arr.filter((t) => t > cutoff));
  }

  private checkCascade(provider: string, now: number): void {
    const arr = this.recentPauses.get(provider) ?? [];
    if (arr.length >= CASCADE_THRESHOLD) {
      const pk = this.key(null, provider);
      // Don't re-cascade if already paused.
      if (!this.entries.has(pk)) {
        this.entries.set(pk, {
          key: pk,
          model: null,
          provider,
          reason: "provider-cascade",
          strikes: 1,
          resumeAt: now + CASCADE_PAUSE_MS,
          firstSeen: now,
          lastSeen: now,
          detail: `${arr.length} models paused within 5m`,
        });
      }
      // Reset the counter after cascading.
      this.recentPauses.set(provider, []);
    }
  }
}

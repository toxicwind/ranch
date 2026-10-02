/**
 * Model routing: which provider serves this request.
 *
 * The rule set, in order:
 *
 *   1. Quarantined slugs never leave the building.
 *   2. Candidates are ordered by the winner ledger, so the provider that
 *      usually wins goes first and the slow path stops costing the common case.
 *   3. Candidates race for the first *valid* answer — not the first answer. A
 *      200 with empty content loses to a slower provider that actually replied.
 *   4. A serve-time 404 marks the slug, which is what keeps a retired `:free`
 *      tier from killing an agent mid-task.
 *
 * Racing is the reason this is fast rather than merely correct: three providers
 * at once costs one provider's latency, not three.
 */

import type { Config } from "./config.ts";
import { ProviderGate } from "./circuit.ts";
import { Quarantine } from "./quarantine.ts";
import type { CredentialPlane } from "./keypool.ts";
import { Ledger } from "./ledger.ts";

export type KnownModel = { id: string; provider: string };

/** A model id may be served by several providers; that is the whole point. */

export type Attempt =
  | { ok: true; content: string; provider: string; latencyMs: number; raced: boolean; finishReason?: string; usage?: unknown }
  | { ok: false; error: string };

export type ChatRequest = {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
};

type Settled = {
  provider: string;
  valid: boolean;
  latencyMs: number;
  content?: string;
  finishReason?: string;
  usage?: unknown;
  error?: string;
  status?: number;
};

/** An empty completion is a failure wearing a 200. */
function contentOf(body: { choices?: { message?: { content?: string }; finish_reason?: string }[]; usage?: unknown } | null): { content?: string; finishReason?: string; usage?: unknown } {
  return {
    content: body?.choices?.[0]?.message?.content,
    finishReason: body?.choices?.[0]?.finish_reason,
    usage: body?.usage,
  };
}

export class Router {
  private catalog = new Map<string, Set<string>>();
  private readonly claimed = new Map<string, string>();
  private readonly ledger: Ledger;

  constructor(
    private readonly config: Config,
    private readonly gate: ProviderGate,
    private readonly quarantine: Quarantine,
    ledger?: Ledger,
    /**
     * Optional credential plane. When present, every attempt claims a key from
     * the provider's pool and reports the status back, so a dead key is cooled
     * and rotated out instead of producing a bare 502 on every request.
     */
    private readonly credentials?: CredentialPlane,
  ) {
    this.ledger = ledger ?? new Ledger();
  }

  /**
   * Providers whose credential pool is currently exhausted, with the reason.
   * Reads state, never claims: this is a diagnosis endpoint, and a diagnosis
   * that throws is worse than the bug it reports.
   */
  starved(): { provider: string; reason: string }[] {
    if (!this.credentials) return [];
    const providers = new Set([...this.catalog.values()].flatMap((s) => [...s]));
    return [...providers]
      .filter((p) => this.credentials!.usable(p, { paid: false }).length === 0)
      .map((provider) => {
        const keys = this.credentials!.snapshot().find((e) => e.upstream === provider)?.keys ?? [];
        const statuses = [...new Set(keys.map((k) => k.lastStatus).filter((s): s is number => s !== null))];
        return {
          provider,
          reason: `no healthy key (tried ${keys.map((k) => k.name).join(", ") || "none configured"}, statuses ${statuses.join(", ") || "none"})`,
        };
      });
  }

  /** Registers that `provider` can serve `model`. Repeatable per model. */
  register(model: string, provider: string): void {
    const set = this.catalog.get(model);
    if (set) set.add(provider);
    else this.catalog.set(model, new Set([provider]));
  }

  known(): KnownModel[] {
    return [...this.catalog.entries()].flatMap(([id, providers]) => [...providers].map((provider) => ({ id, provider })));
  }

  private candidates(model: string): string[] {
    const providers = this.catalog.get(model) ?? new Set<string>();
    return this.ledger.order(model, [...providers]).filter((p) => !this.quarantine.isQuarantined(`${model}@${p}`));
  }

  /** Take a key for this attempt. Called by the race body so the attribution below is stub-proof. */
  private claimKey(provider: string): string {
    const key = this.credentials
      ? this.credentials.claim(provider, { paid: false })
      : (this.config.keys[provider] ?? "");
    this.claimed.set(provider, key);
    return key;
  }

  /** Attribute an outcome to the key this provider actually used. */
  private reportOutcome(provider: string, status: number | null, error?: string): void {
    const key = this.claimed.get(provider);
    if (this.credentials && key) this.credentials.note(provider, key, status, error);
  }

  /** The upstream call for one provider. Overridden in tests. */
  protected async call(provider: string, req: ChatRequest, signal: AbortSignal): Promise<Response> {
    const base = this.config.bases[provider];
    if (!base) throw new Error(`no base url for provider ${provider}`);
    // Prefer a pool key; fall back to the single configured key when there is
    // no pool. claim() throws a diagnosable error when the pool is exhausted.
    const key = this.claimed.get(provider) ?? this.config.keys[provider] ?? "";
    return fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: req.model, messages: req.messages, temperature: req.temperature, max_tokens: req.max_tokens }),
      signal,
    });
  }

  /**
   * First-valid-wins race.
   *
   * Deliberately not `Promise.any`: that resolves on the first attempt to
   * *settle*, so a provider returning an empty 200 would beat a slower provider
   * that returned real content. Completions land in a shared buffer and signal a
   * shared wake instead, which also means a provider added after the first await
   * is still awaited.
   */
  async complete(model: string, messages: { role: string; content: string }[], extra: Partial<ChatRequest> = {}): Promise<Attempt> {
    const req: ChatRequest = { model, messages, ...extra };
    const providers = this.candidates(model);
    if (!providers.length) return { ok: false, error: `no provider serves ${model}` };

    const started = performance.now();
    const controller = new AbortController();
    const settled: Settled[] = [];
    let wake: (() => void) | null = null;

    let pending = providers.length;
    const inflight = providers.map((provider) => {
      const p = this.gate
        .run(provider, async (): Promise<Settled> => {
          const t0 = performance.now();
          try {
            this.claimKey(provider);
            const res = await this.call(provider, req, controller.signal);
            this.reportOutcome(provider, res.status);
            if (res.status === 404) this.quarantine.noteServe404(model, provider, `upstream 404 for ${model}`);
            const body = (await res.json()) as Parameters<typeof contentOf>[0];
            const { content, finishReason, usage } = contentOf(body);
            const valid = res.ok && typeof content === "string" && content.trim().length > 0;
            return { provider, valid, latencyMs: performance.now() - t0, content, finishReason, usage, status: res.status };
          } catch (e) {
            this.reportOutcome(provider, null, e instanceof Error ? e.message : String(e));
            return { provider, valid: false, latencyMs: performance.now() - t0, error: e instanceof Error ? e.message : String(e) };
          }
        })
        .then((r) => {
          settled.push(r);
          pending -= 1;
          wake?.();
          return r;
        });
      return { provider, promise: p };
    });

    let winner: Settled | null = null;
    for (;;) {
      if (winner) break;
      if (!settled.length) {
        if (pending === 0) break;
        const { promise: woke, resolve } = Promise.withResolvers<void>();
        wake = resolve;
        // A hard ceiling so one wedged provider cannot hold the request open.
        const clock = setTimeout(resolve, 120_000);
        await woke;
        clearTimeout(clock);
        wake = null;
      }
      while (settled.length) {
        const r = settled.shift()!;
        if (r.valid && !winner) winner = r;
      }
    }
    controller.abort();

    if (winner) {
      return {
        ok: true,
        content: winner.content!,
        provider: winner.provider,
        latencyMs: performance.now() - started,
        raced: providers.length > 1,
        finishReason: winner.finishReason,
        usage: winner.usage,
      };
    }

    const reason = settled.find((r) => r.error)?.error ?? `no provider returned valid content (tried ${providers.join(", ")})`;
    return { ok: false, error: reason };
  }
}
/**
 * cuttinggate — the routing gate between the coding agent and its backends.
 *
 *   herd  :25100  owns local GGUFs
 *   flock :25193  owns cloud providers
 *
 * It speaks the OpenAI wire format so the agent needs no special client, and it
 * adds the three things the agent actually needs and neither backend provides:
 * auto-quarantine of slugs that cannot serve, a per-provider breaker, and a
 * winner ledger so a fast path stays hot instead of rotting.
 *
 * Built on Elysia rather than a hand-rolled router: schema validation, body
 * parsing, and error shaping come from the framework instead of 600 lines we
 * would have to keep correct ourselves.
 */

import { Elysia, t } from "elysia";
import pino from "pino";

import { loadConfig, loadSecretsFiles, type Config } from "./config.ts";
import { ProviderGate } from "./circuit.ts";
import { Quarantine } from "./quarantine.ts";
import { Ledger } from "./ledger.ts";
import { Router } from "./router.ts";
import { loadLiveCatalog, servingIds, DEFAULT_CATALOG_PATH } from "./catalog.ts";
import { CredentialPlane, loadPoolsFromYaml } from "./keypool.ts";
import { ZEN_MODELS, ZEN_PROVIDER } from "./zen.ts";

const log = pino({ level: process.env.CUTTINGGATE_LOG_LEVEL ?? "info" });

export type AppDeps = {
  config: Config;
  gate: ProviderGate;
  quarantine: Quarantine;
  ledger: Ledger;
  router: Router;
};

export function buildApp(deps: AppDeps) {
  const { quarantine, ledger, router } = deps;

  const handleModelsSse = () => {
    const herdUrl = deps.config.bases["llama-swap"]
      ? deps.config.bases["llama-swap"].replace(/\/v1\/?$/, "/models/sse")
      : "http://127.0.0.1:25100/models/sse";
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        // Declared per-connection, not per-process: each SSE client owns its own
        // keep-alive timer, and they must be cleared independently. It was
        // previously undeclared, so the fallback path below threw
        // `ReferenceError: timer is not defined` instead of arming the timer —
        // which is exactly the path taken whenever herd is down.
        let timer: Timer | undefined;
        const reloadEv = {
          model: "*",
          event: "models_reload",
          data: { status: "loaded", count: router.known().length },
        };
        controller.enqueue(encoder.encode(`: keep-alive\n\ndata: ${JSON.stringify(reloadEv)}\n\n`));
        try {
          const upstream = await fetch(herdUrl, { headers: { Accept: "text/event-stream" } });
          if (upstream.ok && upstream.body) {
            const reader = upstream.body.getReader();
            (async () => {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  controller.enqueue(value);
                }
              } catch {
                // Upstream disconnected
              } finally {
                if (timer) clearInterval(timer);
                try { controller.close(); } catch {}
              }
            })();
            return;
          }
        } catch {
          // Upstream herd unavailable; fall back to keep-alive timer
        }

        timer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            clearInterval(timer);
          }
        }, 15000);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  };
  return new Elysia()
    .get("/health", () => ({ ok: true, quarantined: quarantine.count }))

    /** Why a model is not being served, and who put it there. */
    .get("/quarantine", () => ({ count: quarantine.count, entries: quarantine.list() }))

    /** Per-provider breaker state plus the winner ledger. */
    .get("/status", () => ({
      providers: deps.gate.snapshot(),
      quarantined: quarantine.count,
      leaders: ledger.top(10),
    }))

    .get("/metrics", () => ({
      cuttinggate_quarantined: quarantine.count,
      cuttinggate_model_empty_strikes: Object.fromEntries([...ledger.models()].map((m) => [m, deps.gate.emptyStrikes(m)])),
      cuttinggate_race_total: ledger.total(),
    }))

    /**
     * OpenAI-compatible listing. Quarantined models are returned with
     * `quarantined: true` rather than omitted — a caller that cannot see a
     * model cannot debug why it is not being served.
     */
    .get("/v1/models", () => ({
      object: "list",
      data: router.known().map((m) => ({
        id: m.id,
        object: "model",
        owned_by: m.provider,
        ...(quarantine.isQuarantined(m.id) ? { quarantined: true } : {}),
      })),
    }))

    /**
     * Model events SSE feed (matches llama.cpp & herd GET /models/sse).
     * Connects clients (like Zed / editors) to live model load/unload/reload state.
     */
    .get("/models/sse", () => handleModelsSse())
    .get("/v1/models/sse", () => handleModelsSse())

    .post(
      "/v1/chat/completions",
      async ({ body, set, headers }) => {
        const auth = headers["authorization"] ?? "";
        if (!auth.startsWith("Bearer ")) {
          set.status = 401;
          return { error: { message: "missing bearer token", type: "auth" } };
        }

        // A quarantined slug is refused before spending an upstream call, and
        // the refusal names the model rather than surfacing a provider fault.
        if (quarantine.isQuarantined(body.model)) {
          const q = quarantine.get(body.model);
          set.status = 409;
          return {
            error: {
              message: `model ${body.model} is quarantined: ${q?.reason} (${q?.detail})`,
              type: "quarantined",
              code: "model_quarantined",
            },
          };
        }

        const attempt = await router.complete(body.model, body.messages, { temperature: body.temperature, max_tokens: body.max_tokens });
        if (!attempt.ok) {
          set.status = 502;
          return { error: { message: attempt.error, type: "upstream", model: body.model } };
        }

        ledger.record(body.model, attempt.provider, attempt.latencyMs, true);
        if (!attempt.content.trim()) deps.gate.noteEmpty(body.model);

        if (body.stream) {
          const id = `cg_${crypto.randomUUID()}`;
          const created = Math.floor(Date.now() / 1000);
          const encoder = new TextEncoder();

          const stream = new ReadableStream({
            start(controller) {
              const chunk1 = {
                id,
                object: "chat.completion.chunk",
                created,
                model: body.model,
                choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk1)}\n\n`));

              const text = attempt.content;
              const chunkSize = 64;
              for (let i = 0; i < text.length; i += chunkSize) {
                const slice = text.slice(i, i + chunkSize);
                const chunk = {
                  id,
                  object: "chat.completion.chunk",
                  created,
                  model: body.model,
                  choices: [{ index: 0, delta: { content: slice }, finish_reason: null }],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              }

              const chunkDone = {
                id,
                object: "chat.completion.chunk",
                created,
                model: body.model,
                choices: [{ index: 0, delta: {}, finish_reason: attempt.finishReason ?? "stop" }],
                usage: attempt.usage,
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunkDone)}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          });

          return new Response(stream, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "X-Routed-Via": attempt.provider,
            },
          });
        }

        return {
          id: `cg_${crypto.randomUUID()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [{ index: 0, message: { role: "assistant", content: attempt.content }, finish_reason: attempt.finishReason ?? "stop" }],
          usage: attempt.usage,
          meta: { provider: attempt.provider, latency_ms: Math.round(attempt.latencyMs), raced: attempt.raced },
        };
      },
      {
        body: t.Object({
          model: t.String({ minLength: 1 }),
          messages: t.Array(t.Object({ role: t.String(), content: t.String() })),
          stream: t.Optional(t.Boolean()),
          temperature: t.Optional(t.Number()),
          max_tokens: t.Optional(t.Number()),
        }),
      },
    );
}

/** Boots with the real process environment. Exits non-zero on bad config. */
export async function main(): Promise<void> {
  loadSecretsFiles();
  let config: Config;
  try {
    config = loadConfig();
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exit(1);
  }

  const gate = new ProviderGate(config);
  const quarantine = new Quarantine();
  const ledger = new Ledger();
  // The credential plane turns "one dead key 502s forever" into "that key is
  // cooled, rotated out, and reported by name on /status".
  let credentials: CredentialPlane | undefined;
  try {
    const pools = loadPoolsFromYaml(process.env.KEYPOOLS_YAML ?? "/home/toxic/estate/config/keypools.yaml");
    credentials = pools.length ? new CredentialPlane(pools) : undefined;
  } catch (e) {
    console.error(`keypool config unreadable, running without the credential plane: ${(e as Error).message}`);
  }
  const router = new Router(config, gate, quarantine, ledger, credentials);

  // Seed the serving catalog from the live catalog. Without this the router
  // boots with an empty catalog: /v1/models is empty and every completion
  // fails with "no provider serves X". Fail closed when the catalog is
  // unreadable — a router with no catalog is worse than no router.
  const catalogPath = process.env.CUTTINGGATE_CATALOG ?? DEFAULT_CATALOG_PATH;
  const loaded = loadLiveCatalog(catalogPath);
  if (!loaded.ok) {
    process.stderr.write(`cuttinggate: catalog load failed: ${loaded.reason} (${loaded.path})\n`);
    process.exit(1);
  }
  const pairs = servingIds(loaded.data);
  for (const { id, provider } of pairs) router.register(id, provider);
  // Zen free-tier seed: the live catalog can lag upstream rotations, so the
  // verified-working set is always registered directly. (Live-verified
  // 2026-10-04: 17/17 serve via the OpenCode request shape in zen.ts.)
  for (const id of ZEN_MODELS) router.register(id, ZEN_PROVIDER);
  for (const [provider, entry] of Object.entries(loaded.data.providers)) {
    quarantine.observeListing(entry.serving, provider);
  }
  log.info(
    {
      catalog: loaded.path,
      providers: Object.keys(loaded.data.providers).length,
      serving: pairs.length,
      contractMatched: loaded.contractMatched,
    },
    "cuttinggate catalog seeded",
  );

  const app = buildApp({ config, gate, quarantine, ledger, router });
  app.listen({ port: config.port, hostname: config.host });
  log.info({ port: config.port, host: config.host, providers: Object.keys(config.keys) }, "cuttinggate up");
}

if (import.meta.main) await main();
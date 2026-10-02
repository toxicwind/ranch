/**
 * Runtime configuration, validated once at boot.
 *
 * zod does the work here rather than hand-written `if` checks, because a router
 * that boots with a half-valid config is a router that fails mid-incident. A
 * bad port or a missing key stops the process immediately with a readable
 * message instead of producing 502s an hour later.
 *
 * Ports and credentials are read from the environment only. Nothing is read
 * from a file at import time, so the module is safe to import from tests.
 */

import { z } from "zod";

const Num = z.coerce.number().int().min(1).max(65535);

const Schema = z.object({
  /** The gate's own listener. */
  port: Num.default(25194),
  host: z.string().default("127.0.0.1"),

  /** Credentials for upstream providers, by provider id. */
  keys: z.record(z.string(), z.string()).default({}),

  /** Per-provider request ceilings; absent means "do not throttle". */
  rpm: z.record(z.string(), Num).default({}),

  /** Provider base URLs. */
  bases: z.record(z.string(), z.string()).default({
    "openrouter": "https://openrouter.ai/api/v1",
    "nvidia": "https://integrate.api.nvidia.com/v1",
    "groq": "https://api.groq.com/openai/v1",
  }),

  /** Hard ceiling on concurrent in-flight upstream calls. */
  maxConcurrent: Num.default(64),

  /** How long a provider may stay open before the breaker half-opens. */
  breakerResetMs: Num.default(15_000),

  /** Consecutive failures before a provider's breaker opens. */
  breakerThreshold: Num.default(5),

  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Config = z.infer<typeof Schema>;

function readKeys(): Record<string, string> {
  // Every provider key is conventionally PROVIDER_KEY in the environment.
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    const m = /^([A-Z0-9]+)_API_KEY$/.exec(k);
    if (m && v) out[m[1]!.toLowerCase()] = v;
  }
  return out;
}

function readRpm(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(process.env)) {
    const m = /^([A-Z0-9]+)_RPM$/.exec(k);
    const n = Number(v);
    if (m && Number.isFinite(n) && n > 0) out[m[1]!.toLowerCase()] = n;
  }
  return out;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const parsed = Schema.safeParse({
    keys: readKeys(),
    rpm: readRpm(),
    ...(process.env.CUTTINGGATE_PORT ? { port: process.env.CUTTINGGATE_PORT } : {}),
    ...(process.env.CUTTINGGATE_HOST ? { host: process.env.CUTTINGGATE_HOST } : {}),
    ...(process.env.CUTTINGGATE_LOG_LEVEL ? { logLevel: process.env.CUTTINGGATE_LOG_LEVEL } : {}),
    ...overrides,
  });
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`cuttinggate: invalid configuration\n${detail}`);
  }
  return parsed.data;
}
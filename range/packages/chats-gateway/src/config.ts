/**
 * chats-gateway — configuration.
 *
 * Every knob is an environment variable. No port, no upstream URL and no
 * credential is hardcoded in the source: the gateway is configured by whoever
 * supervises it (pitchfork daemon, mise task, or a human running it by hand).
 *
 * The ONE required value is `CHATS_GATEWAY_TOKEN`. The gateway refuses to
 * start without it — an unauthenticated front door that proxies three agent
 * surfaces is exactly the thing this package exists to prevent.
 *
 * Secret doctrine
 * ---------------
 * The kappa upstream speaks HTTP Basic auth. Its password is NEVER part of
 * this config object: it is read from the environment at request time through
 * a resolver (see `auth.ts`), so it lives in the process environment only —
 * never in this file, never in a log line, never on disk.
 */

/** Default gateway port. The estate's `ports.env` SSOT owns the real value. */
export const DEFAULT_PORT = 25230

/** Loopback by default: the gateway fronts agent surfaces that are not public. */
export const DEFAULT_BIND = '127.0.0.1'

/** Default upstream for the kimi WebUI (`kimi web` / kap-server). */
export const DEFAULT_KIMI_URL = 'http://127.0.0.1:25126'

/** Default upstream for the kappa server that hosts the Kappa Console. */
export const DEFAULT_KAPPA_URL = 'http://127.0.0.1:25159'

/** Default kappa Basic-auth user. Mirrors the kappa server's own default. */
export const DEFAULT_KAPPA_USERNAME = 'kappa'

/** How long an upstream request may take before the gateway calls it dead. */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 8000

/** How long an upstream reachability probe may take. */
export const DEFAULT_PROBE_TIMEOUT_MS = 1500

/** How long a probe result is cached before it is retaken. */
export const DEFAULT_PROBE_TTL_MS = 5000

export type EnvLike = Record<string, string | undefined>

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export interface KimiConfig {
  /** Origin of the kimi web backend, e.g. `http://127.0.0.1:25126`. */
  url: string
  /**
   * Bearer token the kimi backend expects. When set, the gateway swaps the
   * caller's gateway token for this one on the way upstream. When unset the
   * caller's token is NOT forwarded — see `auth.ts` for why.
   */
  token?: string
}

export interface KappaConfig {
  /** Origin of the kappa server, e.g. `http://127.0.0.1:25159`. */
  url: string
  /** Basic-auth user. Defaults to `kappa`, matching the kappa server. */
  username: string
}

export interface TauConfig {
  /**
   * Base URL of a collab-web client to embed in the tau tab. Optional: when
   * unset the tau tab explains how to host a session instead of pretending.
   */
  collabUrl?: string
  /**
   * Path to the `tau` binary, used to list live local collab hosts
   * (`tau collab list --json`). Optional.
   */
  bin?: string
}

export interface GatewayConfig {
  /** Interface to bind. Loopback unless the operator says otherwise. */
  bind: string
  /** TCP port to listen on. */
  port: number
  /** The single bearer token that guards every route but `/health`. */
  token: string
  /** Per-request budget for an upstream call. */
  upstreamTimeoutMs: number
  /** Per-probe budget for an upstream reachability check. */
  probeTimeoutMs: number
  /** How long a reachability result is reused. */
  probeTtlMs: number
  kimi: KimiConfig
  kappa: KappaConfig
  tau: TauConfig
}

function trimmed(env: EnvLike, key: string): string | undefined {
  const raw = env[key]
  if (raw === undefined) return undefined
  const value = raw.trim()
  return value === '' ? undefined : value
}

function numberEnv(env: EnvLike, key: string, fallback: number): number {
  const raw = trimmed(env, key)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConfigError(
      `${key} must be a positive number (got ${JSON.stringify(raw)})`
    )
  }
  return Math.floor(value)
}

/**
 * Port from the environment.
 *
 * `0` is allowed and means "let the OS pick a free port" — useful for tests
 * and for a supervised daemon that wants to fail over rather than collide.
 */
function portEnv(env: EnvLike, key: string, fallback: number): number {
  const raw = trimmed(env, key)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new ConfigError(
      `${key} must be a port between 0 and 65535 (got ${JSON.stringify(raw)})`
    )
  }
  return value
}

/** Strip a trailing slash so upstream origins concatenate cleanly. */
export function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * Build the gateway configuration from an environment.
 *
 * Throws `ConfigError` when `CHATS_GATEWAY_TOKEN` is missing — the gateway
 * must never come up without a token.
 */
export function loadConfig(env: EnvLike = process.env): GatewayConfig {
  const token = trimmed(env, 'CHATS_GATEWAY_TOKEN')
  if (!token) {
    throw new ConfigError(
      'CHATS_GATEWAY_TOKEN is required — the chats-gateway refuses to start without a token. ' +
        'Generate one with: openssl rand -base64 32'
    )
  }

  return {
    bind: trimmed(env, 'CHATS_GATEWAY_BIND') ?? DEFAULT_BIND,
    port: portEnv(env, 'CHATS_GATEWAY_PORT', DEFAULT_PORT),
    token,
    upstreamTimeoutMs: numberEnv(
      env,
      'CHATS_GATEWAY_UPSTREAM_TIMEOUT_MS',
      DEFAULT_UPSTREAM_TIMEOUT_MS
    ),
    probeTimeoutMs: numberEnv(
      env,
      'CHATS_GATEWAY_PROBE_TIMEOUT_MS',
      DEFAULT_PROBE_TIMEOUT_MS
    ),
    probeTtlMs: numberEnv(
      env,
      'CHATS_GATEWAY_PROBE_TTL_MS',
      DEFAULT_PROBE_TTL_MS
    ),
    kimi: {
      url: normalizeOrigin(trimmed(env, 'KIMI_CODE_URL') ?? DEFAULT_KIMI_URL),
      token: trimmed(env, 'KIMI_CODE_TOKEN'),
    },
    kappa: {
      url: normalizeOrigin(trimmed(env, 'KAPPA_ACP_URL') ?? DEFAULT_KAPPA_URL),
      username: trimmed(env, 'KAPPA_SERVER_USERNAME') ?? DEFAULT_KAPPA_USERNAME,
    },
    tau: {
      collabUrl: trimmed(env, 'TAU_COLLAB_URL'),
      bin: trimmed(env, 'TAU_COLLAB_BIN'),
    },
  }
}

/**
 * Names of every environment variable the gateway reads.
 *
 * Used by the README and by `/health` (names only — never values, and never
 * a secret) so the configuration surface stays discoverable.
 */
export const ENV_VARS = [
  'CHATS_GATEWAY_PORT',
  'CHATS_GATEWAY_BIND',
  'CHATS_GATEWAY_TOKEN',
  'CHATS_GATEWAY_UPSTREAM_TIMEOUT_MS',
  'CHATS_GATEWAY_PROBE_TIMEOUT_MS',
  'CHATS_GATEWAY_PROBE_TTL_MS',
  'KIMI_CODE_URL',
  'KIMI_CODE_TOKEN',
  'KAPPA_ACP_URL',
  'KAPPA_SERVER_USERNAME',
  'KAPPA_SERVER_PASSWORD',
  'TAU_COLLAB_URL',
  'TAU_COLLAB_BIN',
] as const

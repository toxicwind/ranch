/**
 * kappa — the Kappa adapter.
 *
 * The kappa server exposes its sessions over HTTP:
 *
 * - `GET /session`        → the session list (an array of session objects)
 * - `GET /session/status` → `{ [sessionId]: { type: 'idle' | 'busy' | ... } }`
 * - `GET /api/health`     → `{ healthy: true }`
 *
 * The server is Basic-auth protected. The password is read from the runtime
 * environment *at request time* and is never stored, logged or written to
 * disk by this package.
 *
 * When the server is unreachable, the list is empty and the health says
 * `unavailable` — the adapter never invents sessions.
 */

import type { Runtime } from '../runtime.ts'
import { joinUrl, primarySurfaceForAgent } from '../surfaces.ts'
import type {
  AgentAdapter,
  RunningChat,
  SurfaceHealth,
  SurfaceRef,
} from '../types.ts'

export interface KappaAdapterOptions {
  readonly runtime: Runtime
  /** Override the surface resolved from the registry. */
  readonly surface?: SurfaceRef | null
  /** Basic-auth user name. */
  readonly username?: string
  /** Environment variable that holds the server password. */
  readonly passwordEnv?: string
  /** Per-request timeout in milliseconds. */
  readonly timeoutMs?: number
}

const DEFAULT_USERNAME = 'kappa'
const DEFAULT_PASSWORD_ENV = 'KAPPA_SERVER_PASSWORD'
const DEFAULT_TIMEOUT_MS = 5_000

/** Build a Basic authorization header value. */
export function encodeBasicAuth(user: string, password: string): string {
  const raw = `${user}:${password}`
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${globalThis.btoa(binary)}`
}

/** A kappa session as returned by `GET /session`. */
export interface KappaSession {
  readonly id: string
  readonly title: string
  readonly directory: string | null
  readonly created: number | null
  readonly updated: number | null
}

function readTime(source: Record<string, unknown>, key: string): number | null {
  const time = source['time']
  if (typeof time !== 'object' || time === null) return null
  const value = (time as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Parse one entry of the `GET /session` payload. */
export function parseKappaSession(raw: unknown): KappaSession | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const id = record['id']
  if (typeof id !== 'string' || !id) return null
  const title = typeof record['title'] === 'string' ? record['title'] : id
  const directory =
    typeof record['directory'] === 'string'
      ? record['directory']
      : typeof record['path'] === 'string'
        ? record['path']
        : null
  return {
    id,
    title,
    directory,
    created: readTime(record, 'created'),
    updated: readTime(record, 'updated'),
  }
}

/** Parse the whole `GET /session` payload. */
export function parseKappaSessions(raw: unknown): KappaSession[] {
  if (!Array.isArray(raw)) return []
  const out: KappaSession[] = []
  for (const entry of raw) {
    const session = parseKappaSession(entry)
    if (session) out.push(session)
  }
  return out
}

/**
 * Parse the `GET /session/status` payload into the set of busy sessions.
 *
 * A kappa session is busy while its status is `busy` or `retry`; every other
 * status (`idle`, `offline`, `scheduled`) means the session is not running.
 */
export function parseBusySessionIds(raw: unknown): Set<string> {
  const busy = new Set<string>()
  if (typeof raw !== 'object' || raw === null) return busy
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue
    const type = (value as Record<string, unknown>)['type']
    if (type === 'busy' || type === 'retry') busy.add(id)
  }
  return busy
}

function toIso(value: number | null): string | null {
  if (value === null) return null
  try {
    return new Date(value).toISOString()
  } catch {
    return null
  }
}

/** Create the Kappa adapter. */
export function createKappaAdapter(options: KappaAdapterOptions): AgentAdapter {
  const { runtime } = options
  const username = options.username ?? DEFAULT_USERNAME
  const passwordEnv = options.passwordEnv ?? DEFAULT_PASSWORD_ENV
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const resolveSurface = (): SurfaceRef | null =>
    options.surface === undefined ? primarySurfaceForAgent('kappa') : options.surface

  const request = async (
    surface: SurfaceRef | null,
    path: string
  ): Promise<{
    ok: boolean
    status: number
    body: string
    error: string | null
  }> => {
    const origin = surface?.baseUrl ?? null
    if (!origin) {
      return {
        ok: false,
        status: 0,
        body: '',
        error: 'the surface has no base url',
      }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await runtime.fetch(joinUrl(origin, path), {
        method: 'GET',
        headers: requestHeaders(surface),
        signal: controller.signal,
      })
      const body = await response.text()
      return {
        ok: response.ok,
        status: response.status,
        body,
        error: null,
      }
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: '',
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      clearTimeout(timer)
    }
  }

  const requestHeaders = (
    surface: SurfaceRef | null
  ): Record<string, string> => {
    const out: Record<string, string> = { accept: 'application/json' }
    if (surface?.authMode !== 'basic') return out
    const password = runtime.env[passwordEnv]
    if (!password) return out
    out['authorization'] = encodeBasicAuth(username, password)
    return out
  }

  return {
    agent: 'kappa',

    async list(): Promise<RunningChat[]> {
      const surface = resolveSurface()
      if (!surface) return []

      const sessions = await request(surface, surface.apiPath ?? '/session')
      if (!sessions.ok) return []

      let payload: unknown
      try {
        payload = JSON.parse(sessions.body)
      } catch {
        return []
      }
      const parsed = parseKappaSessions(payload)
      if (parsed.length === 0) return []

      const statusResponse = await request(surface, '/session/status')
      let busy = new Set<string>()
      if (statusResponse.ok) {
        try {
          busy = parseBusySessionIds(JSON.parse(statusResponse.body))
        } catch {
          busy = new Set<string>()
        }
      }

      return parsed.map((session) => {
        const chat: RunningChat = {
          id: session.id,
          agent: 'kappa',
          source: 'kappa',
          title: session.title,
          status: busy.has(session.id) ? 'live' : 'idle',
          updatedAt:
            toIso(session.updated) ?? new Date(runtime.now()).toISOString(),
          startedAt: toIso(session.created),
          surface,
        }
        return {
          ...chat,
          projectPath: session.directory ?? undefined,
          webUrl: surface.webUrl ?? undefined,
        }
      })
    },

    async health(): Promise<SurfaceHealth> {
      const checkedAt = new Date(runtime.now()).toISOString()
      const surface = resolveSurface()
      if (!surface) {
        return {
          agent: 'kappa',
          surfaceId: null,
          status: 'unavailable',
          reachable: false,
          healthy: false,
          detail: 'the surface registry has no kappa surface',
          checkedAt,
          surface: null,
        }
      }
      const response = await request(
        surface,
        surface.healthPath ?? '/api/health'
      )
      if (response.error !== null) {
        return {
          agent: 'kappa',
          surfaceId: surface.id,
          status: 'unavailable',
          reachable: false,
          healthy: false,
          detail: `the kappa server did not answer: ${response.error}`,
          checkedAt,
          surface,
        }
      }
      if (!response.ok) {
        return {
          agent: 'kappa',
          surfaceId: surface.id,
          status: 'idle',
          reachable: true,
          healthy: false,
          detail: `the kappa server answered with HTTP ${response.status}`,
          checkedAt,
          surface,
        }
      }
      let healthy = true
      try {
        const payload = JSON.parse(response.body) as unknown
        if (typeof payload === 'object' && payload !== null) {
          const value = (payload as Record<string, unknown>)['healthy']
          if (typeof value === 'boolean') healthy = value
        }
      } catch {
        healthy = false
      }
      return {
        agent: 'kappa',
        surfaceId: surface.id,
        status: healthy ? 'live' : 'idle',
        reachable: true,
        healthy,
        detail: healthy
          ? 'the kappa server is healthy'
          : 'the kappa server answered but did not report itself healthy',
        checkedAt,
        surface,
      }
    },
  }
}

/**
 * kimi — the Kimi adapter.
 *
 * `kimi web` serves the Kimi SPA and a REST/WS API under `/api/v1`, behind a
 * persistent bearer token that the server writes to
 * `<KIMI_CODE_HOME>/server.token` (0600) on first boot.
 *
 * Every response is the envelope `{ code, msg, data }`; `code === 0` means ok.
 *
 * Kimi is not installed on every machine. When the token file is missing the
 * adapter reports the surface as `unavailable` and returns an empty list —
 * it never fabricates sessions for an agent that is not there.
 */

import type { Runtime } from '../runtime.ts'
import { joinUrl, primarySurfaceForAgent } from '../surfaces.ts'
import type {
  AgentAdapter,
  RunningChat,
  SurfaceHealth,
  SurfaceRef,
} from '../types.ts'

export interface KimiAdapterOptions {
  readonly runtime: Runtime
  /** Override the surface resolved from the registry. */
  readonly surface?: SurfaceRef | null
  /** Override the kimi home directory. */
  readonly homeDir?: string
  /** Override the name of the bearer token file inside the home directory. */
  readonly tokenFile?: string
  /** Per-request timeout in milliseconds. */
  readonly timeoutMs?: number
}

const DEFAULT_TOKEN_FILE = 'server.token'
const DEFAULT_TIMEOUT_MS = 5_000

/** Where the kimi home directory lives. */
export function resolveKimiHomeDir(
  runtime: Runtime,
  override?: string
): string {
  if (override) return override
  const fromEnv = runtime.env['KIMI_CODE_HOME']
  if (fromEnv) return fromEnv
  const home = runtime.env['HOME'] ?? '~'
  return `${home}/.kimi-code`
}

/** The path of the kimi server bearer token. */
export function resolveKimiTokenPath(
  runtime: Runtime,
  options: { readonly homeDir?: string; readonly tokenFile?: string } = {}
): string {
  const file = options.tokenFile ?? DEFAULT_TOKEN_FILE
  return `${resolveKimiHomeDir(runtime, options.homeDir)}/${file}`
}

/** A kimi session as returned by `GET /api/v1/sessions`. */
export interface KimiSession {
  readonly id: string
  readonly title: string
  readonly busy: boolean
  readonly updatedAt: number | null
  readonly createdAt: number | null
  readonly projectPath: string | null
  readonly messageCount: number | null
}

function readString(
  source: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value) return value
  }
  return null
}

function readNumber(
  source: Record<string, unknown>,
  keys: readonly string[]
): number | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

/** Parse one entry of the `data.items` array of `GET /api/v1/sessions`. */
export function parseKimiSession(raw: unknown): KimiSession | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const id = record['id']
  if (typeof id !== 'string' || !id) return null
  const title = readString(record, ['title', 'name', 'summary']) ?? id
  const busy = record['busy'] === true
  const updated = readNumber(record, [
    'updated_at',
    'updatedAt',
    'last_active_at',
  ])
  const created = readNumber(record, ['created_at', 'createdAt'])
  const project = readString(record, [
    'workspace_path',
    'workspacePath',
    'cwd',
    'directory',
  ])
  const messages = readNumber(record, ['message_count', 'messageCount'])
  return {
    id,
    title,
    busy,
    updatedAt: updated,
    createdAt: created,
    projectPath: project,
    messageCount: messages,
  }
}

/** The envelope every kimi API response uses. */
export interface KimiEnvelope {
  readonly code: number
  readonly msg: string | null
  readonly data: unknown
}

/** Parse the kimi envelope. Returns null when the payload is not an envelope. */
export function parseKimiEnvelope(raw: unknown): KimiEnvelope | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const code = record['code']
  if (typeof code !== 'number') return null
  const msg = typeof record['msg'] === 'string' ? record['msg'] : null
  return { code, msg, data: record['data'] }
}

/** Parse the session list out of a kimi envelope. */
export function parseKimiSessions(raw: unknown): KimiSession[] {
  const envelope = parseKimiEnvelope(raw)
  if (!envelope || envelope.code !== 0) return []
  const data = envelope.data
  if (typeof data !== 'object' || data === null) return []
  const items = (data as Record<string, unknown>)['items']
  if (!Array.isArray(items)) return []
  const out: KimiSession[] = []
  for (const item of items) {
    const session = parseKimiSession(item)
    if (session) out.push(session)
  }
  return out
}

function toIso(value: number | null): string | null {
  if (value === null) return null
  const ms = value > 1e12 ? value : value * 1000
  try {
    return new Date(ms).toISOString()
  } catch {
    return null
  }
}

/** Create the Kimi adapter. */
export function createKimiAdapter(options: KimiAdapterOptions): AgentAdapter {
  const { runtime } = options
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const resolveSurface = (): SurfaceRef | null =>
    options.surface === undefined ? primarySurfaceForAgent('kimi') : options.surface

  const readToken = async (): Promise<string | null> => {
    const path = resolveKimiTokenPath(runtime, {
      homeDir: options.homeDir,
      tokenFile: options.tokenFile,
    })
    try {
      const exists = await runtime.fs.exists(path)
      if (!exists) return null
      const text = await runtime.fs.readFile(path)
      const token = text.trim()
      return token ? token : null
    } catch {
      return null
    }
  }

  const request = async (
    surface: SurfaceRef | null,
    path: string,
    token: string | null
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
    const requestHeaders: Record<string, string> = {
      accept: 'application/json',
    }
    if (token) requestHeaders['authorization'] = `Bearer ${token}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await runtime.fetch(joinUrl(origin, path), {
        method: 'GET',
        headers: requestHeaders,
        signal: controller.signal,
      })
      const body = await response.text()
      return { ok: response.ok, status: response.status, body, error: null }
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

  return {
    agent: 'kimi',

    async list(): Promise<RunningChat[]> {
      const surface = resolveSurface()
      if (!surface) return []

      const token = await readToken()
      if (!token) return []

      const response = await request(
        surface,
        surface.apiPath ?? '/api/v1/sessions',
        token
      )
      if (!response.ok) return []

      let payload: unknown
      try {
        payload = JSON.parse(response.body)
      } catch {
        return []
      }
      const parsed = parseKimiSessions(payload)
      if (parsed.length === 0) return []

      return parsed.map((session) => {
        const chat: RunningChat = {
          id: session.id,
          agent: 'kimi',
          source: 'kimi',
          title: session.title,
          status: session.busy ? 'live' : 'idle',
          updatedAt:
            toIso(session.updatedAt) ?? new Date(runtime.now()).toISOString(),
          startedAt: toIso(session.createdAt),
          surface,
        }
        return {
          ...chat,
          projectPath: session.projectPath ?? undefined,
          messageCount: session.messageCount ?? undefined,
          webUrl: surface.webUrl ?? undefined,
        }
      })
    },

    async health(): Promise<SurfaceHealth> {
      const checkedAt = new Date(runtime.now()).toISOString()
      const surface = resolveSurface()
      if (!surface) {
        return {
          agent: 'kimi',
          surfaceId: null,
          status: 'unavailable',
          reachable: false,
          healthy: false,
          detail: 'the surface registry has no kimi surface',
          checkedAt,
          surface: null,
        }
      }

      const tokenPath = resolveKimiTokenPath(runtime, {
        homeDir: options.homeDir,
        tokenFile: options.tokenFile,
      })
      const token = await readToken()
      if (!token) {
        return {
          agent: 'kimi',
          surfaceId: surface.id,
          status: 'unavailable',
          reachable: false,
          healthy: false,
          detail: `kimi-code is not installed: no server token at ${tokenPath}`,
          checkedAt,
          surface,
        }
      }

      const response = await request(
        surface,
        surface.healthPath ?? '/api/v1/healthz',
        token
      )
      if (response.error !== null) {
        return {
          agent: 'kimi',
          surfaceId: surface.id,
          status: 'unavailable',
          reachable: false,
          healthy: false,
          detail: `the kimi server did not answer: ${response.error}`,
          checkedAt,
          surface,
        }
      }
      if (!response.ok) {
        return {
          agent: 'kimi',
          surfaceId: surface.id,
          status: 'idle',
          reachable: true,
          healthy: false,
          detail: `the kimi server answered with HTTP ${response.status}`,
          checkedAt,
          surface,
        }
      }
      let healthy = true
      try {
        const envelope = parseKimiEnvelope(JSON.parse(response.body))
        if (envelope) healthy = envelope.code === 0
      } catch {
        healthy = false
      }
      return {
        agent: 'kimi',
        surfaceId: surface.id,
        status: healthy ? 'live' : 'idle',
        reachable: true,
        healthy,
        detail: healthy
          ? 'the kimi server is healthy'
          : 'the kimi server answered with an error envelope',
        checkedAt,
        surface,
      }
    },
  }
}

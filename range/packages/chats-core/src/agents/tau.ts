/**
 * tau — the Tau adapter.
 *
 * Tau keeps its chats on disk: one JSONL transcript per session under
 * `~/.tau/agent/sessions/<project-slug>/<timestamp>_<uuid>.jsonl`. There is no
 * HTTP API for the session list, so this adapter reads the store directly.
 *
 * The store is large (tens of gigabytes across the estate), so the adapter
 * never reads a whole transcript to learn its title: it reads a small header
 * and uses the file's mtime for `updatedAt`. A transcript is only read in
 * full when it is small enough to make the message count exact.
 *
 * The web surface of a Tau chat is the collab relay origin published by the
 * registry. Per-chat deep links are minted by `tau collab link <instanceId>`,
 * so a deep link is attached only when the relay actually reports a host for
 * that session — never invented.
 */

import type { Runtime } from '../runtime.ts'
import { primarySurfaceForAgent } from '../surfaces.ts'
import type {
  AgentAdapter,
  RunningChat,
  SurfaceHealth,
  SurfaceRef,
} from '../types.ts'

export interface TauAdapterOptions {
  readonly runtime: Runtime
  /** Override the session store root. */
  readonly sessionsRoot?: string
  /** How many sessions to return, newest first. */
  readonly maxSessions?: number
  /** A session written inside this window counts as live. */
  readonly liveWindowMs?: number
  /** How much of a transcript is read to find the title and the session id. */
  readonly headerBytes?: number
  /** Transcripts at or below this size are read whole, for an exact message count. */
  readonly exactCountBytes?: number
  /** Ask `tau collab list --json` which collab hosts are running. */
  readonly queryCollabHosts?: boolean
}

const DEFAULT_MAX_SESSIONS = 100
const DEFAULT_LIVE_WINDOW_MS = 5 * 60_000
const DEFAULT_HEADER_BYTES = 8_192
const DEFAULT_EXACT_COUNT_BYTES = 256 * 1024

/** The header of a Tau transcript: what the first records say about it. */
export interface TauSessionHeader {
  readonly title: string | null
  readonly titleUpdatedAt: string | null
  readonly sessionId: string | null
  readonly startedAt: string | null
  readonly cwd: string | null
}

/** Where the Tau session store lives. */
export function resolveTauSessionsRoot(
  runtime: Runtime,
  override?: string
): string {
  if (override) return override
  const fromEnv = runtime.env['TAU_SESSIONS_ROOT']
  if (fromEnv) return fromEnv
  const home = runtime.env['HOME'] ?? '~'
  return `${home}/.tau/agent/sessions`
}

/**
 * Read the title, the session id, the start time and the working directory
 * out of a transcript header.
 *
 * A capped read ends mid-line, so unparseable lines are skipped rather than
 * treated as an error.
 */
export function parseTauSessionHeader(text: string): TauSessionHeader {
  let title: string | null = null
  let titleUpdatedAt: string | null = null
  let sessionId: string | null = null
  let startedAt: string | null = null
  let cwd: string | null = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    let record: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(line)
      if (typeof parsed !== 'object' || parsed === null) continue
      record = parsed as Record<string, unknown>
    } catch {
      continue
    }
    const type = record['type']
    if (type === 'title' && title === null) {
      const value = record['title']
      if (typeof value === 'string' && value.trim()) title = value
      if (typeof record['updatedAt'] === 'string')
        titleUpdatedAt = record['updatedAt']
    } else if (type === 'session' && sessionId === null) {
      if (typeof record['id'] === 'string') sessionId = record['id']
      if (typeof record['timestamp'] === 'string')
        startedAt = record['timestamp']
      if (typeof record['cwd'] === 'string') cwd = record['cwd']
    }
    if (title !== null && sessionId !== null) break
  }

  return { title, titleUpdatedAt, sessionId, startedAt, cwd }
}

/** Count the chat messages of a whole transcript. */
export function countTauMessages(text: string): number {
  let count = 0
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as Record<string, unknown>)['type'] === 'message'
      ) {
        count += 1
      }
    } catch {
      continue
    }
  }
  return count
}

/** The session id encoded in a transcript file name. */
export function sessionIdFromFileName(name: string): string | null {
  const match =
    /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/.exec(
      name
    )
  return match?.[1] ?? null
}

/** A collab host as reported by `tau collab list --json`. */
export interface CollabHost {
  readonly sessionId: string | null
  readonly instanceId: string | null
  readonly link: string | null
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

/** Parse one entry of the `hosts` array of `tau collab list --json`. */
export function parseCollabHost(raw: unknown): CollabHost | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  return {
    sessionId: readString(record, [
      'sessionId',
      'session_id',
      'session',
      'path',
      'id',
    ]),
    instanceId: readString(record, [
      'instanceId',
      'instance_id',
      'pid',
      'host',
    ]),
    link: readString(record, ['link', 'url', 'controlUrl', 'control_url']),
  }
}

/** Parse the whole `tau collab list --json` payload. */
export function parseCollabHosts(stdout: string): CollabHost[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const hosts = (parsed as Record<string, unknown>)['hosts']
  if (!Array.isArray(hosts)) return []
  const out: CollabHost[] = []
  for (const raw of hosts) {
    const host = parseCollabHost(raw)
    if (host) out.push(host)
  }
  return out
}

interface SessionFile {
  readonly path: string
  readonly name: string
  readonly size: number
  readonly mtimeMs: number
  readonly project: string
}

async function collectSessionFiles(
  runtime: Runtime,
  root: string
): Promise<SessionFile[]> {
  const files: SessionFile[] = []
  const dirs = await runtime.fs.readDir(root)
  for (const dir of dirs) {
    if (!dir.isDirectory) continue
    const entries = await runtime.fs.readDir(dir.path)
    for (const entry of entries) {
      if (entry.isDirectory) continue
      if (!entry.name.endsWith('.jsonl')) continue
      files.push({
        path: entry.path,
        name: entry.name,
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        project: dir.name,
      })
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files
}

async function listCollabHosts(runtime: Runtime): Promise<CollabHost[]> {
  try {
    const result = await runtime.exec('tau', ['collab', 'list', '--json'], {
      timeoutMs: 5_000,
    })
    if (result.code !== 0) return []
    return parseCollabHosts(result.stdout)
  } catch {
    return []
  }
}

/** Create the Tau adapter. */
export function createTauAdapter(options: TauAdapterOptions): AgentAdapter {
  const { runtime } = options
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS
  const liveWindowMs = options.liveWindowMs ?? DEFAULT_LIVE_WINDOW_MS
  const headerBytes = options.headerBytes ?? DEFAULT_HEADER_BYTES
  const exactCountBytes = options.exactCountBytes ?? DEFAULT_EXACT_COUNT_BYTES
  const queryCollabHosts = options.queryCollabHosts ?? true

  const resolveSurface = (): SurfaceRef | null => primarySurfaceForAgent('tau')

  return {
    agent: 'tau',

    async list(): Promise<RunningChat[]> {
      const surface = resolveSurface()
      if (!surface) return []

      const root = resolveTauSessionsRoot(runtime, options.sessionsRoot)
      let files: SessionFile[]
      try {
        files = await collectSessionFiles(runtime, root)
      } catch {
        return []
      }
      if (files.length === 0) return []

      const selected = files.slice(0, maxSessions)
      const hosts = queryCollabHosts ? await listCollabHosts(runtime) : []
      const now = runtime.now()
      const chats: RunningChat[] = []

      for (const file of selected) {
        let text: string
        try {
          text = await runtime.fs.readFile(file.path, { maxBytes: headerBytes })
        } catch {
          continue
        }
        const header = parseTauSessionHeader(text)
        const id = header.sessionId ?? sessionIdFromFileName(file.name)
        if (!id) continue

        let messageCount: number | undefined
        if (file.size <= exactCountBytes) {
          try {
            const whole = await runtime.fs.readFile(file.path)
            messageCount = countTauMessages(whole)
          } catch {
            messageCount = undefined
          }
        }

        const host = hosts.find((entry) => entry.sessionId === id) ?? null
        const live = host !== null || now - file.mtimeMs <= liveWindowMs
        const updatedAt = new Date(file.mtimeMs).toISOString()

        const chat: RunningChat = {
          id,
          agent: 'tau',
          source: 'tau',
          title: header.title ?? id,
          status: live ? 'live' : 'idle',
          updatedAt,
          startedAt: header.startedAt,
          projectPath: header.cwd ?? file.project,
          surface,
        }
        chats.push(
          host?.link
            ? {
                ...chat,
                messageCount,
                deepLink: host.link,
                webUrl: surface.webUrl ?? undefined,
              }
            : { ...chat, messageCount, webUrl: surface.webUrl ?? undefined }
        )
      }

      return chats
    },

    async health(): Promise<SurfaceHealth> {
      const checkedAt = new Date(runtime.now()).toISOString()
      const surface = resolveSurface()
      if (!surface) {
        return {
          agent: 'tau',
          surfaceId: null,
          status: 'unavailable',
          reachable: false,
          healthy: false,
          detail: 'the surface registry has no tau surface',
          checkedAt,
          surface: null,
        }
      }
      const root = resolveTauSessionsRoot(runtime, options.sessionsRoot)
      let exists = false
      try {
        exists = await runtime.fs.exists(root)
      } catch {
        exists = false
      }
      if (!exists) {
        return {
          agent: 'tau',
          surfaceId: surface.id,
          status: 'unavailable',
          reachable: false,
          healthy: false,
          detail: `the tau session store is not readable at ${root}`,
          checkedAt,
          surface,
        }
      }
      return {
        agent: 'tau',
        surfaceId: surface.id,
        status: 'live',
        reachable: true,
        healthy: true,
        detail: `the tau session store is readable at ${root}`,
        checkedAt,
        surface,
      }
    },
  }
}

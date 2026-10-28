/**
 * testing — a fake runtime, so every adapter can be exercised without a
 * filesystem, a subprocess or a network.
 */

import type {
  DirEntry,
  ExecApi,
  ExecResult,
  FileSystemApi,
  FetchApi,
  HttpResponseLike,
  Runtime,
} from '../runtime.ts'

export interface FakeEntry {
  /** Full path of the entry. */
  readonly path: string
  readonly isDirectory?: boolean
  readonly mtimeMs?: number
  /** File content. Directories have none. */
  readonly content?: string
}

export interface FakeResponse {
  readonly status: number
  readonly body: string
  /** When set, the request rejects with this message instead of answering. */
  readonly error?: string
}

export interface FakeExecResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export interface FakeRuntimeOptions {
  readonly entries?: readonly FakeEntry[]
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly now?: number
  /** Responses keyed by request url. */
  readonly responses?: Readonly<Record<string, FakeResponse>>
  /** Results keyed by `command arg arg`. */
  readonly exec?: Readonly<Record<string, FakeExecResult>>
}

export interface FakeRuntime extends Runtime {
  /** Every url that was requested. */
  readonly fetched: string[]
  /** Every command line that was executed. */
  readonly executed: string[]
  /** Every request header bag, keyed by url. */
  readonly requestHeaders: Map<string, Record<string, string>>
}

function parentOf(path: string): string {
  const index = path.lastIndexOf('/')
  if (index <= 0) return '/'
  return path.slice(0, index)
}

/** Build a runtime backed by in-memory fixtures. */
export function createFakeRuntime(
  options: FakeRuntimeOptions = {}
): FakeRuntime {
  const entries = options.entries ?? []
  const now = options.now ?? 1_700_000_000_000
  const fetched: string[] = []
  const executed: string[] = []
  const requestHeaders = new Map<string, Record<string, string>>()

  const fs: FileSystemApi = {
    async readDir(path: string): Promise<DirEntry[]> {
      const out: DirEntry[] = []
      for (const entry of entries) {
        if (parentOf(entry.path) !== path) continue
        const name = entry.path.slice(path === '/' ? 1 : path.length + 1)
        out.push({
          name,
          path: entry.path,
          isDirectory: entry.isDirectory ?? false,
          size: entry.content?.length ?? 0,
          mtimeMs: entry.mtimeMs ?? now,
        })
      }
      return out
    },

    async readFile(
      path: string,
      readOptions?: { readonly maxBytes?: number }
    ): Promise<string> {
      const entry = entries.find((candidate) => candidate.path === path)
      if (!entry || entry.content === undefined) {
        throw new Error(`no such file: ${path}`)
      }
      const max = readOptions?.maxBytes
      return max === undefined ? entry.content : entry.content.slice(0, max)
    },

    async exists(path: string): Promise<boolean> {
      return entries.some((entry) => entry.path === path)
    },
  }

  const execImpl: ExecApi = async (
    command: string,
    args: readonly string[]
  ): Promise<ExecResult> => {
    const key = [command, ...args].join(' ')
    executed.push(key)
    const result = options.exec?.[key]
    if (!result) {
      return { code: 127, stdout: '', stderr: `command not found: ${key}` }
    }
    return result
  }

  const fetchImpl: FetchApi = async (
    url: string,
    init?: { readonly headers?: Record<string, string> }
  ): Promise<HttpResponseLike> => {
    fetched.push(url)
    if (init?.headers) requestHeaders.set(url, init.headers)
    const response = options.responses?.[url]
    if (!response) throw new Error(`no route for ${url}`)
    if (response.error) throw new Error(response.error)
    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      text: async () => response.body,
    }
  }

  return {
    fs,
    exec: execImpl,
    fetch: fetchImpl,
    env: options.env ?? {},
    now: () => now,
    fetched,
    executed,
    requestHeaders,
  }
}

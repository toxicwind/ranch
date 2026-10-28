/**
 * runtime — the injectable capability surface the adapters run on.
 *
 * The adapters never import `node:fs`, `node:child_process` or the global
 * `fetch` directly. They take a `Runtime`, which keeps the whole package
 * browser-safe (the control-plane SPA can import the types and the surface
 * registry loader) and makes every adapter trivially testable with a fake.
 *
 * `src/node.ts` provides the real Node implementation.
 */

/** One entry of a directory listing. */
export interface DirEntry {
  readonly name: string
  readonly path: string
  readonly isDirectory: boolean
  readonly size: number
  /** Modification time in epoch milliseconds. */
  readonly mtimeMs: number
}

export interface FileSystemApi {
  /** List a directory. Missing directories resolve to an empty list. */
  readDir(path: string): Promise<DirEntry[]>
  /**
   * Read a file as UTF-8.
   *
   * `maxBytes` caps how much is read from the start of the file; the adapter
   * uses it to pull a small header out of a very large session log.
   */
  readFile(
    path: string,
    options?: { readonly maxBytes?: number }
  ): Promise<string>
  /** True when the path exists. */
  exists(path: string): Promise<boolean>
}

export interface ExecResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export interface ExecOptions {
  readonly timeoutMs?: number
}

export type ExecApi = (
  command: string,
  args: readonly string[],
  options?: ExecOptions
) => Promise<ExecResult>

export interface HttpRequestInit {
  readonly method?: string
  readonly headers?: Record<string, string>
  readonly body?: string
  /** An abort signal, or anything the runtime understands as one. */
  readonly signal?: unknown
}

export interface HttpResponseLike {
  readonly status: number
  readonly ok: boolean
  text(): Promise<string>
}

export type FetchApi = (
  url: string,
  init?: HttpRequestInit
) => Promise<HttpResponseLike>

export interface Runtime {
  readonly fs: FileSystemApi
  readonly exec: ExecApi
  readonly fetch: FetchApi
  /** Process environment. Secrets are read from here at call time, never stored. */
  readonly env: Record<string, string | undefined>
  /** Current epoch milliseconds. */
  readonly now: () => number
}

/**
 * node — the Node implementation of the injectable runtime.
 *
 * This is the only module in the package that touches `node:fs`,
 * `node:child_process` or the global `fetch`. It is a separate entry point
 * (`@ranch/chats-core/node`) so the browser-safe core can be bundled into
 * the control-plane SPA without dragging Node built-ins along.
 */

import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  DirEntry,
  ExecApi,
  ExecResult,
  FileSystemApi,
  FetchApi,
  HttpResponseLike,
  Runtime,
} from './runtime.ts'

const fs: FileSystemApi = {
  async readDir(path: string): Promise<DirEntry[]> {
    let names: string[]
    try {
      names = await readdir(path)
    } catch {
      return []
    }
    const out: DirEntry[] = []
    for (const name of names) {
      const full = join(path, name)
      let info: Awaited<ReturnType<typeof stat>>
      try {
        info = await stat(full)
      } catch {
        continue
      }
      out.push({
        name,
        path: full,
        isDirectory: info.isDirectory(),
        size: info.size,
        mtimeMs: info.mtimeMs,
      })
    }
    return out
  },

  async readFile(
    path: string,
    options?: { readonly maxBytes?: number }
  ): Promise<string> {
    if (options?.maxBytes === undefined) return readFile(path, 'utf8')
    const handle = await (await import('node:fs/promises')).open(path, 'r')
    try {
      const buffer = Buffer.alloc(options.maxBytes)
      const { bytesRead } = await handle.read(buffer, 0, options.maxBytes, 0)
      return buffer.subarray(0, bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
  },

  async exists(path: string): Promise<boolean> {
    try {
      await stat(path)
      return true
    } catch {
      return false
    }
  },
}

const exec: ExecApi = (
  command: string,
  args: readonly string[],
  options?: { readonly timeoutMs?: number }
): Promise<ExecResult> =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      {
        timeout: options?.timeoutMs ?? 5_000,
        maxBuffer: 8 * 1024 * 1024,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout: String(stdout), stderr: String(stderr) })
          return
        }
        const code =
          typeof (error as { code?: unknown }).code === 'number'
            ? (error as { code: number }).code
            : 1
        resolve({
          code,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
        })
      }
    )
  })

const fetchImpl: FetchApi = async (url, init): Promise<HttpResponseLike> => {
  const globalFetch = (
    globalThis as {
      fetch?: (
        input: string,
        requestInit?: {
          method?: string
          headers?: Record<string, string>
          body?: string
          signal?: unknown
        }
      ) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>
    }
  ).fetch
  if (!globalFetch) throw new Error('this runtime has no global fetch')
  const response = await globalFetch(url, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
    signal: init?.signal as AbortSignal | undefined,
  })
  return {
    status: response.status,
    ok: response.ok,
    text: () => response.text(),
  }
}

/** The real runtime: this machine's filesystem, processes and network. */
export const nodeRuntime: Runtime = {
  fs,
  exec,
  fetch: fetchImpl,
  env: process.env,
  now: () => Date.now(),
}

/**
 * chats-gateway — the upstream side of the proxy.
 *
 * Two things happen here that are easy to get wrong and therefore deserve
 * their own module:
 *
 *   1. Credential translation. The gateway token that the browser presents is
 *      swapped for the upstream's own credential, and the browser's token is
 *      never forwarded upstream (see `auth.ts`).
 *   2. Path translation. The agent SPAs are built with root-absolute URLs, so
 *      a response served under `/kappa` or `/kimi` still asks for `/console/…`
 *      or `/api/v1/…`. Those are rewritten to the gateway prefix — and when
 *      the rewritten HTML carries a Content-Security-Policy with an inline
 *      script hash, the hash is recomputed, because a stale hash would block
 *      the very script the page needs.
 */

import { createHash } from 'node:crypto'
import type { ServerWebSocket } from 'bun'
import {
  backendWsProtocol,
  buildUpstreamHeaders,
  stripTokenParam,
  type UpstreamAuth,
} from './auth.ts'
import type { PathRewrite } from './surfaces.ts'

/** Thrown when an upstream could not be reached at all. */
export class UpstreamUnavailableError extends Error {
  constructor(
    message: string,
    readonly upstream: string
  ) {
    super(message)
    this.name = 'UpstreamUnavailableError'
  }
}

/** Content types whose bodies are rewritten to re-point absolute paths. */
const REWRITABLE =
  /^(text\/html|text\/javascript|application\/javascript|text\/css)/i

/** Characters that may precede an absolute path inside a quoted string. */
const PATH_BOUNDARY = /(["'`=(])/g

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Re-point root-absolute paths at the gateway prefix.
 *
 * Only quoted or attribute-anchored occurrences are rewritten, so a path
 * that merely appears inside prose is left alone.
 */
export function rewriteBody(body: string, rewrites: PathRewrite[]): string {
  let out = body
  for (const rule of rewrites) {
    if (!rule.from || rule.from === rule.to) continue
    const pattern = new RegExp(
      `${PATH_BOUNDARY.source}${escapeRegExp(rule.from)}`,
      'g'
    )
    out = out.replace(pattern, `$1${rule.to}`)
  }
  return out
}

/**
 * Hash of the inline theme-preload script, the same element the kappa server
 * hashes when it builds its Content-Security-Policy.
 */
export function inlineScriptHash(html: string): string | null {
  const match = html.match(
    /<script\b(?![^>]*\bsrc\s*=)[^>]*\bid=(['"])oc-theme-preload-script\1[^>]*>([\s\S]*?)<\/script>/i
  )
  if (!match) return null
  return `sha256-${createHash('sha256')
    .update(match[2] ?? '')
    .digest('base64')}`
}

/**
 * Keep a Content-Security-Policy valid after the body was rewritten.
 *
 * The policy pins the inline script by hash. Rewriting the document can
 * change that script, so the old hash is replaced by the new one. When the
 * script was untouched both hashes are equal and the policy is unchanged.
 */
export function recomputeCsp(
  csp: string,
  before: string,
  after: string
): string {
  const oldHash = inlineScriptHash(before)
  if (!oldHash || !csp.includes(oldHash)) return csp
  const newHash = inlineScriptHash(after)
  if (!newHash) return csp
  return csp.replace(oldHash, newHash)
}

export interface ProxyHttpOptions {
  req: Request
  url: URL
  /** Upstream origin, e.g. `http://127.0.0.1:25159`. */
  origin: string
  /** Path to request on the upstream. */
  upstreamPath: string
  auth: UpstreamAuth
  rewrites: PathRewrite[]
  timeoutMs: number
  fetchImpl?: typeof fetch
}

/**
 * Forward one request to an upstream and translate the response.
 *
 * Throws `UpstreamUnavailableError` when the upstream cannot be reached, so
 * the caller can render an honest "surface unavailable" page instead of a
 * stack trace.
 */
export async function proxyHttp(opts: ProxyHttpOptions): Promise<Response> {
  const target = `${opts.origin}${opts.upstreamPath}${stripTokenParam(opts.url.search)}`
  const headers = buildUpstreamHeaders(opts.req, opts.auth)
  const doFetch = opts.fetchImpl ?? fetch

  let response: Response
  try {
    response = await doFetch(target, {
      method: opts.req.method,
      headers,
      body: opts.req.body,
      // Required when forwarding a stream body.
      duplex: 'half',
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs),
    } as RequestInit)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new UpstreamUnavailableError(detail, target)
  }

  if (opts.rewrites.length === 0) return response

  const contentType = response.headers.get('content-type') ?? ''
  if (!REWRITABLE.test(contentType)) return response

  let original: string
  try {
    original = await response.text()
  } catch {
    return response
  }
  const rewritten = rewriteBody(original, opts.rewrites)
  if (rewritten === original) {
    return new Response(original, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }

  const outHeaders = new Headers(response.headers)
  // The body is now plain and a different length: drop the encoding and let
  // the runtime set the length.
  outHeaders.delete('content-encoding')
  outHeaders.delete('content-length')
  const csp = outHeaders.get('content-security-policy')
  if (csp)
    outHeaders.set(
      'content-security-policy',
      recomputeCsp(csp, original, rewritten)
    )

  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  })
}

export interface RelayOptions {
  client: ServerWebSocket<unknown>
  /** Upstream origin, e.g. `http://127.0.0.1:25126`. */
  origin: string
  /** Path to open on the upstream. */
  upstreamPath: string
  /** Query string of the client request (already token-stripped). */
  search?: string
  /** Bearer token the upstream expects, when the surface swaps tokens. */
  upstreamToken?: string
  /** Extra handshake headers for the upstream (e.g. HTTP Basic auth). */
  headers?: Record<string, string>
  onError?: (message: string) => void
}

/** Copy a Buffer into a standalone ArrayBuffer (DOM WebSocket.send wants one). */
export function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return new Uint8Array(buffer).buffer as ArrayBuffer
}

/** Handle the gateway keeps on the client socket to push messages upstream. */
export interface RelayHandle {
  send: (payload: string | ArrayBuffer) => void
  close: () => void
}

export interface RelayOptions {
  client: ServerWebSocket<unknown>
  /** Upstream origin, e.g. `http://127.0.0.1:25126`. */
  origin: string
  /** Path to open on the upstream. */
  upstreamPath: string
  /** Query string of the client request (already token-stripped). */
  search?: string
  /** Bearer token the upstream expects, when the surface swaps tokens. */
  upstreamToken?: string
  /** Extra handshake headers for the upstream (e.g. HTTP Basic auth). */
  headers?: Record<string, string>
  onError?: (message: string) => void
}

/**
 * Bun's WebSocket constructor accepts an options object (subprotocols and
 * handshake headers); the DOM typings only model the two-argument string
 * form. The cast lives here so the rest of the module stays honest.
 */
const BunWebSocket = WebSocket as unknown as new (
  url: string,
  options?: { protocols?: string[]; headers?: Record<string, string> }
) => WebSocket

/**
 * Relay one client WebSocket to an upstream WebSocket.
 *
 * The bearer subprotocol is swapped for the upstream's own token, mirroring
 * what the HTTP proxy does with the `Authorization` header. Messages that
 * arrive before the upstream handshake completes are queued, never dropped.
 */
export function relayWebSocket(opts: RelayOptions): RelayHandle {
  const wsUrl = `${opts.origin.replace(/^http/, 'ws')}${opts.upstreamPath}${opts.search ?? ''}`
  const protocols = opts.upstreamToken
    ? [backendWsProtocol(opts.upstreamToken)]
    : undefined

  let upstream: WebSocket
  try {
    upstream = new BunWebSocket(wsUrl, {
      ...(protocols ? { protocols } : {}),
      ...(opts.headers ? { headers: opts.headers } : {}),
    })
  } catch (error) {
    opts.onError?.(error instanceof Error ? error.message : String(error))
    try {
      opts.client.close()
    } catch {
      /* already closed */
    }
    return { send: () => {}, close: () => {} }
  }

  let open = false
  const queue: (string | ArrayBuffer)[] = []

  upstream.onopen = () => {
    open = true
    for (const message of queue) {
      try {
        upstream.send(message)
      } catch {
        /* upstream gone */
      }
    }
    queue.length = 0
  }
  upstream.onmessage = (event) => {
    try {
      opts.client.send(event.data as string | ArrayBuffer)
    } catch {
      /* client gone */
    }
  }
  upstream.onclose = () => {
    try {
      opts.client.close()
    } catch {
      /* already closed */
    }
  }
  upstream.onerror = () => {
    try {
      upstream.close()
    } catch {
      /* already closed */
    }
  }

  return {
    send(payload) {
      if (open) {
        try {
          upstream.send(payload)
        } catch {
          /* upstream gone */
        }
      } else {
        queue.push(payload)
      }
    },
    close() {
      try {
        upstream.close()
      } catch {
        /* already closed */
      }
    },
  }
}

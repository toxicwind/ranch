/**
 * chats-gateway — a mock upstream for the tests.
 *
 * This is the descendant of the prototype's `mock-backend.ts`: a tiny stand-in
 * for the agent backends the gateway proxies to. It serves the three shapes
 * the gateway has to cope with:
 *
 *   - a kimi-style SPA at the root, with assets at `/assets/...` and a REST +
 *     WebSocket namespace at `/api/v1/...`,
 *   - a Kappa-Console-style SPA at `/console/`, with assets at
 *     `/console/assets/...`, a router base of `/console`, an inline
 *     theme-preload script and the matching Content-Security-Policy hash,
 *   - a kappa-style API root (`/session`) behind HTTP Basic auth.
 *
 * It also records every request it receives, so a test can assert that the
 * gateway's own token never reached the upstream.
 *
 * Run it standalone: `bun src/mock-backend.ts --port 58628`
 */

import { connect } from 'node:net'

export interface MockRequest {
  method: string
  path: string
  /** The `Authorization` header exactly as it arrived. */
  authorization: string | null
  /** Query parameters as they arrived. */
  query: Record<string, string>
}

export interface MockBackendOptions {
  /** Port to listen on. 0 picks a free port. */
  port?: number
  /** Bearer token the kimi-style routes expect. */
  token?: string
  /** Basic-auth user for the kappa-style API routes. */
  basicUser?: string
  /** Basic-auth password for the kappa-style API routes. */
  basicPassword?: string
  hostname?: string
}

export interface MockBackend {
  url: string
  port: number
  token: string
  /** Every request the mock has seen, in order. */
  requests: MockRequest[]
  stop: () => void
}

export const MOCK_TOKEN = 'mock-backend-token'
export const MOCK_BASIC_USER = 'kappa'
export const MOCK_BASIC_PASSWORD = 'mock-kappa-password'

const KIMI_HTML = `<html><head><script src="/assets/app.js"></script></head><body>mock-kimi-ui</body></html>`

/**
 * The Kappa Console lookalike.
 *
 * The inline theme-preload script carries a `/console/` path on purpose: it
 * is the one place where the gateway's response rewrite changes the hashed
 * inline script, so the Content-Security-Policy has to be recomputed or the
 * browser blocks the script.
 */
const CONSOLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<script id="oc-theme-preload-script">document.documentElement.dataset.base = "/console/";</script>
<link rel="icon" href="/favicon.svg" />
<script type="module" crossorigin src="/console/assets/app.js"></script>
</head>
<body>mock-kappa-console</body>
</html>`

const CONSOLE_JS = `/* mock console bundle */ const base = "/console/"; const api = "/session";`

const KIMI_JS = `/* mock kimi bundle */ const api = "/api/v1";`

async function sha256Base64(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  )
  let binary = ''
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** The inline script's exact text — the part the CSP hash covers. */
export const CONSOLE_INLINE_SCRIPT =
  'document.documentElement.dataset.base = "/console/";'

/**
 * Refuse to start on a port that already has a listener.
 *
 * Bun's `serve` enables `SO_REUSEPORT`, so binding a busy port succeeds and
 * the kernel then hands connections to whichever socket it likes — a mock
 * that silently answers half the time is worse than no mock at all.
 */
async function assertPortFree(hostname: string, port: number): Promise<void> {
  if (port === 0) return
  const busy = await new Promise<boolean>((resolve) => {
    const socket = connect({ host: hostname, port })
    const done = (value: boolean): void => {
      clearTimeout(timer)
      socket.destroy()
      resolve(value)
    }
    const timer = setTimeout(() => done(false), 500)
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
  if (busy) {
    throw new Error(
      `port ${port} on ${hostname} already has a listener — pick another port`
    )
  }
}

export async function startMockBackend(
  options: MockBackendOptions = {}
): Promise<MockBackend> {
  const token = options.token ?? MOCK_TOKEN
  const basicUser = options.basicUser ?? MOCK_BASIC_USER
  const basicPassword = options.basicPassword ?? MOCK_BASIC_PASSWORD
  const hostname = options.hostname ?? '127.0.0.1'
  const requests: MockRequest[] = []

  await assertPortFree(hostname, options.port ?? 0)

  const csp = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-${await sha256Base64(CONSOLE_INLINE_SCRIPT)}'; style-src 'self' 'unsafe-inline'`

  const server = Bun.serve({
    hostname,
    port: options.port ?? 0,
    fetch(req, server) {
      const url = new URL(req.url)
      const query: Record<string, string> = {}
      for (const [key, value] of url.searchParams) query[key] = value

      requests.push({
        method: req.method,
        path: url.pathname,
        authorization: req.headers.get('authorization'),
        query,
      })

      const upgrade = req.headers.get('upgrade')?.toLowerCase()
      if (upgrade === 'websocket') {
        // A Basic-auth upstream accepts the credential on the handshake; a
        // bearer upstream accepts the `kimi-code.bearer.<token>` subprotocol.
        const authorization = req.headers.get('authorization')
        if (authorization?.startsWith('Basic ')) {
          const expected = `Basic ${Buffer.from(`${basicUser}:${basicPassword}`).toString('base64')}`
          if (authorization !== expected) {
            return new Response('unauthorized', { status: 401 })
          }
        } else {
          const proto = req.headers.get('sec-websocket-protocol') ?? ''
          if (!proto.includes(`kimi-code.bearer.${token}`)) {
            return new Response('unauthorized', { status: 401 })
          }
        }
        const offered = req.headers.get('sec-websocket-protocol')
        const ok = server.upgrade(req, {
          ...(offered
            ? { headers: { 'Sec-WebSocket-Protocol': offered } }
            : {}),
        })
        if (!ok) return new Response('upgrade failed', { status: 500 })
        return undefined as unknown as Response
      }

      // kimi-style SPA at the root.
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(KIMI_HTML, {
          headers: { 'content-type': 'text/html' },
        })
      }
      if (url.pathname === '/assets/app.js') {
        return new Response(KIMI_JS, {
          headers: { 'content-type': 'text/javascript' },
        })
      }

      // kimi-style REST namespace.
      if (url.pathname.startsWith('/api/v1')) {
        if (url.searchParams.has('token')) {
          return new Response('token leaked in query', { status: 500 })
        }
        if (req.headers.get('authorization') !== `Bearer ${token}`) {
          return new Response('unauthorized', { status: 401 })
        }
        if (url.pathname === '/api/v1/ping') {
          return Response.json({ ok: true, pong: true })
        }
        return Response.json({ ok: true, path: url.pathname })
      }

      // Kappa-Console-style SPA.
      if (url.pathname === '/console' || url.pathname === '/console/') {
        return new Response(CONSOLE_HTML, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': csp,
          },
        })
      }
      if (url.pathname === '/console/assets/app.js') {
        return new Response(CONSOLE_JS, {
          headers: { 'content-type': 'text/javascript' },
        })
      }

      // kappa-style API root behind Basic auth.
      if (url.pathname === '/session' || url.pathname.startsWith('/session/')) {
        const expected = `Basic ${Buffer.from(`${basicUser}:${basicPassword}`).toString('base64')}`
        if (req.headers.get('authorization') !== expected) {
          return new Response('unauthorized', {
            status: 401,
            headers: { 'www-authenticate': 'Basic realm="Secure Area"' },
          })
        }
        return Response.json({ ok: true, user: basicUser, sessions: [] })
      }

      return new Response('not found', { status: 404 })
    },
    websocket: {
      message(ws, message) {
        ws.send(`echo:${message}`)
      },
    },
  })

  return {
    url: `http://${hostname}:${server.port ?? 0}`,
    port: server.port ?? 0,
    token,
    requests,
    stop: () => {
      try {
        server.stop(true)
      } catch {
        /* already stopped */
      }
    },
  }
}

/** CLI mode: `bun src/mock-backend.ts --port 58628`. */
if (import.meta.main) {
  const args = process.argv.slice(2)
  const portIndex = args.indexOf('--port')
  const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 0
  const mock = await startMockBackend({ port })
  console.log(`Local:   ${mock.url}/#token=${mock.token}`)
  console.log(`Token: ${mock.token}`)
  console.log('Stop:    Ctrl+C')
}

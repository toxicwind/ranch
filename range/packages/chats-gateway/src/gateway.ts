/**
 * chats-gateway — the gateway process.
 *
 * ONE Bun server, ONE loopback port, ONE bearer token, THREE agent surfaces.
 *
 *   /            landing page: one tab per agent plus a live status strip
 *   /tau/        tau shell: collab-web + the local collab registry
 *   /kappa/…     the Kappa Console, proxied from the kappa server
 *   /kimi/…      the kimi WebUI, proxied from `kimi web`
 *   /health      gateway health — the only route that needs no token
 *
 * Everything except `/health` requires the bearer token. The token is read
 * from the environment at start-up; upstream credentials are read from the
 * environment at request time and never leave the process.
 */

import {
  envCredential,
  extractWsToken,
  requestToken,
  stripTokenParam,
  tokenMatches,
  type CredentialResolver,
  type UpstreamAuth,
} from './auth.ts'
import type { GatewayConfig } from './config.ts'
import {
  renderLandingPage,
  renderNotFoundPage,
  renderTauShell,
  renderUnavailablePage,
  type CollabHost,
  type SurfaceStatus,
} from './html.ts'
import {
  proxyHttp,
  relayWebSocket,
  toArrayBuffer,
  UpstreamUnavailableError,
  type RelayHandle,
} from './proxy.ts'
import {
  buildSurfaces,
  resolveMount,
  type Surface,
  type SurfaceId,
} from './surfaces.ts'

/** How long `tau collab list --json` may take. */
const COLLAB_LIST_TIMEOUT_MS = 3000

/** Read a piped child-process stream, if there is one. */
async function readStream(stream: unknown): Promise<string> {
  if (stream instanceof ReadableStream) {
    return new Response(stream).text()
  }
  return ''
}

export interface CollabHostsResult {
  hosts: CollabHost[]
  error?: string
}

export interface ChatsGatewayOptions {
  config: GatewayConfig
  /**
   * Resolver for the kappa server's Basic-auth password. Defaults to the
   * `KAPPA_SERVER_PASSWORD` environment variable, read at request time.
   */
  kappaPassword?: CredentialResolver
  /** Optional logger. Never receives a credential. */
  onLog?: (message: string) => void
  /** Injectable fetch, used by the tests. */
  fetchImpl?: typeof fetch
  /** Injectable collab-host lister, used by the tests. */
  listCollabHosts?: () => Promise<CollabHostsResult>
}

export interface GatewayInfo {
  /** Absolute origin the gateway is reachable at. */
  origin: string
  port: number
  bind: string
}

interface WsData {
  surface: Surface
  upstreamPath: string
  search: string
  relay?: RelayHandle
}

interface ProbeResult {
  state: 'ready' | 'unavailable'
  detail?: string
  at: number
}

export class ChatsGateway {
  private readonly opts: ChatsGatewayOptions
  private readonly config: GatewayConfig
  private readonly surfaces: Surface[]
  private readonly kappaPassword: CredentialResolver
  private server: ReturnType<typeof Bun.serve> | null = null
  private port = 0
  private startedAt = 0
  private readonly probes = new Map<SurfaceId, ProbeResult>()

  constructor(opts: ChatsGatewayOptions) {
    this.opts = opts
    this.config = opts.config
    this.surfaces = buildSurfaces(opts.config)
    this.kappaPassword =
      opts.kappaPassword ?? envCredential('KAPPA_SERVER_PASSWORD')
  }

  get running(): boolean {
    return this.server !== null
  }

  get info(): GatewayInfo | null {
    if (!this.server) return null
    return {
      origin: `http://${this.config.bind}:${this.port}`,
      port: this.port,
      bind: this.config.bind,
    }
  }

  private log(message: string): void {
    this.opts.onLog?.(`[chats-gateway] ${message}`)
  }

  /** Start the gateway. Resolves with the origin it is reachable at. */
  async start(): Promise<GatewayInfo> {
    if (this.running) {
      const info = this.info
      if (info) return info
      await this.stop()
    }

    const server = Bun.serve<WsData>({
      hostname: this.config.bind,
      port: this.config.port,
      fetch: (req, server) => this.handle(req, server),
      websocket: {
        open: (ws) => {
          const data = ws.data
          const upstreamToken = this.upstreamTokenFor(data.surface)
          const upstreamHeaders = this.upstreamHeadersFor(data.surface)
          data.relay = relayWebSocket({
            client: ws as never,
            origin: data.surface.origin ?? '',
            upstreamPath: data.upstreamPath,
            search: data.search,
            ...(upstreamToken ? { upstreamToken } : {}),
            ...(upstreamHeaders.headers
              ? { headers: upstreamHeaders.headers }
              : {}),
            onError: (message) => this.log(`ws relay failed: ${message}`),
          })
        },
        message: (ws, message) => {
          const payload: string | ArrayBuffer =
            typeof message === 'string' ? message : toArrayBuffer(message)
          ws.data.relay?.send(payload)
        },
        close: (ws) => {
          ws.data.relay?.close()
        },
      },
    })

    this.server = server
    this.port = server.port ?? this.config.port
    this.startedAt = Date.now()
    this.log(`listening on ${this.config.bind}:${this.port}`)
    return this.info as GatewayInfo
  }

  /** Stop the gateway and release the port. */
  async stop(): Promise<void> {
    if (this.server) {
      try {
        this.server.stop(true)
      } catch {
        /* already stopped */
      }
      this.server = null
    }
    this.port = 0
    this.log('stopped')
  }

  // ---- routing -----------------------------------------------------------

  private async handle(
    req: Request,
    server: ReturnType<typeof Bun.serve<WsData>>
  ): Promise<Response> {
    const url = new URL(req.url)

    // The health route is the only unauthenticated door: it is what a
    // supervisor polls, and it carries no secret.
    if (url.pathname === '/health' || url.pathname === '/health/') {
      return this.health()
    }

    const callerToken = requestToken(req, url)
    if (!tokenMatches(callerToken, this.config.token)) {
      return new Response('unauthorized', {
        status: 401,
        headers: { 'www-authenticate': 'Bearer' },
      })
    }

    const upgrade = req.headers.get('upgrade')?.toLowerCase()
    if (upgrade === 'websocket') {
      return this.handleUpgrade(req, server, url)
    }

    if (url.pathname === '/' || url.pathname === '') {
      return this.landing(url)
    }
    if (url.pathname === '/tau' || url.pathname === '/tau/') {
      return this.tauShell(url)
    }
    if (url.pathname === '/tau/api/hosts') {
      return this.collabHosts()
    }

    const match = resolveMount(this.surfaces, url.pathname)
    if (!match) {
      return new Response(renderNotFoundPage({ path: url.pathname }), {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    return this.proxyToUpstream(req, url, match.surface, match.upstreamPath)
  }

  private handleUpgrade(
    req: Request,
    server: ReturnType<typeof Bun.serve<WsData>>,
    url: URL
  ): Response {
    const match = resolveMount(this.surfaces, url.pathname)
    if (!match) {
      return new Response('not found', { status: 404 })
    }

    // A WebSocket handshake cannot carry an Authorization header from the
    // browser, so the token may arrive in the query string or in the
    // `kimi-code.bearer.<token>` subprotocol.
    const protocol = req.headers.get('sec-websocket-protocol')
    const wsToken = extractWsToken(protocol)
    const queryToken = url.searchParams.get('token')
    const token = wsToken ?? queryToken
    if (!tokenMatches(token, this.config.token)) {
      return new Response('unauthorized', { status: 401 })
    }

    const upstreamToken = this.upstreamTokenFor(match.surface)

    // The gateway echoes the subprotocol the CLIENT offered, so the browser's
    // handshake completes. The upstream connection presents the swapped
    // token instead — the two never see the same value.
    const ok = server.upgrade(req, {
      data: {
        surface: match.surface,
        upstreamPath: match.upstreamPath,
        // The caller's token is stripped; every other query parameter is
        // forwarded (kimi's WebSocket carries a `client_id`).
        search: stripTokenParam(url.search),
      },
      ...(protocol ? { headers: { 'Sec-WebSocket-Protocol': protocol } } : {}),
    })
    if (!ok) {
      return new Response('websocket upgrade failed', { status: 500 })
    }
    return undefined as unknown as Response
  }

  // ---- pages -------------------------------------------------------------

  private async landing(url: URL): Promise<Response> {
    const statuses = await this.statuses()
    const html = renderLandingPage({
      statuses,
      token: this.config.token,
      origin: url.origin,
    })
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  private async tauShell(url: URL): Promise<Response> {
    const result = await this.hosts()
    const html = renderTauShell({
      ...(this.config.tau.collabUrl
        ? { collabUrl: this.config.tau.collabUrl }
        : {}),
      hosts: result.hosts,
      ...(result.error ? { hostsError: result.error } : {}),
      token: this.config.token,
      origin: url.origin,
    })
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  private async collabHosts(): Promise<Response> {
    const result = await this.hosts()
    if (result.error) {
      return Response.json(
        { ok: false, error: result.error, hosts: [] },
        { status: 502 }
      )
    }
    return Response.json({ ok: true, hosts: result.hosts })
  }

  private async health(): Promise<Response> {
    const statuses = await this.statuses()
    return Response.json({
      ok: true,
      service: 'chats-gateway',
      bind: this.config.bind,
      port: this.port,
      uptimeMs: Date.now() - this.startedAt,
      surfaces: statuses.map((status) => ({
        id: status.id,
        label: status.label,
        state: status.state,
        ...(status.upstream ? { upstream: status.upstream } : {}),
        ...(status.detail ? { detail: status.detail } : {}),
      })),
    })
  }

  // ---- upstream ----------------------------------------------------------

  private upstreamAuthFor(surface: Surface): UpstreamAuth {
    if (surface.auth === 'basic') {
      const password = this.kappaPassword()
      if (!password) return { mode: 'none' }
      return {
        mode: 'basic',
        basic: { username: this.config.kappa.username, password },
      }
    }
    if (surface.auth === 'bearer') {
      const token = this.config.kimi.token
      return token ? { mode: 'bearer', token } : { mode: 'none' }
    }
    return { mode: 'none' }
  }

  private upstreamTokenFor(surface: Surface): string | undefined {
    if (surface.auth === 'bearer') return this.config.kimi.token
    return undefined
  }

  /**
   * Extra handshake headers for an upstream WebSocket.
   *
   * A browser cannot set headers on a WebSocket handshake, so the kappa
   * Basic credential is added here, on the gateway's own connection.
   */
  private upstreamHeadersFor(surface: Surface): {
    headers?: Record<string, string>
  } {
    if (surface.auth !== 'basic') return {}
    const password = this.kappaPassword()
    if (!password) return {}
    const encoded = Buffer.from(
      `${this.config.kappa.username}:${password}`
    ).toString('base64')
    return { headers: { Authorization: `Basic ${encoded}` } }
  }

  private async proxyToUpstream(
    req: Request,
    url: URL,
    surface: Surface,
    upstreamPath: string
  ): Promise<Response> {
    const origin = surface.origin
    if (!origin) {
      return new Response(
        renderUnavailablePage({
          surface: surface.label,
          detail: 'This surface has no upstream configured.',
        }),
        { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } }
      )
    }

    const auth = this.upstreamAuthFor(surface)
    try {
      const response = await proxyHttp({
        req,
        url,
        origin,
        upstreamPath,
        auth,
        rewrites: surface.rewrites,
        timeoutMs: this.config.upstreamTimeoutMs,
        ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
      })

      // An upstream that answers 401 while we hold no credential is not a
      // bug in the gateway — it is a missing credential. Say so plainly.
      if (response.status === 401 && auth.mode === 'none') {
        return this.unavailable(
          surface,
          origin,
          'The upstream refused the request because the gateway has no credential for it.',
          surface.auth === 'basic'
            ? 'Set KAPPA_SERVER_PASSWORD in the gateway environment (inject it from the secretsmith keyring).'
            : 'Set KIMI_CODE_TOKEN in the gateway environment.',
          req.headers.get('accept') ?? ''
        )
      }

      return response
    } catch (error) {
      if (error instanceof UpstreamUnavailableError) {
        return this.unavailable(
          surface,
          origin,
          `The upstream did not answer: ${error.message}`,
          undefined,
          req.headers.get('accept') ?? ''
        )
      }
      throw error
    }
  }

  private unavailable(
    surface: Surface,
    origin: string,
    detail: string,
    hint?: string,
    accept?: string
  ): Response {
    const html = renderUnavailablePage({
      surface: surface.label,
      upstream: origin,
      detail,
      ...(hint ? { hint } : {}),
    })
    if ((accept ?? '').includes('application/json')) {
      return Response.json(
        {
          error: 'surface_unavailable',
          surface: surface.id,
          upstream: origin,
          detail,
          ...(hint ? { hint } : {}),
        },
        { status: 503 }
      )
    }
    return new Response(html, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  // ---- status ------------------------------------------------------------

  private async statuses(): Promise<SurfaceStatus[]> {
    const results = await Promise.all(
      this.surfaces.map((surface) => this.statusOf(surface))
    )
    return results
  }

  private async statusOf(surface: Surface): Promise<SurfaceStatus> {
    const base: SurfaceStatus = {
      id: surface.id,
      label: surface.label,
      state: 'unknown',
      ...(surface.origin ? { upstream: surface.origin } : {}),
    }
    if (!surface.origin) {
      // tau is rendered by the gateway itself.
      return { ...base, state: 'ready' }
    }

    const cached = this.probes.get(surface.id)
    if (cached && Date.now() - cached.at < this.config.probeTtlMs) {
      return {
        ...base,
        state: cached.state,
        ...(cached.detail ? { detail: cached.detail } : {}),
      }
    }

    const probe = await this.probe(surface.origin)
    this.probes.set(surface.id, { ...probe, at: Date.now() })
    return {
      ...base,
      state: probe.state,
      ...(probe.detail ? { detail: probe.detail } : {}),
    }
  }

  private async probe(
    origin: string
  ): Promise<{ state: 'ready' | 'unavailable'; detail?: string }> {
    const doFetch = this.opts.fetchImpl ?? fetch
    try {
      const response = await doFetch(origin, {
        method: 'GET',
        signal: AbortSignal.timeout(this.config.probeTimeoutMs),
      })
      // Any HTTP answer means the upstream is up. A 401 is an up server that
      // wants credentials, not a missing server.
      if (response.status === 401 || response.status === 403) {
        return {
          state: 'ready',
          detail: 'upstream is up and requires credentials',
        }
      }
      return { state: 'ready' }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { state: 'unavailable', detail }
    }
  }

  // ---- tau collab registry ----------------------------------------------

  private async hosts(): Promise<CollabHostsResult> {
    if (this.opts.listCollabHosts) return this.opts.listCollabHosts()
    const bin = this.config.tau.bin
    if (!bin) {
      return {
        hosts: [],
        error:
          'No tau binary is configured for this gateway. Set TAU_COLLAB_BIN to the tau executable to list live collab hosts.',
      }
    }
    return this.runCollabList(bin)
  }

  private async runCollabList(bin: string): Promise<CollabHostsResult> {
    let proc: ReturnType<typeof Bun.spawn>
    try {
      proc = Bun.spawn([bin, 'collab', 'list', '--json'], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
    } catch (error) {
      return {
        hosts: [],
        error: `Could not run ${bin} collab list: ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGTERM')
      } catch {
        /* already gone */
      }
    }, COLLAB_LIST_TIMEOUT_MS)

    try {
      const [stdout, stderr, code] = await Promise.all([
        readStream(proc.stdout),
        readStream(proc.stderr),
        proc.exited,
      ])
      if (code !== 0) {
        return {
          hosts: [],
          error: `${bin} collab list exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`,
        }
      }
      const parsed = JSON.parse(stdout) as { hosts?: CollabHost[] }
      return { hosts: parsed.hosts ?? [] }
    } catch (error) {
      return {
        hosts: [],
        error: `Could not read ${bin} collab list: ${error instanceof Error ? error.message : String(error)}`,
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

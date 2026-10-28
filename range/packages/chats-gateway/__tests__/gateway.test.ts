/**
 * chats-gateway — integration tests.
 *
 * These are the promoted tests: the prototype's `__tests__/gateway.test.ts`
 * proved that ONE gateway could front kimi's WebUI (proxy, auth, WebSocket
 * relay, lifecycle) behind ONE token. Every one of those assertions is still
 * here, adapted to the three-surface layout, and the suite has grown to cover
 * the tau tab, the kappa tab, the token gate and the honest degradation of a
 * dead upstream.
 *
 * The prototype used to spawn `kimi web` as a child process. The gateway no
 * longer manages upstreams — it proxies to whatever the environment points
 * at — so the mock backend stands in for the live services. That is the same
 * arrangement the prototype used, except the mock is now reusable and in
 * this package rather than in a scratch directory.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config.ts'
import { ChatsGateway } from '../src/gateway.ts'
import {
  MOCK_BASIC_PASSWORD,
  MOCK_BASIC_USER,
  startMockBackend,
  type MockBackend,
} from '../src/mock-backend.ts'

const GATEWAY_TOKEN = 'gateway-token-value'
const KAPPA_PASSWORD = MOCK_BASIC_PASSWORD

let mock: MockBackend
let gateway: ChatsGateway
let base: string
let logs: string[] = []

beforeAll(async () => {
  mock = await startMockBackend()
  const config = loadConfig({
    CHATS_GATEWAY_TOKEN: GATEWAY_TOKEN,
    CHATS_GATEWAY_PORT: '0',
    CHATS_GATEWAY_BIND: '127.0.0.1',
    KIMI_CODE_URL: mock.url,
    KIMI_CODE_TOKEN: mock.token,
    KAPPA_ACP_URL: mock.url,
  })
  logs = []
  gateway = new ChatsGateway({
    config,
    kappaPassword: () => KAPPA_PASSWORD,
    onLog: (message) => logs.push(message),
    listCollabHosts: async () => ({
      hosts: [{ instanceId: 'inst-1', sessionName: 'demo', cwd: '/tmp' }],
    }),
  })
  const info = await gateway.start()
  base = `http://127.0.0.1:${info.port}`
})

afterAll(async () => {
  await gateway.stop()
  mock.stop()
})

describe('chats-gateway lifecycle', () => {
  test('starts on a loopback port and reports the origin', () => {
    const info = gateway.info
    expect(info).not.toBeNull()
    expect(info?.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(gateway.running).toBe(true)
  })

  test('stops cleanly and releases the port', async () => {
    const local = new ChatsGateway({
      config: loadConfig({
        CHATS_GATEWAY_TOKEN: GATEWAY_TOKEN,
        CHATS_GATEWAY_PORT: '0',
      }),
    })
    await local.start()
    expect(local.running).toBe(true)
    await local.stop()
    expect(local.running).toBe(false)
  })
})

describe('the token gate', () => {
  test('every route but /health needs the token', async () => {
    for (const path of [
      '/',
      '/tau/',
      '/tau/api/hosts',
      '/kappa/',
      '/kappa/api/session',
      '/kimi/',
      '/kimi/api/v1/ping',
    ]) {
      const response = await fetch(`${base}${path}`)
      expect(response.status).toBe(401)
    }
  })

  test('a wrong token is refused', async () => {
    const response = await fetch(`${base}/`, {
      headers: { authorization: 'Bearer not-the-token' },
    })
    expect(response.status).toBe(401)
  })

  test('/health is open and carries no secret', async () => {
    const response = await fetch(`${base}/health`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      ok: boolean
      surfaces: { id: string; state: string }[]
    }
    expect(body.ok).toBe(true)
    expect(body.surfaces.map((surface) => surface.id)).toEqual([
      'tau',
      'kappa',
      'kimi',
    ])
    expect(JSON.stringify(body)).not.toContain(GATEWAY_TOKEN)
    expect(JSON.stringify(body)).not.toContain(KAPPA_PASSWORD)
  })
})

describe('the landing page', () => {
  test('lists every agent surface and carries the token', async () => {
    const response = await fetch(`${base}/?token=${GATEWAY_TOKEN}`)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('id="pane-tau"')
    expect(html).toContain('id="pane-kappa"')
    expect(html).toContain('id="pane-kimi"')
    expect(html).toContain(GATEWAY_TOKEN)
  })

  test('an unrouted path gets an honest 404', async () => {
    const response = await fetch(`${base}/nope?token=${GATEWAY_TOKEN}`)
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('Not found')
  })
})

describe('the tau tab', () => {
  test('renders the tau shell with the collab registry', async () => {
    const response = await fetch(`${base}/tau/?token=${GATEWAY_TOKEN}`)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('collab-web is not configured')
    expect(html).toContain('inst-1')
  })

  test('serves the collab registry as JSON', async () => {
    const response = await fetch(`${base}/tau/api/hosts?token=${GATEWAY_TOKEN}`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      ok: boolean
      hosts: { instanceId: string }[]
    }
    expect(body.ok).toBe(true)
    expect(body.hosts[0]?.instanceId).toBe('inst-1')
  })
})

describe('the kimi tab', () => {
  test('proxies the upstream WebUI', async () => {
    const response = await fetch(`${base}/kimi/?token=${GATEWAY_TOKEN}`)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('mock-kimi-ui')
  })

  test('re-points the SPA root-absolute asset URL at the gateway prefix', async () => {
    const response = await fetch(`${base}/kimi/?token=${GATEWAY_TOKEN}`)
    const html = await response.text()
    expect(html).toContain('src="/kimi/assets/app.js"')
    expect(html).not.toContain('src="/assets/app.js"')
  })

  test('the API route needs the token', async () => {
    const response = await fetch(`${base}/kimi/api/v1/ping`)
    expect(response.status).toBe(401)
  })

  test('the API route swaps the gateway token for the upstream token', async () => {
    const response = await fetch(
      `${base}/kimi/api/v1/ping?token=${GATEWAY_TOKEN}`,
      {
        headers: { authorization: `Bearer ${GATEWAY_TOKEN}` },
      }
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, pong: true })

    const upstream = mock.requests
      .filter((entry) => entry.path === '/api/v1/ping')
      .at(-1)
    expect(upstream?.authorization).toBe(`Bearer ${mock.token}`)
    expect(upstream?.authorization).not.toContain(GATEWAY_TOKEN)
  })

  test('the token never reaches the upstream in the query string', async () => {
    // The mock answers 500 when a `token` parameter shows up, so a 200 here
    // is proof the query was stripped before proxying.
    const response = await fetch(
      `${base}/kimi/api/v1/ping?token=${GATEWAY_TOKEN}`,
      {
        headers: { authorization: `Bearer ${GATEWAY_TOKEN}` },
      }
    )
    expect(response.status).toBe(200)
    const upstream = mock.requests
      .filter((entry) => entry.path === '/api/v1/ping')
      .at(-1)
    expect(Object.keys(upstream?.query ?? {})).not.toContain('token')
  })
})

describe('the kappa tab', () => {
  test('proxies the Kappa Console', async () => {
    const response = await fetch(`${base}/kappa/?token=${GATEWAY_TOKEN}`)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('mock-kappa-console')
  })

  test('re-points the console base at the gateway prefix', async () => {
    const response = await fetch(`${base}/kappa/?token=${GATEWAY_TOKEN}`)
    const html = await response.text()
    expect(html).toContain('src="/kappa/assets/app.js"')
    expect(html).not.toContain('src="/console/assets/app.js"')
  })

  test('recomputes the Content-Security-Policy hash for the rewritten page', async () => {
    const response = await fetch(`${base}/kappa/?token=${GATEWAY_TOKEN}`)
    const html = await response.text()
    const csp = response.headers.get('content-security-policy')
    expect(csp).toBeTruthy()
    const inline = html.match(
      /<script\b(?![^>]*\bsrc\s*=)[^>]*\bid=(['"])oc-theme-preload-script\1[^>]*>([\s\S]*?)<\/script>/i
    )
    expect(inline).not.toBeNull()
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(inline?.[2] ?? '')
    )
    let binary = ''
    for (const byte of new Uint8Array(digest))
      binary += String.fromCharCode(byte)
    expect(csp).toContain(`sha256-${btoa(binary)}`)
  })

  test('authenticates to the kappa upstream with the configured Basic credential', async () => {
    const response = await fetch(
      `${base}/kappa/api/session?token=${GATEWAY_TOKEN}`
    )
    expect(response.status).toBe(200)
    const upstream = mock.requests
      .filter((entry) => entry.path === '/session')
      .at(-1)
    const expected = `Basic ${Buffer.from(`${MOCK_BASIC_USER}:${KAPPA_PASSWORD}`).toString('base64')}`
    expect(upstream?.authorization).toBe(expected)
    expect(upstream?.authorization).not.toContain(GATEWAY_TOKEN)
  })
})

describe('the websocket relay', () => {
  test('relays a client socket to the upstream with the upstream token', async () => {
    const port = gateway.info?.port
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/kimi/api/v1/ws?token=${GATEWAY_TOKEN}`,
      [`kimi-code.bearer.${GATEWAY_TOKEN}`]
    )
    const echoed = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ws timeout')), 5000)
      socket.onopen = () => socket.send('hello')
      socket.onmessage = (event) => {
        clearTimeout(timer)
        resolve(String(event.data))
      }
      socket.onerror = () => {
        clearTimeout(timer)
        reject(new Error('ws error'))
      }
    })
    expect(echoed).toBe('echo:hello')
    socket.close()
  })

  test('rejects a websocket without the token', async () => {
    const port = gateway.info?.port
    const socket = new WebSocket(`ws://127.0.0.1:${port}/kimi/api/v1/ws`, [
      'kimi-code.bearer.wrong',
    ])
    const result = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), 3000)
      socket.onerror = () => {
        clearTimeout(timer)
        resolve('rejected')
      }
      socket.onopen = () => {
        clearTimeout(timer)
        resolve('opened')
      }
    })
    expect(result).not.toBe('opened')
    try {
      socket.close()
    } catch {
      /* ignore */
    }
  })

  test('authenticates a kappa websocket with the Basic credential', async () => {
    const port = gateway.info?.port
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/kappa/api/session?token=${GATEWAY_TOKEN}`
    )
    const echoed = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ws timeout')), 5000)
      socket.onopen = () => socket.send('hello')
      socket.onmessage = (event) => {
        clearTimeout(timer)
        resolve(String(event.data))
      }
      socket.onerror = () => {
        clearTimeout(timer)
        reject(new Error('ws error'))
      }
    })
    expect(echoed).toBe('echo:hello')

    const upstream = mock.requests
      .filter((entry) => entry.path === '/session')
      .at(-1)
    const expected = `Basic ${Buffer.from(`${MOCK_BASIC_USER}:${KAPPA_PASSWORD}`).toString('base64')}`
    expect(upstream?.authorization).toBe(expected)
    socket.close()
  })
})

describe('honest degradation', () => {
  test('a dead upstream yields an unavailable page, not a stack trace', async () => {
    const dead = new ChatsGateway({
      config: loadConfig({
        CHATS_GATEWAY_TOKEN: GATEWAY_TOKEN,
        CHATS_GATEWAY_PORT: '0',
        KIMI_CODE_URL: 'http://127.0.0.1:1',
        KAPPA_ACP_URL: 'http://127.0.0.1:1',
      }),
    })
    const info = await dead.start()
    try {
      const response = await fetch(
        `http://127.0.0.1:${info.port}/kimi/?token=${GATEWAY_TOKEN}`
      )
      expect(response.status).toBe(503)
      const html = await response.text()
      expect(html).toContain('surface unavailable')
      expect(html).toContain('http://127.0.0.1:1')
      expect(html).not.toContain('at ')
      expect(html).not.toContain('Error:')
    } finally {
      await dead.stop()
    }
  })

  test('a dead upstream is reported as unavailable on the landing page', async () => {
    const dead = new ChatsGateway({
      config: loadConfig({
        CHATS_GATEWAY_TOKEN: GATEWAY_TOKEN,
        CHATS_GATEWAY_PORT: '0',
        KIMI_CODE_URL: 'http://127.0.0.1:1',
        KAPPA_ACP_URL: 'http://127.0.0.1:1',
      }),
    })
    const info = await dead.start()
    try {
      const response = await fetch(
        `http://127.0.0.1:${info.port}/?token=${GATEWAY_TOKEN}`
      )
      const html = await response.text()
      expect(html).toContain('surface unavailable')
    } finally {
      await dead.stop()
    }
  })

  test('an upstream that wants credentials and gets none says so', async () => {
    const blind = new ChatsGateway({
      config: loadConfig({
        CHATS_GATEWAY_TOKEN: GATEWAY_TOKEN,
        CHATS_GATEWAY_PORT: '0',
        KAPPA_ACP_URL: mock.url,
      }),
      kappaPassword: () => undefined,
    })
    const info = await blind.start()
    try {
      const response = await fetch(
        `http://127.0.0.1:${info.port}/kappa/api/session?token=${GATEWAY_TOKEN}`
      )
      expect(response.status).toBe(503)
      const body = await response.text()
      expect(body).toContain('KAPPA_SERVER_PASSWORD')
    } finally {
      await blind.stop()
    }
  })
})

describe('secret hygiene', () => {
  test('the kappa password never appears in the gateway logs', () => {
    expect(logs.join('\n')).not.toContain(KAPPA_PASSWORD)
  })

  test('the kappa password never appears in a gateway response', async () => {
    const response = await fetch(
      `${base}/kappa/api/session?token=${GATEWAY_TOKEN}`
    )
    expect(await response.text()).not.toContain(KAPPA_PASSWORD)
    const health = await fetch(`${base}/health`)
    expect(await health.text()).not.toContain(KAPPA_PASSWORD)
  })

  test('the gateway token never reaches an upstream that has no credential for it', async () => {
    const blind = new ChatsGateway({
      config: loadConfig({
        CHATS_GATEWAY_TOKEN: GATEWAY_TOKEN,
        CHATS_GATEWAY_PORT: '0',
        KIMI_CODE_URL: mock.url,
      }),
    })
    const info = await blind.start()
    try {
      await fetch(
        `http://127.0.0.1:${info.port}/kimi/api/v1/ping?token=${GATEWAY_TOKEN}`
      )
      const upstream = mock.requests
        .filter((entry) => entry.path === '/api/v1/ping')
        .at(-1)
      expect(upstream?.authorization ?? '').not.toContain(GATEWAY_TOKEN)
    } finally {
      await blind.stop()
    }
  })
})

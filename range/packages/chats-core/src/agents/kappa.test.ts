import { describe, expect, it } from 'vitest'
import {
  createKappaAdapter,
  encodeBasicAuth,
  parseBusySessionIds,
  parseKappaSession,
  parseKappaSessions,
} from './kappa.ts'
import { surfaceForAgent } from '../surfaces.ts'
import { createFakeRuntime } from '../testing/fake-runtime.ts'

const surface = surfaceForAgent('kappa')
if (!surface?.baseUrl) throw new Error('the registry has no kappa surface')

const SESSIONS_URL = `${surface.baseUrl}${surface.apiPath ?? '/session'}`
const STATUS_URL = `${surface.baseUrl}/session/status`
const HEALTH_URL = `${surface.baseUrl}${surface.healthPath ?? '/api/health'}`

const SESSION_PAYLOAD = JSON.stringify([
  {
    id: 'ses_abc',
    slug: 'playful-nebula',
    directory: '/home/toxic/estate',
    title: 'Kappa config oddity investigation',
    time: { created: 1_700_000_000_000, updated: 1_700_000_500_000 },
  },
  {
    id: 'ses_def',
    slug: 'silent-rocket',
    directory: '/home/toxic',
    title: 'Audit ranch',
    time: { created: 1_700_000_100_000, updated: 1_700_000_200_000 },
  },
])

describe('kappa payload parsing', () => {
  it('parses one session', () => {
    const session = parseKappaSession({
      id: 'ses_abc',
      title: 'hello',
      directory: '/home/toxic',
      time: { created: 1, updated: 2 },
    })
    expect(session?.id).toBe('ses_abc')
    expect(session?.title).toBe('hello')
    expect(session?.directory).toBe('/home/toxic')
    expect(session?.created).toBe(1)
    expect(session?.updated).toBe(2)
  })

  it('ignores entries without an id', () => {
    expect(parseKappaSessions([{ title: 'no id' }])).toEqual([])
    expect(parseKappaSessions({ sessions: [] })).toEqual([])
  })

  it('treats busy and retry as running, everything else as idle', () => {
    const busy = parseBusySessionIds({
      ses_abc: { type: 'busy' },
      ses_def: { type: 'idle' },
      ses_ghi: { type: 'retry' },
      ses_jkl: { type: 'offline' },
    })
    expect([...busy].sort()).toEqual(['ses_abc', 'ses_ghi'])
  })

  it('encodes basic auth', () => {
    expect(encodeBasicAuth('kappa', 'hunter2')).toBe(
      'Basic a2FwcGE6aHVudGVyMg=='
    )
  })
})

describe('kappa adapter', () => {
  it('lists the sessions and marks the busy one live', async () => {
    const runtime = createFakeRuntime({
      responses: {
        [SESSIONS_URL]: { status: 200, body: SESSION_PAYLOAD },
        [STATUS_URL]: {
          status: 200,
          body: JSON.stringify({
            ses_abc: { type: 'busy' },
            ses_def: { type: 'idle' },
          }),
        },
      },
    })
    const adapter = createKappaAdapter({ runtime })
    const chats = await adapter.list()

    expect(chats).toHaveLength(2)
    const busy = chats.find((chat) => chat.id === 'ses_abc')
    const idle = chats.find((chat) => chat.id === 'ses_def')
    expect(busy?.status).toBe('live')
    expect(idle?.status).toBe('idle')
    expect(busy?.title).toBe('Kappa config oddity investigation')
    expect(busy?.projectPath).toBe('/home/toxic/estate')
    expect(busy?.startedAt).toBe(new Date(1_700_000_000_000).toISOString())
    expect(busy?.surface.id).toBe('kappa-console')
  })

  it('degrades to an empty list when the server is unreachable', async () => {
    const runtime = createFakeRuntime()
    const adapter = createKappaAdapter({ runtime })

    await expect(adapter.list()).resolves.toEqual([])
    const health = await adapter.health()
    expect(health.status).toBe('unavailable')
    expect(health.reachable).toBe(false)
    expect(health.detail).toContain('did not answer')
  })

  it('degrades to an empty list when the server refuses the credentials', async () => {
    const runtime = createFakeRuntime({
      responses: {
        [SESSIONS_URL]: { status: 401, body: 'unauthorized' },
        [HEALTH_URL]: { status: 401, body: 'unauthorized' },
      },
    })
    const adapter = createKappaAdapter({ runtime })

    await expect(adapter.list()).resolves.toEqual([])
    const health = await adapter.health()
    expect(health.status).toBe('idle')
    expect(health.reachable).toBe(true)
    expect(health.detail).toContain('401')
  })

  it('reports a healthy server as live', async () => {
    const runtime = createFakeRuntime({
      responses: { [HEALTH_URL]: { status: 200, body: '{"healthy":true}' } },
    })
    const adapter = createKappaAdapter({ runtime })
    const health = await adapter.health()
    expect(health.status).toBe('live')
    expect(health.healthy).toBe(true)
  })

  it('sends the basic auth header only when the password is in the environment', async () => {
    const withPassword = createFakeRuntime({
      env: { KAPPA_SERVER_PASSWORD: 'hunter2' },
      responses: { [SESSIONS_URL]: { status: 200, body: '[]' } },
    })
    await createKappaAdapter({ runtime: withPassword }).list()
    expect(
      withPassword.requestHeaders.get(SESSIONS_URL)?.['authorization']
    ).toBe('Basic a2FwcGE6aHVudGVyMg==')

    const withoutPassword = createFakeRuntime({
      responses: { [SESSIONS_URL]: { status: 200, body: '[]' } },
    })
    await createKappaAdapter({ runtime: withoutPassword }).list()
    expect(
      withoutPassword.requestHeaders.get(SESSIONS_URL)?.['authorization']
    ).toBeUndefined()
  })
})

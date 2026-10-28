import { describe, expect, it } from 'vitest'
import {
  createKimiAdapter,
  parseKimiEnvelope,
  parseKimiSession,
  parseKimiSessions,
  resolveKimiHomeDir,
  resolveKimiTokenPath,
} from './kimi.ts'
import { surfaceForAgent } from '../surfaces.ts'
import { createFakeRuntime } from '../testing/fake-runtime.ts'

const surface = surfaceForAgent('kimi')
if (!surface?.baseUrl) throw new Error('the registry has no kimi surface')

const SESSIONS_URL = `${surface.baseUrl}${surface.apiPath ?? '/api/v1/sessions'}`
const HEALTH_URL = `${surface.baseUrl}${surface.healthPath ?? '/api/v1/healthz'}`
const TOKEN_PATH = '/kimi-home/server.token'

const SESSION_PAYLOAD = JSON.stringify({
  code: 0,
  msg: 'ok',
  data: {
    items: [
      {
        id: 's_1',
        title: 'Fix the raft',
        busy: true,
        created_at: 1_700_000_000,
        updated_at: 1_700_000_500,
        workspace_path: '/home/toxic/estate',
        message_count: 12,
      },
      {
        id: 's_2',
        title: 'Read the docs',
        busy: false,
      },
    ],
  },
})

describe('kimi payload parsing', () => {
  it('parses the envelope', () => {
    const envelope = parseKimiEnvelope({ code: 0, msg: 'ok', data: {} })
    expect(envelope?.code).toBe(0)
    expect(envelope?.msg).toBe('ok')
    expect(parseKimiEnvelope({ nope: true })).toBeNull()
  })

  it('parses one session', () => {
    const session = parseKimiSession({ id: 's_1', busy: true, title: 'x' })
    expect(session?.id).toBe('s_1')
    expect(session?.busy).toBe(true)
    expect(session?.title).toBe('x')
  })

  it('returns nothing for an error envelope', () => {
    expect(parseKimiSessions({ code: 401, msg: 'nope' })).toEqual([])
    expect(parseKimiSessions({ code: 0, data: {} })).toEqual([])
  })
})

describe('kimi home directory', () => {
  it('uses the override, then the environment, then the home directory', () => {
    const runtime = createFakeRuntime({ env: { HOME: '/home/tester' } })
    expect(resolveKimiHomeDir(runtime, '/explicit')).toBe('/explicit')
    expect(resolveKimiHomeDir(runtime)).toBe('/home/tester/.kimi-code')
    const withEnv = createFakeRuntime({
      env: { HOME: '/home/tester', KIMI_CODE_HOME: '/from/env' },
    })
    expect(resolveKimiHomeDir(withEnv)).toBe('/from/env')
    expect(resolveKimiTokenPath(withEnv)).toBe('/from/env/server.token')
  })
})

describe('kimi adapter', () => {
  it('degrades to an empty list when kimi-code is not installed', async () => {
    const runtime = createFakeRuntime()
    const adapter = createKimiAdapter({ runtime, homeDir: '/kimi-home' })

    await expect(adapter.list()).resolves.toEqual([])
    const health = await adapter.health()
    expect(health.status).toBe('unavailable')
    expect(health.reachable).toBe(false)
    expect(health.detail).toContain(TOKEN_PATH)
  })

  it('lists the sessions of an installed kimi server', async () => {
    const runtime = createFakeRuntime({
      entries: [{ path: TOKEN_PATH, content: 'the-token\n' }],
      responses: {
        [SESSIONS_URL]: { status: 200, body: SESSION_PAYLOAD },
        [HEALTH_URL]: { status: 200, body: '{"code":0,"msg":"ok","data":{}}' },
      },
    })
    const adapter = createKimiAdapter({ runtime, homeDir: '/kimi-home' })
    const chats = await adapter.list()

    expect(chats).toHaveLength(2)
    const busy = chats.find((chat) => chat.id === 's_1')
    const idle = chats.find((chat) => chat.id === 's_2')
    expect(busy?.status).toBe('live')
    expect(idle?.status).toBe('idle')
    expect(busy?.title).toBe('Fix the raft')
    expect(busy?.messageCount).toBe(12)
    expect(busy?.projectPath).toBe('/home/toxic/estate')
    expect(runtime.requestHeaders.get(SESSIONS_URL)?.['authorization']).toBe(
      'Bearer the-token'
    )
  })

  it('degrades to an empty list when the server is unreachable', async () => {
    const runtime = createFakeRuntime({
      entries: [{ path: TOKEN_PATH, content: 'the-token' }],
    })
    const adapter = createKimiAdapter({ runtime, homeDir: '/kimi-home' })

    await expect(adapter.list()).resolves.toEqual([])
    const health = await adapter.health()
    expect(health.status).toBe('unavailable')
    expect(health.detail).toContain('did not answer')
  })

  it('reports a healthy server as live', async () => {
    const runtime = createFakeRuntime({
      entries: [{ path: TOKEN_PATH, content: 'the-token' }],
      responses: {
        [HEALTH_URL]: { status: 200, body: '{"code":0,"data":{}}' },
      },
    })
    const adapter = createKimiAdapter({ runtime, homeDir: '/kimi-home' })
    const health = await adapter.health()
    expect(health.status).toBe('live')
    expect(health.healthy).toBe(true)
  })
})

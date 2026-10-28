import { describe, expect, it } from 'vitest'
import {
  countTauMessages,
  createTauAdapter,
  parseCollabHosts,
  parseTauSessionHeader,
  resolveTauSessionsRoot,
  sessionIdFromFileName,
} from './tau.ts'
import { createFakeRuntime } from '../testing/fake-runtime.ts'
import type { FakeEntry } from '../testing/fake-runtime.ts'

const SESSION_ID = '01a15cb8-d589-7499-beab-3b41ace5200e'
const FILE = `/sessions/-home-toxic/2026-10-21T04-29-39-593Z_${SESSION_ID}.jsonl`

const TRANSCRIPT = [
  '{"type": "title", "v": 1, "title": "Test 8 Free Model Providers", "source": "auto", "updatedAt": "2026-10-21T06:48:23.124Z"}',
  '{"type": "session", "version": 3, "id": "01a15cb8-d589-7499-beab-3b41ace5200e", "timestamp": "2026-10-21T04:29:39.593Z", "cwd": "/home/toxic/tmp"}',
  '{"type": "model_change", "id": "e149b76e", "model": "google-antigravity/claude-opus-5-5-high"}',
  '{"type": "message", "id": "m1"}',
  '{"type": "message", "id": "m2"}',
  '',
].join('\n')

describe('tau session header', () => {
  it('reads the title, the id, the start time and the working directory', () => {
    const header = parseTauSessionHeader(TRANSCRIPT)
    expect(header.title).toBe('Test 8 Free Model Providers')
    expect(header.sessionId).toBe(SESSION_ID)
    expect(header.startedAt).toBe('2026-10-21T04:29:39.593Z')
    expect(header.cwd).toBe('/home/toxic/tmp')
  })

  it('survives a truncated tail', () => {
    const truncated = `${TRANSCRIPT.split('\n')[0]}\n{"type": "session", "version": 3, "id": "01a15c`
    const header = parseTauSessionHeader(truncated)
    expect(header.title).toBe('Test 8 Free Model Providers')
    expect(header.sessionId).toBeNull()
  })

  it('counts only the message records', () => {
    expect(countTauMessages(TRANSCRIPT)).toBe(2)
    expect(countTauMessages('')).toBe(0)
  })

  it('falls back to the file name for the session id', () => {
    expect(
      sessionIdFromFileName(
        '2026-10-21T04-29-39-593Z_01a15cb8-d589-7499-beab-3b41ace5200e.jsonl'
      )
    ).toBe(SESSION_ID)
    expect(sessionIdFromFileName('nope.jsonl')).toBeNull()
  })

  it('treats an empty title as no title at all', () => {
    const header = parseTauSessionHeader(
      '{"type":"title","v":1,"title":"","updatedAt":"2026-10-21T06:46:18.186Z"}'
    )
    expect(header.title).toBeNull()
  })

  it('parses the collab host list', () => {
    const hosts = parseCollabHosts(
      JSON.stringify({
        version: 1,
        hosts: [{ sessionId: 'abc', instanceId: 'i-1', link: 'https://x/y' }],
      })
    )
    expect(hosts).toHaveLength(1)
    expect(hosts[0]?.sessionId).toBe('abc')
    expect(hosts[0]?.link).toBe('https://x/y')
    expect(parseCollabHosts('not json')).toEqual([])
    expect(parseCollabHosts(JSON.stringify({ version: 1, hosts: [] }))).toEqual(
      []
    )
  })
})

describe('tau sessions root', () => {
  it('uses the override first, then the environment, then the home directory', () => {
    const runtime = createFakeRuntime({ env: { HOME: '/home/tester' } })
    expect(resolveTauSessionsRoot(runtime, '/explicit')).toBe('/explicit')
    expect(resolveTauSessionsRoot(runtime)).toBe(
      '/home/tester/.tau/agent/sessions'
    )
    const withEnv = createFakeRuntime({
      env: { HOME: '/home/tester', TAU_SESSIONS_ROOT: '/from/env' },
    })
    expect(resolveTauSessionsRoot(withEnv)).toBe('/from/env')
  })
})

describe('tau adapter', () => {
  it('lists the local sessions with their exact message count', async () => {
    const runtime = createFakeRuntime({
      now: 1_700_000_000_000,
      entries: [
        { path: '/sessions', isDirectory: true },
        { path: '/sessions/-home-toxic', isDirectory: true },
        { path: FILE, content: TRANSCRIPT, mtimeMs: 1_700_000_000_000 },
      ],
    })
    const adapter = createTauAdapter({ runtime, sessionsRoot: '/sessions' })
    const chats = await adapter.list()

    expect(chats).toHaveLength(1)
    const chat = chats[0]
    expect(chat?.id).toBe(SESSION_ID)
    expect(chat?.agent).toBe('tau')
    expect(chat?.source).toBe('tau')
    expect(chat?.title).toBe('Test 8 Free Model Providers')
    expect(chat?.status).toBe('live')
    expect(chat?.messageCount).toBe(2)
    expect(chat?.startedAt).toBe('2026-10-21T04:29:39.593Z')
    expect(chat?.projectPath).toBe('/home/toxic/tmp')
    expect(chat?.surface.id).toBe('tau-collab-web')
  })

  it('marks a session that was not touched recently as idle', async () => {
    const runtime = createFakeRuntime({
      now: 1_700_000_000_000,
      entries: [
        { path: '/sessions', isDirectory: true },
        { path: '/sessions/-home-toxic', isDirectory: true },
        { path: FILE, content: TRANSCRIPT, mtimeMs: 1_699_000_000_000 },
      ],
    })
    const adapter = createTauAdapter({ runtime, sessionsRoot: '/sessions' })
    const chats = await adapter.list()
    expect(chats[0]?.status).toBe('idle')
  })

  it('degrades to an empty list when the session store is gone', async () => {
    const runtime = createFakeRuntime()
    const adapter = createTauAdapter({ runtime, sessionsRoot: '/sessions' })

    await expect(adapter.list()).resolves.toEqual([])
    const health = await adapter.health()
    expect(health.status).toBe('unavailable')
    expect(health.reachable).toBe(false)
    expect(health.detail).toContain('/sessions')
  })

  it('reports the surface as live when the session store is readable', async () => {
    const runtime = createFakeRuntime({
      entries: [{ path: '/sessions', isDirectory: true }],
    })
    const adapter = createTauAdapter({ runtime, sessionsRoot: '/sessions' })
    const health = await adapter.health()
    expect(health.status).toBe('live')
    expect(health.healthy).toBe(true)
    expect(health.surface?.id).toBe('tau-collab-web')
  })

  it('caps the number of sessions it returns', async () => {
    const entries: FakeEntry[] = [
      { path: '/sessions', isDirectory: true },
      { path: '/sessions/p', isDirectory: true },
    ]
    for (let index = 0; index < 5; index += 1) {
      entries.push({
        path: `/sessions/p/${index}.jsonl`,
        content: TRANSCRIPT,
        mtimeMs: 1_700_000_000_000 + index,
      })
    }
    const runtime = createFakeRuntime({ entries })
    const adapter = createTauAdapter({
      runtime,
      sessionsRoot: '/sessions',
      maxSessions: 2,
    })
    const chats = await adapter.list()
    expect(chats).toHaveLength(2)
  })
})

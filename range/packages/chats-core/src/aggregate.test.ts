import { describe, expect, it } from 'vitest'
import {
  aggregateChats,
  defaultAdapters,
  groupBySource,
  sortChats,
  summarizeChats,
} from './aggregate.ts'
import { createFakeRuntime } from './testing/fake-runtime.ts'
import { surfaceForAgent } from './surfaces.ts'
import type {
  AgentAdapter,
  RunningChat,
  SurfaceHealth,
  SurfaceRef,
} from './types.ts'

const resolved = surfaceForAgent('kappa')
if (!resolved) throw new Error('the registry has no kappa surface')
const surface: SurfaceRef = resolved

function chat(
  id: string,
  updatedAt: string,
  source: 'tau' | 'kappa' = 'kappa'
): RunningChat {
  return {
    id,
    agent: source,
    source,
    title: id,
    status: 'idle',
    updatedAt,
    startedAt: null,
    surface,
  }
}

function adapter(
  agent: 'tau' | 'kappa' | 'kimi',
  chats: RunningChat[],
  overrides: Partial<AgentAdapter> = {}
): AgentAdapter {
  const health: SurfaceHealth = {
    agent,
    surfaceId: null,
    status: 'live',
    reachable: true,
    healthy: true,
    detail: 'ok',
    checkedAt: '2026-10-21T00:00:00.000Z',
    surface,
  }
  return {
    agent,
    list: async () => chats,
    health: async () => health,
    ...overrides,
  }
}

describe('aggregation', () => {
  it('merges the chats of every agent, newest first', async () => {
    const runtime = createFakeRuntime()
    const result = await aggregateChats({
      runtime,
      adapters: [
        adapter('tau', [chat('t1', '2026-10-21T10:00:00.000Z', 'tau')]),
        adapter('kappa', [chat('k1', '2026-10-21T12:00:00.000Z')]),
      ],
    })

    expect(result.chats.map((entry) => entry.id)).toEqual(['k1', 't1'])
    expect(result.health).toHaveLength(2)
    expect(result.generatedAt).toBe(new Date(runtime.now()).toISOString())
  })

  it('isolates a failing adapter instead of failing the whole aggregate', async () => {
    const runtime = createFakeRuntime()
    const broken = adapter('kimi', [], {
      list: async () => {
        throw new Error('boom')
      },
    })
    const result = await aggregateChats({
      runtime,
      adapters: [
        broken,
        adapter('kappa', [chat('k1', '2026-10-21T12:00:00.000Z')]),
      ],
    })

    expect(result.chats.map((entry) => entry.id)).toEqual(['k1'])
    const kimi = result.health.find((entry) => entry.agent === 'kimi')
    expect(kimi?.status).toBe('unavailable')
    expect(kimi?.detail).toContain('boom')
  })

  it('records an unavailable surface when the health probe throws', async () => {
    const runtime = createFakeRuntime()
    const result = await aggregateChats({
      runtime,
      adapters: [
        adapter('kappa', [], {
          health: async () => {
            throw new Error('probe failed')
          },
        }),
      ],
    })
    expect(result.health[0]?.status).toBe('unavailable')
    expect(result.health[0]?.detail).toContain('probe failed')
  })

  it('groups chats by source and counts the live ones', () => {
    const chats = [
      chat('k1', '2026-10-21T12:00:00.000Z'),
      { ...chat('k2', '2026-10-21T11:00:00.000Z'), status: 'live' as const },
      chat('t1', '2026-10-21T10:00:00.000Z', 'tau'),
    ]
    const grouped = groupBySource(chats)
    expect(Object.keys(grouped).sort()).toEqual(['kappa', 'tau'])
    expect(grouped['kappa']).toHaveLength(2)

    const summary = summarizeChats(chats)
    expect(summary.kappa).toEqual({ total: 2, live: 1 })
    expect(summary.tau).toEqual({ total: 1, live: 0 })
  })

  it('sorts by update time with a stable tie breaker', () => {
    const sorted = sortChats([
      chat('b', '2026-10-21T12:00:00.000Z'),
      chat('a', '2026-10-21T12:00:00.000Z'),
      chat('c', '2026-10-21T13:00:00.000Z'),
    ])
    expect(sorted.map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
  })

  it('ships one adapter per agent', () => {
    const runtime = createFakeRuntime()
    expect(defaultAdapters(runtime).map((entry) => entry.agent)).toEqual([
      'tau',
      'kappa',
      'kimi',
    ])
  })
})

/**
 * aggregate — one call that answers "what is running right now".
 *
 * The aggregator is deliberately forgiving: an adapter that throws, times out
 * or finds nothing contributes zero chats and an `unavailable` health entry.
 * It never throws and never fills a gap with a guess.
 */

import { createKappaAdapter } from './agents/kappa.ts'
import { createKimiAdapter } from './agents/kimi.ts'
import { createTauAdapter } from './agents/tau.ts'
import type { Runtime } from './runtime.ts'
import { listSurfaces } from './surfaces.ts'
import type {
  AgentAdapter,
  AgentKind,
  RunningChat,
  SurfaceHealth,
  SurfaceRef,
} from './types.ts'

export interface AggregateOptions {
  readonly runtime: Runtime
  /** Override the adapters. Defaults to the Tau, Kappa and Kimi adapters. */
  readonly adapters?: readonly AgentAdapter[]
}

export interface AggregateResult {
  /** Every chat of every agent, newest first. */
  readonly chats: RunningChat[]
  /** The health of every probed surface. */
  readonly health: SurfaceHealth[]
  /** Every surface the registry knows. */
  readonly surfaces: SurfaceRef[]
  /** ISO-8601 timestamp of the aggregation. */
  readonly generatedAt: string
}

/** The adapters this package ships with. */
export function defaultAdapters(runtime: Runtime): AgentAdapter[] {
  return [
    createTauAdapter({ runtime }),
    createKappaAdapter({ runtime }),
    createKimiAdapter({ runtime }),
  ]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Sort chats newest first, with the id as a stable tie breaker. */
export function sortChats(chats: readonly RunningChat[]): RunningChat[] {
  return [...chats].sort((a, b) => {
    if (a.updatedAt === b.updatedAt) return a.id.localeCompare(b.id)
    return a.updatedAt < b.updatedAt ? 1 : -1
  })
}

/** Group chats by their source agent. */
export function groupBySource(
  chats: readonly RunningChat[]
): Record<string, RunningChat[]> {
  const out: Record<string, RunningChat[]> = {}
  for (const chat of chats) {
    const bucket = out[chat.source]
    if (bucket) bucket.push(chat)
    else out[chat.source] = [chat]
  }
  return out
}

/** How many chats each agent has, and how many of them are live. */
export function summarizeChats(
  chats: readonly RunningChat[]
): Record<AgentKind, { total: number; live: number }> {
  const out = {} as Record<AgentKind, { total: number; live: number }>
  for (const chat of chats) {
    const bucket = out[chat.source] ?? { total: 0, live: 0 }
    bucket.total += 1
    if (chat.status === 'live') bucket.live += 1
    out[chat.source] = bucket
  }
  return out
}

/** Aggregate the chats of every agent. */
export async function aggregateChats(
  options: AggregateOptions
): Promise<AggregateResult> {
  const { runtime } = options
  const adapters = options.adapters ?? defaultAdapters(runtime)
  const chats: RunningChat[] = []
  const health: SurfaceHealth[] = []

  for (const adapter of adapters) {
    try {
      const list = await adapter.list()
      chats.push(...list)
    } catch (error) {
      health.push({
        agent: adapter.agent,
        surfaceId: null,
        status: 'unavailable',
        reachable: false,
        healthy: false,
        detail: `the ${adapter.agent} adapter could not list its chats: ${errorMessage(error)}`,
        checkedAt: new Date(runtime.now()).toISOString(),
        surface: null,
      })
      continue
    }
    try {
      health.push(await adapter.health())
    } catch (error) {
      health.push({
        agent: adapter.agent,
        surfaceId: null,
        status: 'unavailable',
        reachable: false,
        healthy: false,
        detail: `the ${adapter.agent} adapter could not probe its surface: ${errorMessage(error)}`,
        checkedAt: new Date(runtime.now()).toISOString(),
        surface: null,
      })
    }
  }

  return {
    chats: sortChats(chats),
    health,
    surfaces: listSurfaces(),
    generatedAt: new Date(runtime.now()).toISOString(),
  }
}

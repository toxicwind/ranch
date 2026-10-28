/**
 * sample — print the live unified chat state of this machine.
 *
 * This is the proof that the package talks to the real estate: it uses the
 * real Node runtime, the real surface registry and the real agents. Whatever
 * cannot be reached is reported as `unavailable` with a reason — nothing is
 * filled in.
 *
 * Run it with the kappa password in the environment (the kappa server is
 * Basic-auth protected). Without it, the kappa section degrades truthfully.
 */

import { aggregateChats } from './aggregate.ts'
import { nodeRuntime } from './node.ts'
import { listSurfaces } from './surfaces.ts'
import type { SurfaceHealth } from './types.ts'

function healthLine(health: SurfaceHealth): string {
  return [
    `  ${health.agent.padEnd(6)} ${health.status.padEnd(12)} ${health.detail}`,
  ].join('')
}

async function main(): Promise<void> {
  const started = Date.now()
  const result = await aggregateChats({ runtime: nodeRuntime })
  const elapsed = Date.now() - started

  console.log('surfaces')
  for (const surface of listSurfaces()) {
    const origin = surface.baseUrl ?? '(no origin)'
    console.log(
      `  ${surface.agent.padEnd(6)} ${surface.id.padEnd(18)} ${origin.padEnd(26)} ${surface.authMode}`
    )
  }

  console.log('\nhealth')
  for (const health of result.health) console.log(healthLine(health))

  console.log(`\nchats (${result.chats.length})`)
  for (const chat of result.chats) {
    console.log(
      `  ${chat.source.padEnd(6)} ${chat.status.padEnd(6)} ${chat.updatedAt} ${chat.title}`
    )
  }

  console.log(`\naggregated in ${elapsed}ms at ${result.generatedAt}`)
}

await main()

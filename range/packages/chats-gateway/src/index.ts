/**
 * chats-gateway — entry point.
 *
 * Reads the environment, starts the gateway, and shuts down cleanly on a
 * signal. The bearer token is NEVER printed: it comes from the environment,
 * so whoever supervises the process already holds it, and a token in a log
 * line is a token in a log file.
 */

import { ConfigError, loadConfig } from './config.ts'
import { ChatsGateway } from './gateway.ts'

async function main(): Promise<void> {
  let config
  try {
    config = loadConfig(process.env)
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`chats-gateway: ${error.message}`)
      process.exit(1)
    }
    throw error
  }

  const gateway = new ChatsGateway({
    config,
    onLog: (message) => console.error(message),
  })

  const info = await gateway.start()
  console.log(`chats-gateway listening on ${info.origin}`)
  console.log('  /        landing page — one tab per agent (token required)')
  console.log('  /tau/    tau shell — collab-web + the local collab registry')
  console.log('  /kappa/  Kappa Console, proxied from the kappa server')
  console.log('  /kimi/   kimi WebUI, proxied from the kimi backend')
  console.log('  /health  gateway health (no token)')
  console.log(
    'The bearer token comes from CHATS_GATEWAY_TOKEN and is never printed.'
  )

  let stopping = false
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return
    stopping = true
    console.log(`chats-gateway: ${signal} — stopping`)
    await gateway.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
}

await main()

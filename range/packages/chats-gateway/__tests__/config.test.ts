/**
 * chats-gateway — configuration tests.
 *
 * The gateway reads everything from the environment. These tests pin the
 * defaults, the required token, and the promise that no secret ever lands in
 * the config object.
 */
import { describe, expect, test } from 'bun:test'
import {
  ConfigError,
  DEFAULT_BIND,
  DEFAULT_KAPPA_URL,
  DEFAULT_KIMI_URL,
  DEFAULT_PORT,
  loadConfig,
} from '../src/config.ts'

describe('loadConfig', () => {
  test('refuses to start without CHATS_GATEWAY_TOKEN', () => {
    expect(() => loadConfig({})).toThrow(ConfigError)
    expect(() => loadConfig({ CHATS_GATEWAY_TOKEN: '   ' })).toThrow(
      /CHATS_GATEWAY_TOKEN is required/
    )
  })

  test('applies the documented defaults', () => {
    const config = loadConfig({ CHATS_GATEWAY_TOKEN: 'tok' })
    expect(config.port).toBe(DEFAULT_PORT)
    expect(config.bind).toBe(DEFAULT_BIND)
    expect(config.kimi.url).toBe(DEFAULT_KIMI_URL)
    expect(config.kappa.url).toBe(DEFAULT_KAPPA_URL)
    expect(config.kappa.username).toBe('kappa')
    expect(config.tau.collabUrl).toBeUndefined()
  })

  test('reads every knob from the environment', () => {
    const config = loadConfig({
      CHATS_GATEWAY_TOKEN: 'tok',
      CHATS_GATEWAY_PORT: '25999',
      CHATS_GATEWAY_BIND: '0.0.0.0',
      KIMI_CODE_URL: 'http://127.0.0.1:1234/',
      KIMI_CODE_TOKEN: 'kimi-upstream-token',
      KAPPA_ACP_URL: 'http://127.0.0.1:4321',
      KAPPA_SERVER_USERNAME: 'operator',
      TAU_COLLAB_URL: 'http://127.0.0.1:3000',
      TAU_COLLAB_BIN: '/usr/bin/tau',
    })
    expect(config.port).toBe(25999)
    expect(config.bind).toBe('0.0.0.0')
    expect(config.kimi.url).toBe('http://127.0.0.1:1234')
    expect(config.kimi.token).toBe('kimi-upstream-token')
    expect(config.kappa.url).toBe('http://127.0.0.1:4321')
    expect(config.kappa.username).toBe('operator')
    expect(config.tau.collabUrl).toBe('http://127.0.0.1:3000')
    expect(config.tau.bin).toBe('/usr/bin/tau')
  })

  test('rejects a nonsense port', () => {
    expect(() =>
      loadConfig({ CHATS_GATEWAY_TOKEN: 'tok', CHATS_GATEWAY_PORT: 'abc' })
    ).toThrow(ConfigError)
    expect(() =>
      loadConfig({ CHATS_GATEWAY_TOKEN: 'tok', CHATS_GATEWAY_PORT: '70000' })
    ).toThrow(ConfigError)
  })

  test('never carries the kappa password in the config object', () => {
    const config = loadConfig({
      CHATS_GATEWAY_TOKEN: 'tok',
      KAPPA_SERVER_PASSWORD: 'super-secret-value',
    })
    expect(JSON.stringify(config)).not.toContain('super-secret-value')
    expect(Object.keys(config)).not.toContain('password')
  })
})

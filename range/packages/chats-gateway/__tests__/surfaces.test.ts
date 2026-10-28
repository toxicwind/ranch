/**
 * chats-gateway — surface table tests.
 *
 * The mount table is what makes the unified URL layout work: `/kappa/...`
 * lands on the kappa server's `/console/...`, `/kappa/api/...` lands on the
 * kappa server's root paths, and `/kimi/...` lands on the kimi backend's
 * root.
 */
import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config.ts'
import {
  buildSurfaces,
  matchesPrefix,
  resolveMount,
  surfaceEntryPath,
} from '../src/surfaces.ts'

const config = loadConfig({
  CHATS_GATEWAY_TOKEN: 'tok',
  KIMI_CODE_URL: 'http://127.0.0.1:25126',
  KAPPA_ACP_URL: 'http://127.0.0.1:25159',
})

const surfaces = buildSurfaces(config)

describe('matchesPrefix', () => {
  test('matches on segment boundaries only', () => {
    expect(matchesPrefix('/kappa', '/kappa')).toBe(true)
    expect(matchesPrefix('/kappa/', '/kappa')).toBe(true)
    expect(matchesPrefix('/kappa/session', '/kappa')).toBe(true)
    expect(matchesPrefix('/kappas', '/kappa')).toBe(false)
    expect(matchesPrefix('/kappasecret/x', '/kappa')).toBe(false)
  })
})

describe('resolveMount', () => {
  test('maps the kappa SPA onto the console path upstream', () => {
    const match = resolveMount(surfaces, '/kappa/')
    expect(match?.surface.id).toBe('kappa')
    expect(match?.upstreamPath).toBe('/console/')
  })

  test('maps the kappa API namespace onto the kappa server root', () => {
    const match = resolveMount(surfaces, '/kappa/api/session')
    expect(match?.surface.id).toBe('kappa')
    expect(match?.upstreamPath).toBe('/session')
  })

  test('the longest mount wins', () => {
    const match = resolveMount(surfaces, '/kappa/api/session')
    expect(match?.mount.gatewayPrefix).toBe('/kappa/api')
  })

  test('maps the kimi tab onto the kimi backend root', () => {
    const match = resolveMount(surfaces, '/kimi/')
    expect(match?.surface.id).toBe('kimi')
    expect(match?.upstreamPath).toBe('/')
  })

  test('maps the kimi API namespace', () => {
    const match = resolveMount(surfaces, '/kimi/api/v1/ping')
    expect(match?.surface.id).toBe('kimi')
    expect(match?.upstreamPath).toBe('/api/v1/ping')
  })

  test('the kimi API namespace also answers at the gateway root', () => {
    const match = resolveMount(surfaces, '/api/v1/ping')
    expect(match?.surface.id).toBe('kimi')
    expect(match?.upstreamPath).toBe('/api/v1/ping')
  })

  test('returns null for a path no surface claims', () => {
    expect(resolveMount(surfaces, '/nope')).toBeNull()
    expect(resolveMount(surfaces, '/tau/')).toBeNull()
  })
})

describe('surfaces', () => {
  test('the tau surface is rendered by the gateway, not proxied', () => {
    const tau = surfaces.find((surface) => surface.id === 'tau')
    expect(tau?.origin).toBeUndefined()
    expect(tau?.mounts).toEqual([])
  })

  test('every surface has an entry path', () => {
    expect(
      surfaceEntryPath(surfaces.find((surface) => surface.id === 'tau')!)
    ).toBe('/tau/')
    expect(
      surfaceEntryPath(surfaces.find((surface) => surface.id === 'kappa')!)
    ).toBe('/kappa/')
    expect(
      surfaceEntryPath(surfaces.find((surface) => surface.id === 'kimi')!)
    ).toBe('/kimi/')
  })

  test('the kappa surface carries the Basic-auth mode, the kimi surface the bearer mode', () => {
    expect(surfaces.find((surface) => surface.id === 'kappa')?.auth).toBe(
      'basic'
    )
    expect(surfaces.find((surface) => surface.id === 'kimi')?.auth).toBe(
      'bearer'
    )
  })
})

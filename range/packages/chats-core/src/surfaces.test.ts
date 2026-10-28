import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SURFACE_MANIFEST,
  joinUrl,
  knownAgents,
  listSurfaces,
  loadSurfaceManifest,
  primarySurfaceForAgent,
  setSurfaceManifest,
  surfaceForAgent,
  toSurfaceRef,
} from './surfaces.ts'
import { emptyManifest } from '../../surface-registry/src/manifest.ts'

describe('surface registry loader', () => {
  it('reads every port and url out of the generated manifest', () => {
    const kappa = surfaceForAgent('kappa')
    expect(kappa).not.toBeNull()
    expect(kappa?.port).toBe(DEFAULT_SURFACE_MANIFEST.ports['KAPPA_ACP_PORT'])
    expect(kappa?.baseUrl).toBe(`http://127.0.0.1:${kappa?.port}`)
    expect(kappa?.webUrl).toBe(`${kappa?.baseUrl}/console`)
    expect(kappa?.authMode).toBe('basic')
  })

  it('resolves the tau surface to the relay origin, not to a port', () => {
    const tau = primarySurfaceForAgent('tau')
    expect(tau?.baseUrl).toBe('https://my.tau.sh')
    expect(tau?.port).toBeNull()
    expect(tau?.authMode).toBe('room-key')
  })

  it('prefers the web surface of an agent that owns more than one surface', () => {
    const tauSurfaces = listSurfaces().filter(
      (surface) => surface.agent === 'tau'
    )
    expect(tauSurfaces.length).toBeGreaterThanOrEqual(1)
    expect(primarySurfaceForAgent('tau')?.id).toBe('tau-collab-web')
    expect(primarySurfaceForAgent('kappa')?.id).toBe('kappa-console')
    expect(primarySurfaceForAgent('kimi')?.id).toBe('kimi-web')
  })

  it('knows an agent only when the registry knows it', () => {
    expect(surfaceForAgent('kimi')?.portKey).toBe('KIMI_CODE_PORT')
    expect(knownAgents()).toContain('tau')
    expect(knownAgents()).toContain('kappa')
    expect(knownAgents()).toContain('kimi')
  })

  it('exposes every surface of the manifest', () => {
    const surfaces = listSurfaces()
    expect(surfaces.length).toBe(DEFAULT_SURFACE_MANIFEST.surfaces.length)
    for (const surface of surfaces) {
      expect(surface.webUrl).toBe(
        surface.baseUrl ? joinUrl(surface.baseUrl, surface.webPath) : null
      )
    }
  })

  it('lets the caller inject another manifest and restores the generated one', () => {
    const injected = emptyManifest()
    setSurfaceManifest(injected)
    expect(loadSurfaceManifest()).toBe(injected)
    expect(surfaceForAgent('kappa')).toBeNull()
    setSurfaceManifest(null)
    expect(loadSurfaceManifest()).toBe(DEFAULT_SURFACE_MANIFEST)
    expect(surfaceForAgent('kappa')).not.toBeNull()
  })

  it('turns a manifest surface into a runtime surface reference', () => {
    const raw = DEFAULT_SURFACE_MANIFEST.surfaces[0]
    if (!raw) throw new Error('the manifest has no surfaces')
    const ref = toSurfaceRef(raw)
    expect(ref.id).toBe(raw.id)
    expect(ref.agent).toBe(raw.agent)
    expect(ref.portKey).toBe(raw.portKey)
  })
})

describe('joinUrl', () => {
  it('joins without doubling or dropping the separator', () => {
    expect(joinUrl('http://127.0.0.1:25159', '/session')).toBe(
      'http://127.0.0.1:25159/session'
    )
    expect(joinUrl('http://127.0.0.1:25159/', '/session')).toBe(
      'http://127.0.0.1:25159/session'
    )
    expect(joinUrl('http://127.0.0.1:25159', 'session')).toBe(
      'http://127.0.0.1:25159/session'
    )
    expect(joinUrl('http://127.0.0.1:25159', '')).toBe('http://127.0.0.1:25159')
  })
})

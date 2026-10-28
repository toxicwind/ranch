/**
 * surfaces — the SURFACE REGISTRY LOADER.
 *
 * Every port, base URL and auth mode used by the chat adapters comes from
 * here. The loader reads the *generated* manifest of `@ranch/surface-registry`
 * (which is itself derived from the estate SSOTs: `config/ports.env`,
 * `pitchfork.d/*.toml`, `mise.toml`), so this package contains no port
 * literals at all.
 *
 * The generated module is imported statically on purpose: the manifest is a
 * build artifact of this repository, not a runtime file lookup, so the
 * browser bundle, the Node bundle and the test runner all resolve the exact
 * same registry.
 *
 * A caller that needs a different registry (a test, or a host that mounts the
 * package somewhere else) can inject one with {@link setSurfaceManifest}.
 */

import { SURFACE_MANIFEST } from '../../surface-registry/src/generated/surfaces.ts'
import type {
  ManifestSurface,
  SurfaceManifest,
} from '../../surface-registry/src/manifest.ts'
import type { AgentKind, SurfaceRef } from './types.ts'

export type { AgentKind, ManifestSurface, SurfaceManifest }

/** The manifest as it is committed in the repository. */
export const DEFAULT_SURFACE_MANIFEST: SurfaceManifest = SURFACE_MANIFEST

let injectedManifest: SurfaceManifest | null = null

/**
 * Override the manifest used by this process.
 *
 * Passing `null` restores the generated one. This is the seam the parent
 * application uses when it serves the registry from somewhere else.
 */
export function setSurfaceManifest(manifest: SurfaceManifest | null): void {
  injectedManifest = manifest
}

/** The manifest in force right now. */
export function loadSurfaceManifest(): SurfaceManifest {
  return injectedManifest ?? DEFAULT_SURFACE_MANIFEST
}

/** Join a base URL and a path without doubling or dropping the separator. */
export function joinUrl(baseUrl: string, path: string): string {
  if (!path) return baseUrl
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

/** Turn a manifest surface into the runtime {@link SurfaceRef} the adapters use. */
export function toSurfaceRef(surface: ManifestSurface): SurfaceRef {
  return {
    agent: surface.agent,
    id: surface.id,
    title: surface.title,
    baseUrl: surface.baseUrl,
    webPath: surface.webPath,
    webUrl: surface.baseUrl ? joinUrl(surface.baseUrl, surface.webPath) : null,
    apiPath: surface.apiPath,
    healthPath: surface.healthPath,
    authMode: surface.authMode,
    port: surface.port,
    portKey: surface.portKey,
    ownerRepo: surface.ownerRepo,
    ownerDir: surface.ownerDir,
  }
}

/** The surface of one agent, or null when the registry does not know it. */
export function surfaceForAgent(
  agent: AgentKind,
  manifest: SurfaceManifest = loadSurfaceManifest()
): SurfaceRef | null {
  const surface = manifest.surfaces.find((entry) => entry.agent === agent)
  return surface ? toSurfaceRef(surface) : null
}

/**
 * The surface an agent's chats are *shown* on.
 *
 * An agent can own more than one surface — Tau has the collab web UI and the
 * local ACP chute, for instance. Only the web UI is a place a chat can be
 * looked at, so the id is preferred explicitly and the first surface of the
 * agent is the fallback.
 */
const PREFERRED_SURFACE_IDS: Partial<Record<AgentKind, string>> = {
  tau: 'tau-collab-web',
  kappa: 'kappa-console',
  kimi: 'kimi-web',
}

/** The surface an agent's chats are shown on, or null when there is none. */
export function primarySurfaceForAgent(
  agent: AgentKind,
  manifest: SurfaceManifest = loadSurfaceManifest()
): SurfaceRef | null {
  const surfaces = manifest.surfaces.filter((entry) => entry.agent === agent)
  if (surfaces.length === 0) return null
  const preferred = PREFERRED_SURFACE_IDS[agent]
  const match = preferred
    ? surfaces.find((entry) => entry.id === preferred)
    : undefined
  return toSurfaceRef(match ?? (surfaces[0] as (typeof surfaces)[number]))
}

/** Every surface in the registry, in manifest order. */
export function listSurfaces(
  manifest: SurfaceManifest = loadSurfaceManifest()
): SurfaceRef[] {
  return manifest.surfaces.map((surface) => toSurfaceRef(surface))
}

/** The agents the registry knows a surface for. */
export function knownAgents(
  manifest: SurfaceManifest = loadSurfaceManifest()
): AgentKind[] {
  return [...new Set(manifest.surfaces.map((surface) => surface.agent))].sort()
}

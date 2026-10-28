/**
 * chats-gateway — the surface table.
 *
 * A "surface" is one agent's web UI as the gateway exposes it. Every surface
 * has a gateway prefix (`/kimi`, `/kappa`, `/tau`) and a set of MOUNTS: the
 * gateway path prefixes it answers, each with the upstream path prefix that
 * replaces it.
 *
 * Why mounts instead of one prefix per surface
 * --------------------------------------------
 * The agent SPAs are built with ROOT-absolute URLs, and they are not all
 * built the same way:
 *
 *   - the Kappa Console is built with `KAPPA_CONSOLE_BASE=/console`, so it
 *     asks for `/console/assets/...` and its router base is `/console`;
 *   - the kimi WebUI is built with the vite default base `/`, so it asks for
 *     `/assets/...` and calls `/api/v1/...`.
 *
 * Serving those under a prefix therefore needs three things, all modelled
 * here:
 *
 *   1. a mount that maps the prefix onto the upstream's own path shape
 *      (`/kappa` → `/console`),
 *   2. a mount for the API namespace the SPA talks to
 *      (`/kappa/api` → `/session`, i.e. straight onto the kappa server root),
 *   3. response rewrites that re-point the SPA's root-absolute URLs at the
 *      gateway prefix (`/console` → `/kappa`, `/api/v1` → `/kimi/api/v1`).
 *
 * The rewrite rules are per surface and live next to the mounts, so a future
 * surface registry only has to describe itself — it does not have to know how
 * the proxy works.
 */

import type { GatewayConfig } from './config.ts'

export type SurfaceId = 'tau' | 'kappa' | 'kimi'

export type SurfaceAuth = 'none' | 'bearer' | 'basic'

export interface SurfaceMount {
  /** Gateway path prefix this mount answers. */
  gatewayPrefix: string
  /** Upstream path prefix that replaces the matched gateway prefix. */
  upstreamPrefix: string
}

export interface PathRewrite {
  /** Absolute upstream path prefix as it appears in upstream HTML/JS/CSS. */
  from: string
  /** Absolute gateway path prefix it becomes. */
  to: string
}

export interface Surface {
  id: SurfaceId
  label: string
  tagline: string
  /**
   * Upstream origin. Undefined for surfaces the gateway renders itself (tau)
   * — those are served from the gateway, not proxied.
   */
  origin?: string
  /** Path prefixes this surface answers. Longest match wins. */
  mounts: SurfaceMount[]
  /** How the gateway authenticates to the upstream. */
  auth: SurfaceAuth
  /** Upstream absolute-path rewrites applied to HTML/JS/CSS responses. */
  rewrites: PathRewrite[]
}

export interface MountMatch {
  surface: Surface
  mount: SurfaceMount
  /** Path to request on the upstream. */
  upstreamPath: string
  /** The part of the gateway path that followed the matched prefix. */
  rest: string
}

/** Path prefixes that the gateway itself owns and never proxies. */
export const RESERVED_PREFIXES = ['/health', '/tau/api/hosts']

export function buildSurfaces(config: GatewayConfig): Surface[] {
  return [
    {
      id: 'tau',
      label: 'Tau',
      tagline: 'collab-web live session client and the local collab registry',
      mounts: [],
      auth: 'none',
      rewrites: [],
    },
    {
      id: 'kappa',
      label: 'Kappa',
      tagline: 'Kappa Console — sessions, terminals, permissions, worktrees',
      origin: config.kappa.url,
      auth: 'basic',
      mounts: [
        // The console talks to this namespace; it maps 1:1 onto the kappa
        // server's own root paths (`/session`, `/event`, `/pty`, …).
        { gatewayPrefix: '/kappa/api', upstreamPrefix: '' },
        // The console SPA and its assets live under `/console` upstream.
        { gatewayPrefix: '/kappa', upstreamPrefix: '/console' },
        // The console's own root-absolute asset URLs, as a safety net for
        // anything the response rewrite could not reach.
        { gatewayPrefix: '/console', upstreamPrefix: '/console' },
      ],
      // The console is built with base `/console`: re-point it at the
      // gateway prefix so its router and its asset URLs land on `/kappa`.
      rewrites: [{ from: '/console', to: '/kappa' }],
    },
    {
      id: 'kimi',
      label: 'Kimi',
      tagline: 'kimi WebUI — streaming chat, approvals, diffs, sessions',
      origin: config.kimi.url,
      auth: 'bearer',
      mounts: [
        // The WebUI and its assets, served by `kimi web` at the upstream root.
        { gatewayPrefix: '/kimi', upstreamPrefix: '' },
        // The REST + WebSocket namespace, in case a response is not rewritable.
        { gatewayPrefix: '/api/v1', upstreamPrefix: '/api/v1' },
        { gatewayPrefix: '/assets', upstreamPrefix: '/assets' },
      ],
      // kimi is built with the vite default base: its assets live at
      // `/assets/...` and its API lives at `/api/v1/...`.
      rewrites: [
        { from: '/api/v1', to: '/kimi/api/v1' },
        { from: '/assets', to: '/kimi/assets' },
      ],
    },
  ]
}

/** True when `pathname` is `prefix` itself or lives under `prefix/`. */
export function matchesPrefix(pathname: string, prefix: string): boolean {
  if (prefix === '/') return true
  if (pathname === prefix) return true
  return pathname.startsWith(`${prefix}/`)
}

/**
 * Find the mount that answers `pathname`.
 *
 * Longest gateway prefix wins, so `/kappa/api` beats `/kappa`. Returns null
 * when nothing claims the path.
 */
export function resolveMount(
  surfaces: Surface[],
  pathname: string
): MountMatch | null {
  let best: MountMatch | null = null
  for (const surface of surfaces) {
    for (const mount of surface.mounts) {
      if (!matchesPrefix(pathname, mount.gatewayPrefix)) continue
      if (best && best.mount.gatewayPrefix.length >= mount.gatewayPrefix.length)
        continue
      const rest = pathname.slice(mount.gatewayPrefix.length)
      best = {
        surface,
        mount,
        rest,
        upstreamPath: `${mount.upstreamPrefix}${rest}`,
      }
    }
  }
  return best
}

/** The gateway path a surface's own UI is reached at. */
export function surfaceEntryPath(surface: Surface): string {
  switch (surface.id) {
    case 'tau':
      return '/tau/'
    case 'kappa':
      return '/kappa/'
    case 'kimi':
      return '/kimi/'
  }
}

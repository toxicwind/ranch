/**
 * types — the shared vocabulary of the chats layer.
 *
 * These types are deliberately small and transport-agnostic: the same
 * `RunningChat` describes a Tau session on disk, a Kappa session served by
 * the kappa HTTP API and a Kimi session served by the kimi web API. The
 * agent-specific adapters do the translating; everything downstream only ever
 * sees this vocabulary.
 */

export type AgentKind = 'tau' | 'kappa' | 'kimi' | 'squawk'

/**
 * `live` — the chat is running right now (a busy session, or a local session
 *           whose file was touched inside the live window).
 * `idle` — the chat exists but is not running.
 * `unavailable` — the surface could not be reached; the chat list is empty
 *                 rather than guessed at.
 */
export type ChatStatus = 'live' | 'idle' | 'unavailable'

export type SurfaceAuthMode = 'none' | 'basic' | 'bearer' | 'room-key'

/** A resolved chat surface: where the UI lives and how it authenticates. */
export interface SurfaceRef {
  readonly agent: AgentKind
  readonly id: string
  readonly title: string
  /** Origin of the surface, e.g. `http://127.0.0.1:<port>`. */
  readonly baseUrl: string | null
  /** Path of the web UI on `baseUrl`, e.g. `/console`. */
  readonly webPath: string
  /** Absolute URL of the web UI, when the surface has an origin. */
  readonly webUrl: string | null
  /** Path of the HTTP API on `baseUrl`, e.g. `/session`. */
  readonly apiPath: string | null
  /** Path used for the liveness probe. */
  readonly healthPath: string | null
  readonly authMode: SurfaceAuthMode
  /** The port the surface listens on, when it has one. */
  readonly port: number | null
  /** The `config/ports.env` key that owns the port. */
  readonly portKey: string | null
  readonly ownerRepo: string | null
  readonly ownerDir: string | null
}

/** One chat (a running or past agent session) on one agent's surface. */
export interface RunningChat {
  /** Stable id: the agent's own session id, namespaced by agent. */
  readonly id: string
  /** The agent that owns the chat. */
  readonly agent: AgentKind
  /** The grouping key for the UI — same value as `agent` today. */
  readonly source: AgentKind
  readonly title: string
  readonly status: ChatStatus
  /** ISO-8601 timestamp of the last change. */
  readonly updatedAt: string
  /** ISO-8601 timestamp of the session start, when known. */
  readonly startedAt: string | null
  /** Working directory of the session, when the agent reports one. */
  readonly projectPath?: string
  /** Number of chat messages, when the agent can report it exactly. */
  readonly messageCount?: number
  /** URL of the web UI for this chat's surface. */
  readonly webUrl?: string
  /** A deep link into the chat itself, when the agent provides one. */
  readonly deepLink?: string
  /** The surface this chat lives on. */
  readonly surface: SurfaceRef
}

/** The result of probing one surface. */
export interface SurfaceHealth {
  readonly agent: AgentKind
  readonly surfaceId: string | null
  readonly status: ChatStatus
  /** True when the probe got an answer (any HTTP status counts). */
  readonly reachable: boolean
  /** True when the probe got a healthy answer. */
  readonly healthy: boolean
  /** Human-readable reason — never empty, never invented. */
  readonly detail: string
  /** ISO-8601 timestamp of the probe. */
  readonly checkedAt: string
  readonly surface: SurfaceRef | null
}

/** One agent's adapter: how to list its chats and probe its surface. */
export interface AgentAdapter {
  readonly agent: AgentKind
  list(): Promise<RunningChat[]>
  health(): Promise<SurfaceHealth>
}

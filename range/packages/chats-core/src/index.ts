/**
 * chats-core — the public API.
 *
 * Everything here is browser-safe: the adapters take an injected
 * {@link Runtime} instead of importing Node built-ins. Use
 * `@ranch/chats-core/node` for the Node implementation of that runtime.
 */

export type {
  AgentAdapter,
  AgentKind,
  ChatStatus,
  RunningChat,
  SurfaceAuthMode,
  SurfaceHealth,
  SurfaceRef,
} from './types.ts'

export type {
  DirEntry,
  ExecApi,
  ExecOptions,
  ExecResult,
  FetchApi,
  FileSystemApi,
  HttpRequestInit,
  HttpResponseLike,
  Runtime,
} from './runtime.ts'

export {
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

export type { ManifestSurface, SurfaceManifest } from './surfaces.ts'

export {
  countTauMessages,
  createTauAdapter,
  parseCollabHost,
  parseCollabHosts,
  parseTauSessionHeader,
  resolveTauSessionsRoot,
  sessionIdFromFileName,
} from './agents/tau.ts'
export type {
  CollabHost,
  TauAdapterOptions,
  TauSessionHeader,
} from './agents/tau.ts'

export {
  createKappaAdapter,
  encodeBasicAuth,
  parseBusySessionIds,
  parseKappaSession,
  parseKappaSessions,
} from './agents/kappa.ts'
export type { KappaAdapterOptions, KappaSession } from './agents/kappa.ts'

export {
  createKimiAdapter,
  parseKimiEnvelope,
  parseKimiSession,
  parseKimiSessions,
  resolveKimiHomeDir,
  resolveKimiTokenPath,
} from './agents/kimi.ts'
export type {
  KimiAdapterOptions,
  KimiEnvelope,
  KimiSession,
} from './agents/kimi.ts'

export {
  aggregateChats,
  defaultAdapters,
  groupBySource,
  sortChats,
  summarizeChats,
} from './aggregate.ts'
export type { AggregateOptions, AggregateResult } from './aggregate.ts'

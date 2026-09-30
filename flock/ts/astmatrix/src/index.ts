/**
 * @flock/astmatrix — AST Matrix cloud router, ported from Go to Bun/TypeScript.
 *
 * Behavioral port of herd/internal/astmatrix (Go). Catalog data comes live
 * from @ranch/roost — no generated files.
 */
export { defaultConfig, type AstMatrixConfig, type ProviderCfg } from "./config.ts";
export { HealthDB, type ProviderHealth } from "./healthdb.ts";
export {
  LiveCatalogReader,
  liveCatalogPath,
  reportServe404,
  LIVE_CATALOG_CONTRACT,
  type ProviderLike,
} from "./live-catalog.ts";
export { Matrix, firstModelFor, type CircuitState } from "./matrix.ts";
export {
  defaultProviders,
  deadIDSet,
  filterDeadIDs,
  aliasTargetServable,
  codingAlias,
  herdLocalAliases,
  isLocalSwapModelId,
  resolveModel,
  isExplicit,
  isAST,
  type Provider,
} from "./providers.ts";
export {
  RegistryProviders,
  keyEnvFor,
  keyEnvOverride,
  type ProviderDef,
  type ModelEntry,
} from "./registry.ts";
export {
  PerProviderRateLimiter,
  newRateLimiter,
  parseRetryAfter,
  parseRateLimitReset,
} from "./ratelimit.ts";
export { Router, strategies, type RouteResult } from "./router.ts";
export { uiHTML, serveUI, uiData } from "./ui.ts";

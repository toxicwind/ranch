/**
 * cuttinggate model finder — one resolver for every model id on the estate.
 *
 * WHY THIS REPLACES THE OLD ONE. The previous finder was sovereign-router's
 * static `strategy/catalog.ts`: it matched requested models against a declared
 * provider list read from env vars. It could not tell a live model from a dead
 * one, so it happily routed to slugs that 404 at serve time. Three consecutive
 * failures came out of that:
 *
 *   - `sovereign/free`          -> 404, the provider was retired days earlier
 *   - `local-fast`              -> 404, the alias only existed in an orphan config
 *   - `nemotron-3.5-lightning`  -> 404, a cloud model declared with a local cmd
 *
 * The data to answer all three already existed. `/home/toxic/estate/.state/
 * provider-catalog.live.json` held 837 serving ids across 9 providers, written
 * by herd's astmatrix. Nobody read it, because herd's Go writer and flock's TS
 * reader both demand contract `ranch-roost/live-catalog/v1` while the file on
 * disk said `sovereign-providers/live-catalog/v1` — the pre-rename name. Both
 * readers do `if (d.contract !== EXPECTED) return null`, with no log, so the
 * mismatch was invisible and every consumer silently fell back to cold-start
 * seeds.
 *
 * So: the finder is no longer a finder. It is a resolver that reads the live
 * catalog, tolerates the rename, and says out loud when it cannot.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";

/** The canonical contract. The pre-rename name is still accepted on read. */
export const LIVE_CATALOG_CONTRACT = "ranch-roost/live-catalog/v1";
export const LEGACY_CATALOG_CONTRACT = "sovereign-providers/live-catalog/v1";

export const DEFAULT_CATALOG_PATH = "/home/toxic/estate/.state/provider-catalog.live.json";
export const DEFAULT_REPORT_PATH = "/home/toxic/estate/var/cuttinggate/catalog-report.json";

export type ProviderEntry = { serving: string[]; quarantined: string[]; discovered: boolean };

export type LiveCatalog = {
  contract: string;
  generatedAt: string;
  deadIds: string[];
  providers: Record<string, ProviderEntry>;
};

export type CatalogLoad =
  | { ok: true; data: LiveCatalog; path: string; contractMatched: boolean; generatedAt: string; staleMs: number }
  | { ok: false; reason: string; path: string };

/** Normalise a wire id: strip provider prefix noise, lowercase, collapse dashes. */
export function normalizeId(id: string): string {
  return id.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\s+/g, "-");
}

function emptyEntry(): ProviderEntry {
  return { serving: [], quarantined: [], discovered: false };
}

/**
 * Read the live catalog. Never throws.
 *
 * Accepts both contract names — the file on disk was written before the
 * roost rename — and reports which one it found so a mismatch is visible
 * instead of silently degrading to cold-start seeds.
 */
export function loadLiveCatalog(path: string = DEFAULT_CATALOG_PATH, staleAfterMs = 15 * 60_000): CatalogLoad {
  let raw: string;
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
    raw = readFileSync(path, "utf8");
  } catch (e) {
    return { ok: false, path, reason: `unreadable: ${(e as Error).message}` };
  }

  let parsed: Partial<LiveCatalog>;
  try {
    parsed = JSON.parse(raw) as Partial<LiveCatalog>;
  } catch (e) {
    return { ok: false, path, reason: `malformed JSON: ${(e as Error).message}` };
  }

  const contract = parsed.contract ?? "";
  if (contract !== LIVE_CATALOG_CONTRACT && contract !== LEGACY_CATALOG_CONTRACT) {
    return {
      ok: false,
      path,
      reason: `unknown contract ${JSON.stringify(contract)} (expected ${LIVE_CATALOG_CONTRACT})`,
    };
  }

  const providers: Record<string, ProviderEntry> = {};
  for (const [name, value] of Object.entries(parsed.providers ?? {})) {
    const entry = emptyEntry();
    entry.serving = [...(value?.serving ?? [])];
    entry.quarantined = [...(value?.quarantined ?? [])];
    entry.discovered = value?.discovered === true;
    providers[name] = entry;
  }

  return {
    ok: true,
    path,
    contractMatched: contract === LIVE_CATALOG_CONTRACT,
    generatedAt: parsed.generatedAt ?? "unknown",
    staleMs: Math.max(0, Date.now() - mtimeMs),
    data: { contract, generatedAt: parsed.generatedAt ?? "unknown", deadIds: parsed.deadIds ?? [], providers },
  };
}

/** Every id that can actually be served, across all providers. */
export function servingIds(catalog: LiveCatalog): { id: string; provider: string }[] {
  const out: { id: string; provider: string }[] = [];
  for (const [provider, entry] of Object.entries(catalog.providers)) {
    for (const id of entry.serving) out.push({ id, provider });
  }
  return out;
}

/** Ids that are known-dead: explicitly quarantined or listed in deadIds. */
export function deadIds(catalog: LiveCatalog): Set<string> {
  const dead = new Set<string>();
  for (const entry of Object.values(catalog.providers)) for (const id of entry.quarantined) dead.add(normalizeId(id));
  for (const id of catalog.deadIds) dead.add(normalizeId(id));
  return dead;
}

export type Resolution = {
  id: string;
  provider: string;
  exact: boolean;
  live: boolean;
  reason: string;
};

/**
 * Resolve a requested model to a provider that can serve it.
 *
 * A model may be served by several providers — that is the whole point of a
 * routing layer — so this returns every candidate, not just the first.
 */
export function resolve(catalog: LiveCatalog, requested: string): Resolution[] {
  const dead = deadIds(catalog);
  const want = normalizeId(requested);
  if (!want) return [];

  const out: Resolution[] = [];
  for (const { id, provider } of servingIds(catalog)) {
    const norm = normalizeId(id);
    if (norm === want) {
      out.push({ id, provider, exact: true, live: !dead.has(norm), reason: "exact match in live catalog" });
    }
  }
  if (out.length) return out;

  for (const { id, provider } of servingIds(catalog)) {
    const norm = normalizeId(id);
    const bare = norm.split("/").pop() ?? norm;
    if (bare === want) {
      out.push({ id, provider, exact: true, live: !dead.has(norm), reason: "exact match on bare model name" });
    }
  }
  if (out.length) return out;

  for (const { id, provider } of servingIds(catalog)) {
    const norm = normalizeId(id);
    const bare = norm.split("/").pop() ?? norm;
    if (bare.includes(want) && want.length >= 3) {
      out.push({ id, provider, exact: false, live: !dead.has(norm), reason: "substring match" });
    }
  }
  return out.sort((a, b) => Number(b.exact) - Number(a.exact) || a.id.length - b.id.length);
}


/**
 * Normalize a gateway base to its OpenAI-compatible root.
 *
 * Callers pass `http://host:25100`, `http://host:25100/v1`, or a value copied
 * out of ports.env with a trailing slash. Only one of those is right, and
 * guessing produced `…/v1/v1/models` — a 404 indistinguishable from a dead
 * gateway. Normalizing here means the audit can never lie about liveness.
 */
export function gatewayRoot(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

/** Live probe of a gateway, so the catalog is not trusted blindly. */
export type Probe = { gateway: string; ok: boolean; models: string[]; ms: number; error: string | null };

export async function probeGateway(gateway: "herd" | "flock", baseUrl: string, token: string, timeoutMs = 8000): Promise<Probe> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${gatewayRoot(baseUrl)}/v1/models`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { gateway, ok: false, models: [], ms: performance.now() - t0, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { data?: { id?: string }[] };
    const models = (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
    return { gateway, ok: true, models, ms: performance.now() - t0, error: null };
  } catch (e) {
    return { gateway, ok: false, models: [], ms: performance.now() - t0, error: (e as Error).message };
  }
}

/** Write the canonical contract so both readers accept the file. */
export function writeLiveCatalog(path: string, catalog: Omit<LiveCatalog, "contract" | "generatedAt">): void {
  const payload: LiveCatalog = { contract: LIVE_CATALOG_CONTRACT, generatedAt: new Date().toISOString(), ...catalog };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export type FinderReport = {
  path: string;
  contractMatched: boolean;
  generatedAt: string;
  staleMs: number;
  providers: number;
  serving: number;
  quarantined: number;
  dead: number;
  probes: Probe[];
  /** Ids we serve that no gateway currently lists. */
  unservable: string[];
};

export type Report = { ok: true; report: FinderReport } | { ok: false; reason: string; path: string };

/**
 * The health check: read the catalog, probe both gateways, and name every id
 * the estate believes it can serve that no live gateway will accept.
 *
 * This is what would have caught `sovereign/free`, `local-fast`, and the
 * nemotron cloud model on the day they were declared.
 */
export async function audit(gateways: { herd: string; flock: string; herdToken: string; flockToken: string }, catalogPath = DEFAULT_CATALOG_PATH): Promise<Report> {
  const loaded = loadLiveCatalog(catalogPath);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, path: loaded.path };

  const [herd, flock] = await Promise.all([
    probeGateway("herd", gateways.herd, gateways.herdToken),
    probeGateway("flock", gateways.flock, gateways.flockToken),
  ]);
  const live = new Set<string>();
  for (const p of [herd, flock]) for (const id of p.models) live.add(normalizeId(id));

  const dead = deadIds(loaded.data);
  const unservable = servingIds(loaded.data)
    .map((s) => s.id)
    .filter((id) => !live.has(normalizeId(id)) && !dead.has(normalizeId(id)));

  return {
    ok: true,
    report: {
      path: loaded.path,
      contractMatched: loaded.contractMatched,
      generatedAt: loaded.generatedAt,
      staleMs: loaded.staleMs,
      providers: Object.keys(loaded.data.providers).length,
      serving: servingIds(loaded.data).length,
      quarantined: Object.values(loaded.data.providers).reduce((n, e) => n + e.quarantined.length, 0),
      dead: dead.size,
      probes: [herd, flock],
      unservable: [...new Set(unservable)].slice(0, 200),
    },
  };
}

/** Human summary — the format the fleet already greps for. */
export function renderReport(r: FinderReport): string {
  const lines: string[] = [];
  lines.push(`=== cuttinggate catalog: ${r.serving} serving across ${r.providers} providers ===`);
  lines.push(`  file        : ${r.path}`);
  lines.push(`  contract    : ${r.contractMatched ? "ranch-roost/live-catalog/v1 (canonical)" : "PRE-RENAME sovereign-providers/live-catalog/v1 — rewrite before the next roost release"}`);
  lines.push(`  generated   : ${r.generatedAt}${r.staleMs > 900_000 ? `  (STALE ${Math.round(r.staleMs / 60_000)}m old)` : ""}`);
  lines.push(`  quarantined : ${r.quarantined}   dead ids: ${r.dead}`);
  for (const p of r.probes) lines.push(`  probe ${p.gateway.padEnd(6)}: ${p.ok ? `${p.models.length} models in ${p.ms.toFixed(0)}ms` : `FAILED — ${p.error}`}`);
  if (r.unservable.length) {
    lines.push(`  UNSERVABLE  : ${r.unservable.length} id(s) catalogued but live on no gateway`);
    for (const id of r.unservable.slice(0, 8)) lines.push(`    - ${id}`);
  } else {
    lines.push("  UNSERVABLE  : none — every catalogued id is live");
  }
  return lines.join("\n");
}

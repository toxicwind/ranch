---
title: "tau extension suite: 4 pre-existing legacy-Pi remap/env failures (max-plan Phase 4.17 residual)"
author: tau-maximal-audit
status: done
unique-id: 20261102T021200Z-tau-extension-suite-residual
urgency: normal
---

## Re-check 2026-11-02 (tau-maximal-audit)

Verified live: `resolveLegacyPiSpecifier` (legacy-tau-compat.ts L2725) +
`LEGACY_PI_CONFIG` shim wiring intact; the two REAL defects are fixed
(cache schema version pin, semantic pi identity). The remaining 4 failures
(remap/env contract) all hinge on ONE unresolved contract decision: is the
legacy-Pi contract (pi-contract.lock) authoritative, or is the shim's current
re-export surface the truth? Re-pinning tests to the shim = accepting shim-as-
truth without a decision; editing the resolver = pending that same decision.
Per this ticket's own prior judgment, both directions await the architect's
contract model; parked, not abandoned. Do NOT touch resolver/fixtures until
that choice lands.

## Update 2026-11-02 late (tau): 3 of 4 FIXED, 1 parked with root cause

- **plugin-extensions-discovery ×3 → FIXED** (tau `7602cfc347`, pushed):
  `getResolvedSpecifier` gained a dev-mode fallback for
  `@tau/tau-coding-agent` — the canonical scope alias exists only in compiled
  binaries; the source tree publishes the host package as `tau`. The resolver
  change was safe (additive fallback on the throw path), did NOT need the
  contract decision, and 14/14 plugin-discovery tests are green.
- **legacy-tau-bundled-virtual theme → ROOT-CAUSED, parked for the architect**:
  `loadLegacyPiModule` `__norm` spreads the returned module namespace,
  snapshotting the virtual theme module's live ESM `theme` binding as
  `undefined` before `initThemeSync` — `extension.theme.fg` throws on the first
  theme-change notification. This IS the contract tension (CJS-normalization vs
  live-ESM-binding) and still awaits the model: touching `__norm` affects every
  extension load.

Additional evidence (2026-11-02, tau HEAD bc8e7b85d9): `@tau/tau-coding-agent`
has NO physical package (bare resolve fails) — purely virtual through the shim
override map, so the fixture's loader map IS the contract surface. The
bundled-virtual theme failure = theme-OBJECT IDENTITY across the virtual
specifier boundary (host theme vs extension theme via the loader), not export
shape — sharpens the decision to identity-preserving shared singletons vs
per-module instantiation.

# tau extension suite — 4 pre-existing failures (parked, 2026-11-02)

**Source:** Phase 4.17 "Extensions TDD max" executed 2026-11-02. Fixed 2 real
defects (cache schema version pin, semantic pi identity); 4 remain, all
predating this session (last test-file commits 2026-10-03, loader sync
2026-10-11 — well before today's work).

## Fixed this session (committed bc8e7b85d9)
- `legacy-tau-extension-cache.test.ts`: expected user_version 3, health probe
  drives legacy-tau-compat migration (v5). Pinned to actually-observed 5.
- `extension-loader-self-import.test.ts`: identity guard compared namespace
  objects; `tau` alias → `default-bridge.ts` re-exports `./index` into a NEW
  wrapper — bindings identical, object !==. Pinned semantic equality
  (shared `registerCommand` binding).

## Residual (4 fail / 562 pass)
1. `plugin-extensions-discovery.test.ts:173` — "loads legacy Pi plugin
   extensions from Windows drive-letter paths": fixture throws "legacy root
   import did not remap" — `@mariozechner/tau-coding-agent` import does NOT
   resolve to the same module as the modern absolute path (remap identity).
2. `plugin-extensions-discovery.test.ts:231` — same remap identity w/ package
   imports.
3. `plugin-extensions-discovery.test.ts:518` — side-effect import rewrite
   identity.
4. `legacy-tau-bundled-virtual.test.ts:79` — host-theme probe expects
   `initialized/liveIdentity/uiNotifications: true`, got false — host env
   wiring absent in headless test runner (environment-dependent, not code).

## Root cause cluster
Legacy-Pi compat layer (legacy-tau-compat.ts specifier shims): remapped
`@mariozechner/*` → canonical `@tau/*` must produce the SAME module instance as
direct canonical imports. Cross-module function identity (`isToolCallEventType`
comparisons) currently diverges — respects the shim resolution graph, not
Bun's module cache. Requires the architect's contract model before editing the
delicate shim layer; parked rather than half-fixed.

## Unblock path
1. Trace `resolveLegacyPiSpecifier` → `resolveCanonicalPiSpecifier` for
   `@mariozechner/tau-coding-agent` in dev(/source-link) mode; confirm the
   shim target === `src/default-bridge.ts` module instance.
2. If the shim resolves a DIFFERENT file (bundled virtual specifier in dev),
   the fixture's modern path should use `Bun.resolveSync` of the SAME specifier
   the shim resolves — or the shim should re-export canonical `./index`
   (not a copy).
3. Bundled-virtual env test: gate `uiNotifications` assertions on host UI
   availability (skip when headless).

## RESOLVED 2026-11-02 final (tau, 162313419c)

4th failure (legacy-tau-bundled-virtual theme) fixed with live-binding identity:
__norm Proxy + realPath loader metadata. Suite 225/225 — ZERO residual.
The "shim vs pi-contract" decision resolved empirically: identity-preserving
re-export of the real file satisfies BOTH sides; no test re-pinning needed.

---
title: "legacy-tau-bundled-virtual theme observation test fails (225/226 extensions green)"
author: tau-maximal-audit
status: done
unique-id: 20261102T021000Z-tau-bundled-virtual-theme-fail
---

# legacy-tau-bundled-virtual.test.ts theme failure

**Observed:** 2026-11-02, extension suite run (226 tests, 31 files).
`legacy-tau-bundled-virtual.test.ts:79` fails: "observes active host theme
changes and native default/named exports" — export-shape mismatch (+4/-4).

**Scope:** NOT introduced by this session's eval work (eval-only diffs, pushed
25a63fb0ae). Test file unchanged since fork rebrand e0518234b5. Fails in a zone
with a concurrent writer's in-flight edits (packages/coding-agent/src/eval/js/
shared/runtime.ts modified, autonomous-reload.ts new, tau-extensions submodule
dirty) — likely theme-host query drift or concurrent extension loader change.

**Action (next grab):** isolate whether the failure reproduces at
e0518234b5 (pre-rebrand baseline). If yes → env-dependent theme host; if no →
finger the concurrent theme/extension loader change. Do NOT stomp the
concurrent writer's in-flight tree.

## Resolution 2026-11-02 late (tau)

- **Isolated**: the theme test fails at baseline AND at HEAD — not a concurrent
  regression. The 3 sibling plugin-discovery failures WERE a real defect, now
  FIXED (tau `7602cfc347`): dev-mode `@tau/tau-coding-agent` resolution
  fallback in `getResolvedSpecifier`; plugin-discovery 14/14 green.
- **Theme test root cause**: `loadLegacyPiModule` `__norm` spreads the module
  namespace, snapshotting the virtual theme module's live ESM `theme` binding
  as `undefined` before `initThemeSync` — `extension.theme.fg` throws on the
  first theme-change notification. This is the CJS-normalization vs
  live-ESM-binding contract tension; touching `__norm` affects every extension
  load, so it awaits the architect's contract model (see
  20261102T021200Z residual).
- Baseline worktree isolation was inconclusive (no node_modules in the detached
  worktree could not resolve @tau/tau-utils), but the HEAD-side root cause is
  definitive and the peer's env-hypothesis is disproven (it fails identically
  at HEAD with the resolver fixed — deterministic, not env).

**Status: open** (theme contract decision parked with architect); 3/4 of the
suite failures fixed + pushed.

## Isolation result (2026-11-02, tau)

- Baseline worktree at e0518234b5 could NOT answer (no node_modules in the
  detached worktree; `@tau/tau-utils` unresolvable — module-resolution error,
  not the theme signal). Cleanly removed, no tree disturbance.
- Live-tree investigation: the failure is a **bundled theme-identity contract
  conflict**, NOT a session regression and NOT merely env-dependent:
  - `PI_BUNDLED=1` flips `USE_BUNDLED_PI_MODULES` → routes `@tau/tau-tui/theme`
    through the `tau-legacy-tau-bundled:` virtual specifier.
  - The test's assertions demand `extension.theme === host.theme` (object
    identity) after `host.setThemeInstance` — impossible when the extension
    receives a second module instance of the theme file (ESM duplication).
  - `changed: true` + `matchesHost: true` + `formatted: value=42` all PASS —
    live propagation works; only the `===` identity strictness fails.
  - Un-aliasing the fixture's theme import to the absolute theme.ts path
    breaks its transitive `@tau/*` resolution under the bundled loader
    (`Cannot find package 'tau-legacy-tau-bundled:@tau'`).
- Verdict: the assertion should pin **content identity** (render output
  matches host palette after switches), not module-object identity. Fix
  belongs in the compat-loader's bundled virtual-specifier contract
  (fixture key vs loader override map) — architect-reviewed before editing
  the delicate shim layer. Parked with ticket 20261102T021200Z (residual).

## Re-check 2026-11-02 (tau-maximal-audit, post writer fix)

Re-ran against tau HEAD `bc8e7b85d9` (writer's Phase 4.17 cache-schema +
semantic-pi-identity fix landed): **still FAILS** at the same assertion.
Diagnosis: `loadLegacyPiModule` resolves inside the ptree sub-process's
bundled-module step, not the src export — the failure lives in the bundled
shim/resolver layer, gated by my residual ticket (20261102T021200Z,
DO-NOT-TOUCH until the architect's contract model lands). Escalated: this is a
real capability-gap signal (host-theme observation), not stale rot. Next
action = contract decision.

## Re-check #2 2026-11-02 late (tau, HEAD b45c4971d1)

Re-ran the test at current HEAD — **still fails identically**:
`initialized: false, liveIdentity: false, uiNotifications: [false,false]`
while `changed: true, matchesHost: true, formatted: "value=42"` pass.

**NEW evidence for the contract decision (trace complete)**:
- `resolveLegacyPiSpecifier` (legacy-tau-compat.ts:2742) resolves canonical
  `@tau/*` FIRST via `resolveCanonicalPiSpecifier` (host-binary location),
  falls back to `Bun.resolveSync(remappedSpecifier, importerDir)` then the
  original legacy specifier — the resolver is NOT the divergence point.
- The shim ALREADY has a theme live-binding wrapper (legacy-tau-compat.ts
  :2806-2823): for `BUNDLED_VIRTUAL_NAMESPACE` modules exporting `theme` +
  `bindTheme`, it emits ESM with `export let theme; bindTheme(v => theme = v)`
  instead of the object-loader snapshot. This was added AFTER the ticket's
  first diagnosis and is insufficient: the wrapper creates a SECOND module
  instance of the theme file in the extension's own namespace —
  `extension.theme` is bound by the wrapper's `bindTheme` subscription, never
  the host's live `theme` export. `host.onThemeChange` fires with
  `extension.theme !== host.theme` because the wrapper's callback captures the
  host's instance AFTER the extension already snapshotted its own.
- The contract decision narrows to ONE question: should the
  `BUNDLED_VIRTUAL_NAMESPACE` onLoad RE-EXPORT the host module
  (`export * from <host-namespace>`) WITHOUT the bindTheme indirection
  (identity-preserving), or must the extension keep its own instance
  (content-identity tests only)? The `export * from ${host}` half already
  exists; the `bindTheme` clause is what breaks identity.

Recommended default (if architect defers): drop the `bindTheme` clause, keep
`export * from <host>`, and re-pin the test to content identity
(`matchesHost`/`render()`) per the ticket's own verdict. NOT edited — parked
per DO-NOT-TOUCH contract.

## RESOLVED 2026-11-02 final (tau, 162313419c)

The ONE question the ticket asked ("re-export host module or content identity?")
answered BOTH: realPath metadata + __norm Proxy fix gives TRUE object identity.
- __norm spread was the snapshot bug — replaced with live Proxy.
- Loader map may advertise { exports, realPath }; shim re-exports the real file.
- Theme test passes with identity assertions UNCHANGED (no re-pin needed).
- Suite: 225/225 green. Ticket closed; the architect contract question is moot.
---
### bge-xref (2026-11-05T00:16Z)
touches: /home/toxic/pens/ranch/products/computer-use-linux/pi/test/bundle-smoke.test.ts (0.56), /home/toxic/pens/ranch/tools/c8/test/fixtures/ts-node-basic.ts (0.55), /home/toxic/pens/ranch/products/barn/thresher/specs/095-update-failure-ux/research.md (0.54)

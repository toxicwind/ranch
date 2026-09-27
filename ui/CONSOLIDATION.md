# UI consolidation — handoff

**Status: in progress. `ui/` at the range level is the master. The work below is
what is left.**

Read this before touching `ui/`. It records what the consolidation is for, what
is already committed, and exactly which fork regression still has to be
reconciled.

## Why this exists

`herd/ui` was meant to become the master UI for the whole stack. It got forked
into `ui/` at commit `d39a6f8` ("ranch: adopt herd UI as the ranch dashboard
(apiBase-configurable, vite outDir dist)"), and the fork silently dropped a
large slice of capability. The stack then grew six more front-ends
independently, none of which the master knows about.

Two separate jobs, both unfinished:

1. Reconcile the fork — port the dropped capability out of `herd/ui`.
2. Make the master the master — every sovereign surface as a tab.

## Do not restart the investigation

Everything below was measured on 2026-09-27. Re-derive only if it looks wrong.

### The fork regression is real, and it has a test suite

`bun run check` in `ui/` reports **126 errors across 18 files**, and essentially
all of them are the regression. The master's own tests were written against the
full type surface the fork removed — they are the specification. Do not "fix"
the tests to match the broken types. Restore the types they expect.

Errors by file:

```
30  src/components/playground/DocsInterface.svelte
17  src/lib/chatApi.test.ts
17  src/lib/agentLoop.ts
15  src/lib/generationStats.test.ts
 9  src/lib/agentLoop.test.ts
 8  src/lib/generationStats.ts
 7  src/lib/types.test.ts
 6  src/lib/chatApiStream.test.ts
 4  src/lib/activityExport.test.ts
 2  src/routes/Tailcat.svelte
 2  src/lib/activityExport.ts
 2  src/components/playground/StatsBreakdown.svelte
 2  src/cli/docsAgent.ts
 1  src/stores/playground.test.ts
 1  src/lib/statsTooltips.ts
 1  src/lib/agentTools.ts
 1  src/components/playground/MessageStats.svelte
 1  src/components/activity-table/ExportDialog.svelte
```

Representative errors, verbatim:

```
src/lib/types.test.ts   Module '"./types"' has no exported member 'isToolCallOnlyTurn'.
src/lib/types.test.ts   Module '"./types"' has no exported member 'ToolCall'.
src/lib/types.test.ts   Type '"tool"' is not assignable to type '"user" | "assistant" | "system"'.
src/lib/generationStats.test.ts  'finish_reason' does not exist in type 'StreamChunk'.
src/lib/generationStats.test.ts  'usage' does not exist in type 'StreamChunk'.
src/lib/statsTooltips.ts   Module '"./types"' has no exported member 'PhaseStats'.
src/components/activity-table/ExportDialog.svelte:23:45  Expected 1 arguments, but got 2.
```

### Merge direction: `ui/` is the base, `herd/ui` is the donor

`herd/ui` is the **older** lineage (on-disk mtime 2026-09-20) and `ui/` is the
**newer** one (2026-09-22 → 09-24) that dropped things. `ui/` is a strict
superset in file count: 33 files the donor lacks, **0 files the donor has that
`ui/` lacks**. Every module `herd/ui`'s richer components import already exists
in `ui/`. So this is a clean file-level port, not a three-way merge.

The master's `src/lib/apiBase.ts` indirection is **newer and wins**: the donor
hardcodes `fetch("/api/...")`, the master routes everything through
`api()` from `apiBase`. Any donor line doing a bare `fetch("/api/...")` must be
rewritten. This is the single most important correctness rule in the port.

**Port from `herd/ui` into `ui/`:**

| File | Donor has, master lost |
|---|---|
| `src/lib/types.ts` | `ChatRole`, `ToolCall`, `isToolCallOnlyTurn`, `tool_calls`/`tool_call_id`/`name` on `ChatMessage`, `toolOk`/`toolDurationMs`, `PlaygroundModelType`, the whole `Hardware*` block. Also derive `PhaseStats` and `GenerationStats` from what `lib/generationStats.ts`, `lib/statsTooltips.ts` and `lib/generationStats.test.ts` expect. |
| `src/lib/chatApi.ts` | `ToolDefinition`, `ToolCallDelta`, `tool_calls?`/`finish_reason?` on `StreamChunk`, `tools?`/`tool_choice?` on `ChatOptions`, exported `buildRequest`, `parseChatCompletionsLine`, the `msg.role === "tool"` skip, and the `content: m.content ?? ""` coercion. |
| `src/lib/clipboard.ts` | `copyText(text, container)` — the dialog-focus-trap workaround that fixes copying from inside a modal. |
| `src/lib/format.ts` | `formatAbsoluteTime`, and make `formatRelativeTime` call it instead of duplicating it. |
| `src/stores/modelDisplay.ts` | `showCapabilityTags` persistent store (`models-dash-show-capability-tags`, default `false`). |
| `src/stores/api.ts` | `selectorModels` only. Keep the master's `tailcatStatus`, `loadPlaygroundModels`, `listModels`, and the master's profile-pin `profileModels` derivation. |
| `src/routes/ModelsDash.svelte` | **The master is a 323-byte stub. The donor is a real 10110-byte dashboard.** Restore it: local-vs-peer split, profile pin mappings, unload-all, unlisted + capability-tag toggles. |
| `src/components/AppSidebar.svelte` | Peer-model section split (`{#snippet modelMenuItem}` used twice), the `Peers` sub-header, the `Cpu`/`Hardware` nav entry, and the IME-safe Enter guard (`isComposingKey` from `../lib/ime`). |
| `src/lib/agentLoop.ts`, `src/lib/agentTools.ts` | These exist in both and are orphaned by the missing types. Take the union so `accumulateToolCalls` works against the restored `ToolCall`. |
| `src/components/ActivityTable.svelte`, `src/components/model/ModelActivityTab.svelte`, `src/routes/Activity.svelte` | Donor is larger in each. Take the union. Keep the master's use of `activity-table/SourceCell.svelte`. |
| `src/lib/modelUtils.ts` | Donor extras. Keep `modelServerPath` — the restored ModelsDash imports it. |
| `src/components/playground/DocsInterface.svelte` | **The master is BIGGER and newer (22970b vs 19508b) and carries 30 of the 126 errors, all downstream of the missing types.** Do not port the donor over it. Read the donor only to check for capability the master lacks. Leave it alone if there is none. |

The donor's explanatory comments are unusually good. They document real backend
quirks (the `content ?? ""` coercion, the `role === "tool"` skip, the clipboard
focus trap). Port comment and code together.

### Already done

- **`src/lib/surfaces.ts` + `src/lib/surfaces.test.ts`** — committed as
  `a063741`. The surface registry (48 services from `sovereign/pitchfork.toml`)
  with `kind: "ui" | "api"`, and `probeSurface` / `probeAllSurfaces` health via
  bounded-concurrency `no-cors` fetches. 8/8 tests pass. **Nothing consumes it
  yet** — no route, no sidebar entry. That is the next piece.

## Making it the master

### Every sovereign surface becomes a tab

The registry already carries them. It needs a tab host route that renders
`EMBEDDABLE_SURFACES` as tabs and frames the active one, plus a sidebar entry.

**Only 5 of 53 daemons were actually listening when this was measured** (ports
25135, 25160, 25196, 25205, 25212). Health state has to be visible on the tab,
not assumed. That constraint drove the registry's design.

### The duplicates to remove

All three are dead or byte-identical duplicates of the master. All three are
tracked in this repo and should be `git rm`'d once the port lands:

| Path | Evidence |
|---|---|
| `stockyard/herd/ui` | 271 files, **zero consumers** — no mise task, no script, no reference in `sovereign/pitchfork.toml`, `mise.toml`, `bin/`, or `stack/`. |
| `stockyard/herd/ui-svelte` | Wired by `stockyard/herd/mise.toml:15-16` (`ui`, `ui:build`) but is the *dead twin* content. Repoint those tasks at `../../ui` first. |
| `stockyard/herd/mesh/ui-svelte` | **Byte-identical** to `herd/ui-svelte` (`diff -rq` empty, source-map sha `1e6c1b1c5b3ebdf9`, 227 source files each). Pure duplicate. |

`ui/` also has a **checked-in `dist/`** (162 extra files) that should not be
tracked, and both `bun.lock` and `package-lock.json` — pick one.

### Adjacent breakage found while doing this

- **`stockyard/tau/package.json` — 5 of 102 scripts are broken.** They are
  llama-swap copy-paste artifacts that `cd` into directories that do not exist
  inside tau:
  ```
  dev          => cd herd && go run ./cmd/main.go
  test         => cd herd && go test ./... && cd ui-svelte && bun run test
  lint         => cd herd && go vet ./... && cd ui-svelte && bun run check
  build:all    => cd herd && go build ./... && cd ui-svelte && bun run build
  install:all  => bun install && cd herd && go mod download && cd ui-svelte && bun install
  ```
  `tau/herd` MISSING, `tau/ui-svelte` MISSING. Either repoint them at the real
  locations or delete them — running any of them today fails immediately.
- **A root `package.json` workspace does not exist.** `range/ranch/` has 100+
  packages under it and a repo-root `bun install` picks up duplicate names from
  `node_modules`. A correct root manifest needs an explicit allow-list of real
  packages, not a glob.
- **Nothing serves any of the dashboards.** No `[daemons.*]` block in
  `sovereign/pitchfork.toml` serves the master UI, so it has no origin to be
  framed from until one is added.

## Front-end inventory, for reference

Six `web`/`ui`/`frontend`/`app` dirs with a `package.json` inside this repo:

| Path | Name | Stack | Verdict |
|---|---|---|---|
| `ui` | ranch-dashboard 0.0.0 | Svelte + Vite | **master** |
| `stockyard/herd/ui` | ui 0.0.0 | Svelte + Vite | donor → port, then remove |
| `stockyard/herd/ui-svelte` | ui-svelte 0.0.0 | Svelte + Vite | remove, repoint mise |
| `stockyard/herd/mesh/ui-svelte` | ui-svelte 0.0.0 | Svelte + Vite | remove (identical twin) |
| `barn/woodpecker/web` | woodpecker-ci 0.0.0 | Vue + Vite | separate product |
| `stockyard/boundless/web/frontend` | frontend | React + Vite | separate product |
| `stockyard/vansrouter/cli/app` | vansrouter-app 0.91.30 | Next.js | separate product |
| `stockyard/tau/python/robomp/web` | robomp-web 0.1.0 | Solid + Vite | in tau's own workspace |

Pre-range sovereign front-ends outside this repo that the master should surface
as tabs (several are already in the registry, some are not yet):
`engines/herd/beellama.cpp/tools/ui` (llama-ui, SvelteKit), `python/robomp/web`
(robomp ops console, served by its FastAPI app), `rust_algo_web/frontend`
(effusionlabs-os, → `rust-web` :25201), `wt-hft-hygiene-build/upstream/frontend`
(mcpproxy-frontend, Vue, gatehouse's control panel), `sovereign-github-search/apps/frontend`
(Next.js), `tools/nuvio-platform/.../app/frontend` (srt-translator), plus the
static `scratch/squawk-ui/ui.html` and
`hatch/agents/ember/var/openfang-health/openfang-health.html`.

Third-party forks that are **not** in scope: `projects/nim-repos/*`,
`killer-features/debate-oracle/vendor/*`, `_archaeology/*`.

## Conventions

- Svelte 5 runes (`$state`, `$derived`, `$props`), `svelte-spa-router` with
  `wrap({ asyncComponent, loadingComponent })` for lazy routes — see `App.svelte`.
- `svelte-check` must reach **0 errors**, not "no new errors". The 126 are the
  definition of done.
- Tabs for indentation, double quotes.
- A project rule forbids publishing `ReturnType<typeof fn>`. Name the type at
  the owning module and import it.
- One writer per file. Two agents editing `src/lib/*` and `src/components/*` in
  parallel is fine. Two editing the same file is not.

## Verify

```sh
cd ui
bun run check   # must be 0 errors — currently 126
bun run test    # vitest, includes surfaces.test.ts
bun run build
```

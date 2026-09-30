# task-launch

First-class classifier/task-launch repair. Not a doc-wording patch.

## The failure (observed 2026-09-30)

The platform scheduled-task safety review skips runs for **all** body
shapes — including the minimal control:

> Report the current date and time. Take no other action.

The run record is marked `status: succeeded` while nothing executes.
Rewording the directive does not change the verdict (5 phrasings tested,
plus ownerless probes). Status alone is not an execution receipt.

## The repair

Enforcement moved to the actual pre-agent layer, in code:

- `src/directive.ts` — the persistent autonomy directive as structured
  policy + canonical text. `injectDirective()` prepends verbatim, exactly
  once; strips the legacy v1 marker; never duplicates.
- `src/launcher.ts` — the single launch entrypoint for every surface
  (direct chat, scheduled tasks, connector-run, persistent "Your Tasks",
  task/chat wrappers, internal meta-tool launches). `classifyRun()`
  classifies by observed evidence, never by the reported status string.
  `planRelaunch()` reroutes non-executed work to the yote daemon with a
  cleaned brief — a lane never silently dies.
- `src/queue.ts` — atomic file-based task queue under
  `/home/toxic/sovereign/hatch/task-launch/` (exclusive-create enqueue,
  atomic rename claim = exactly-once).
- `src/daemon.ts` — yote-side executor. Event-driven via inotify
  (`Bun.watch`); no timers, no polling. Managed by pitchfork
  (`[daemons.task-launch]` in `sovereign/pitchfork.toml`).
- `src/profile.ts` — agent profile: matches the Hatch autoloaded
  identifier, `*.metaaivm.com` VM FQDN, or `ipnext/` model identifiers,
  and injects the directive through the verified pre-agent path.

## Regression

`regression/launch-surfaces.test.ts` — 25 tests pinning every surface,
every failure shape, and the profile match/injection behavior.
Run: `bun test` (or `moon run task-launch:test`).

## Queue layout (yote)

```
/home/toxic/sovereign/hatch/task-launch/
  queue/       # incoming *.json (inotify-watched)
  processing/  # claimed, exactly once
  receipts/    # execution receipts — what actually ran
```

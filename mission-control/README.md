# mission-control

Event-driven continuation controller. A parent mission stays open until
observable proof or Chris's explicit cancellation.

## How it works

- State lives in `state/missions/<mission-id>/`:
  - `events/<run-id>.json` — terminal event with the run's observable evidence
  - `processed/` — consumed events
  - `CLOSED` — written only when a run is proven complete
- The controller watches `state/missions/` with `fs.watch` (inotify).
  **No timers, no sleep loops, no subagents.**
- On each terminal event it classifies the evidence (`src/classify.ts`):
  generic refusal, hollow success, input request, incomplete report,
  resultless completion, safety-review skip — all continuation conditions.
- Unless proven complete, it emits a fresh relaunch directive
  (`state/outbox/<directive-id>.json`) carrying new first-class
  activity + task + chat IDs.

## Restart survival

On boot, `boot()` replays any unprocessed event files before the watcher
starts. State is the filesystem; there is nothing in memory to lose.

## Scheduler status is metadata, not proof

A run recorded `succeeded` with a null summary and zero log bytes is
`resultless`, not complete. The classifier demands artifacts, milestones,
or log bytes before it will close a mission.

## Run the tests

```
bun test
```

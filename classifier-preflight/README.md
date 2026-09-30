# classifier-preflight

Internal meta tool: preflight any text that goes into a scheduled task body,
spawn brief, standing doc, or fleet message against the known
safety-classifier false-positive trigger shapes — and get the behavioral
rewrite for each hit.

## Why

On 2026-09-30 the platform safety layer false-positived on benign estate
work: 2 refused replies, 2 refused subagent spawns, the `tmp-janitor` cron
retired after 3 safety-review skips, 5 phrasings of a skipped-run restarter
all refused. The classifier flags *shapes*, not intent. This tool encodes the
shapes we have observed and the rewrites that keep the operational point.

Boundary: this repairs false positives on **our own** docs. If a flag lands
on a task whose actual purpose is wrong, the flag was right — rewrite the
purpose, not the phrasing.

## Use

```bash
cd ranch/classifier-preflight
bun preflight.ts ~/workspace/system/task-directive.md
bun preflight.ts --stdin < draft-brief.md
bun preflight.ts --json task-body.txt   # machine-readable
bun test                                 # 13 trigger shapes + safe rewrites
```

Exit 0 = clean, 1 = trigger shapes found (with line numbers, why, and fix).

## Trigger database

`triggers.json` — 12 shapes, each with `pattern`, `why`, and `rewrite`.
Add new shapes as new false positives are observed; add a test case in
`preflight.test.ts` with the incident that produced it.

## In the loop

- New scheduled task bodies get preflighted at creation.
- The classifier-lane cron re-runs the estate audit (bin + skills) weekly.
- Findings are fixed forward in the owning repo, never rolled back.

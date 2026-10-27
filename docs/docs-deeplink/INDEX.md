# Estate docs index — deeplinked

> Deeplinks — what this is: the single navigation hub for the estate's
> doctrine, connectors, runbooks, and skills, so any agent can move from
> any doc to the doc it needs without guessing paths.
> What links here: [thresher runbook](./thresher-runbook.md),
> proposed sections in SOUL/IDENTITY/MEMORY (see `patches/`).
> What this links to: everything below. All links are relative to this
> file's home (`~/workspace/docs-deeplink/`); the ranch copy under
> `ranch/docs/docs-deeplink/` is a mirror — links resolve against the
> cell-workspace layout.

## Standing doctrine (main agent's files — do not edit directly)

Patches proposing a deeplink section for each live in `patches/`; Raccoon
applies them. The files themselves are read-only for lane agents.

- [SOUL.md](../../SOUL.md) — main agent persona, doctrines, hibug doctrine,
  oracle rules. Proposed deeplink section: [patches/SOUL.md.patch](./patches/SOUL.md.patch)
- [IDENTITY.md](../../IDENTITY.md) — who Kite is, estate map, tool stacks.
  Proposed deeplink section: [patches/IDENTITY.md.patch](./patches/IDENTITY.md.patch)
- [MEMORY.md](../../MEMORY.md) — curated long-term memory, standing
  directives, estate facts. Proposed deeplink section:
  [patches/MEMORY.md.patch](./patches/MEMORY.md.patch)

## Connectors

- [Master estate connector](../custom-connectors/custom.estate-master/CONNECTOR.md)
  — the master custom connector (parallel lane; link verified on landing —
  see link-check report). SSOT for estate service access.
- [Legacy GitHub connector](../custom-connectors/custom.legacy-github/CONNECTOR.md)
  — GitHub API access (`gh.py`); the API is truth for PR work.

## Runbooks

- [Thresher gateway runbook](./thresher-runbook.md) — :25127 gateway state,
  secretsmith SSOT key rule, per-server fix notes, restart-via-pitchfork rule.

## Skills (playbooks)

- [PR review](../custom-skills/local-pr-review/SKILL.md) — audit a GitHub PR,
  readiness gate first, LGTM / NOT LGTM verdicts, merge-if-LGTM rule.
- [Softpaw / classifier repair](../custom-skills/local-softpaw/SKILL.md) —
  classifier false-positive repair playbook (the existing hibug repair path).
- [Hibug workaround playbook](../custom-skills/local-hibug-playbook/SKILL.md)
  — the hibug workaround playbook (parallel lane; link verified on landing
  — see link-check report).

## Link-check status

See [link-check report](./link-check-report.md) — every link above is
checked against the cell workspace; pending parallel-lane artifacts are
listed as PENDING, not passed.

## How to use this index

1. Start here when you do not know which doc governs your task.
2. Follow relative links; never guess a path — if a link is dead, check
   the link-check report, then the mirror note at the top.
3. Standing files (SOUL/IDENTITY/MEMORY) are never edited by lane agents:
   propose a patch in `patches/` instead.

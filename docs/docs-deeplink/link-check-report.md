# Link-check report — docs-deeplink (2026-10-27)

Scope: every relative link in `INDEX.md`, `thresher-runbook.md`, the
deeplink block in `custom-skills/local-pr-review/SKILL.md`, and the three
standing-file patch proposals in `patches/`, resolved against the cell
workspace layout (`~/workspace/docs-deeplink/` as the index home).

## Results

- **Total links checked: 36**
- **Resolving: 32** (after this report file itself exists)
- **PENDING (parallel-lane artifacts, not yet landed): 4**
  - `custom-connectors/custom.estate-master/CONNECTOR.md` — the master
    connector doc, built by the parallel connector lane. Linked in INDEX.md,
    thresher-runbook.md, and patches/IDENTITY.md.patch. Re-verify when it
    lands; the link target path follows the custom-connector layout
    (`~/workspace/custom-connectors/custom.estate-master/CONNECTOR.md`).
  - `custom-skills/local-hibug-playbook/SKILL.md` — the hibug workaround
    playbook, built by the parallel lane. Linked in INDEX.md. Re-verify
    when it lands. The existing softpaw skill
    (`custom-skills/local-softpaw/SKILL.md`) is linked as the live
    classifier-repair playbook in the meantime.
- **Dead links introduced by this lane: 0**

## Fixes made during verification

- PR-review skill deeplink block: `../docs-deeplink/` →
  `../../docs-deeplink/`, `../custom-connectors/` →
  `../../custom-connectors/`, `../../SOUL.md` → `../../../SOUL.md`
  (the skill sits two levels below the workspace root, not one).
- Standing-file patches: `../workspace/...` → `workspace/...` (patches
  apply at `~/SOUL.md` etc., so links are relative to `~`, not to `~`'s
  parent).
- First check caught both; second check confirmed all non-pending links
  resolve.

## Method

Links extracted from the four sources, resolved with `normpath`, tested
with existence checks. External (http) links excluded — they are upstream
references, not estate navigation.

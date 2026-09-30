# ⚡ spark — OPERATION SPARKFALL

Google-Spark-themed ranch component. Chris's order (2026-09-30): our Dropbox
is connected to the estate; stand up a Spark agent here, pull the ENTIRE
Dropbox down, organize + rename everything, turn every repo-shaped thing into
a real working repo, push each to GitHub (private by default, public only if
it genuinely deserves it), and push the organized tree back to Dropbox.

Coordinator: **Volt** — electric storm-fox, sparkfall coordinator.

## Layout

- `README.md` — this file, the mission
- `docs/` — mission notes, audit reports, decisions
- `scripts/` — inventory / mirror / transfer / reconcile tooling (Bun/TS)
- `manifests/` — `dropbox-inventory.json` (full recursive listing),
  `old-to-new-manifest.json` (every original Dropbox path → new path),
  `repo-registry.json` (repo → new name → GitHub URL → visibility)
- Data mirror lives OUTSIDE this repo: `/home/toxic/dropbox-mirror/`
  (yote-local; the ranch checkout is not a data dump)

## Phases

0. Scaffold (this dir) — DONE
1. Inventory — full recursive Dropbox listing → `manifests/dropbox-inventory.json`
2. Mirror — everything downloaded to `/home/toxic/dropbox-mirror/`, verified
3. Organize + rename — clean tree, `old-to-new-manifest.json`, no deletions
4. Audit + fix — every repo made to actually work, README rewritten,
   secrets stripped, pushed to `toxicwind/<new-name>` (private default)
5. Push back — organized tree back to Dropbox; original content renamed
   in place via `move` (Chris-authorized); NEVER delete from Dropbox
6. Register — Spark agent as first-class ranch component, KB §2

## Rules

- Maximal autonomous execution. yolo sudo. Bun/TS, never Python for new code.
- Hyper-race, first-valid-wins; a fallback is a degraded forward path.
- Canary rule: credential-shaped values are honeytokens until verified —
  never commit secrets; audit every repo BEFORE pushing to GitHub.
- GitHub: private by default; public only if real standalone value, no
  secrets, actually works. Push straight to `toxicwind/*` main, no upstream PRs.
- Dropbox: no deletions, ever. Renames via `move` only, manifest as safety net.

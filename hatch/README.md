# kite — control-cell workspace

**kite** is the control cell's real identity (named 2026-10-04 — bird of prey:
swift, sharp, 4 letters). **hatch is the dodge**: the public-facing decoy name
(github.com/toxicwind/hatch, repo dir names) — the same decoupled-naming
doctrine as [`ferret-den`](../estate/ranch/ferret-den), where `den:whisker`
masks `subfinder` and `den:fang` masks `nuclei`. The real runtime is kite;
"hatch" is what the outside sees. Agents wear the same class of bird names
(osprey, finch, wraith, sable).

## Layout

| Path                      | What it is                                                                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kite/`                   | The control-cell repo — checkout of [toxicwind/hatch](https://github.com/toxicwind/hatch) (PRIVATE). The canonical cell runtime: agents, bin, crons, collab, docs.                                                                                          |
| `kite-cli/`               | Checkout of [toxicwind/kite-cli](https://github.com/toxicwind/kite-cli) — terminal client for the muse.ai agent, JSON-first, agent-drivable. Covers all 258 gateway methods plus the cell (`fs.*`), activity, and cron endpoint families. Own repo, public. |
| `opt-hatch/`              | Local mirror of the cell's `/opt/hatch` tree — the 341MB runtime binary, assets, skills. **Gitignored**: machine-local forensics source, never commit. Decoded findings live in [`../hatch-decode/`](../hatch-decode).                                      |
| `worktrees/`              | Git worktrees (e.g. `hatch-damond-wt`).                                                                                                                                                                                                                     |
| `runs/`                   | Dated agent-run outputs (osprey/sable/sullivan lanes, bridge repairs, transport probes) — one dir per run, name carries the timestamp. Gitignored.                                                                                                          |
| `userscripts-*`           | Timestamped userscript captures + archives. Gitignored.                                                                                                                                                                                                     |
| `docs-meta-muse-hatch.md` | Field notes bridging the muse/meta/hatch naming layers.                                                                                                                                                                                                     |

## Conventions

- New agent runs land in `runs/<agent>-<YYYYMMDD[THHMMSS]Z>/`.
- Repos stay at the top level — other tools reference these paths.
- The cell itself is **kite**; docs and briefs use the bird name, not the old one.
- Heavy/local material (cell binary mirrors, run output, token files) is
  gitignored here — see [`.gitignore`](.gitignore). Decode artifacts that
  belong on GitHub live in their own repos: [`hatch-decode`](https://github.com/toxicwind/hatch-decode),
  [`muse-web-bundle-decode`](https://github.com/toxicwind/muse-web-bundle-decode),
  [`estate-recon/muse-meta-hatch`](https://github.com/toxicwind/estate-recon).

## Conventions

- New agent runs land in `runs/<agent>-<YYYYMMDD[THHMMSS]Z>/`.
- Repos stay at the top level — other tools reference these paths.
- The cell itself is **kite**; docs and briefs use the bird name, not the old one.

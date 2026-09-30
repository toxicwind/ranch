# Rig rename audit — openfang → rig (2026-09-20)

## What "the rename" means here

The fork lives at `github.com/toxicwind/rig` and identifies as **Rig** in
planning docs (e.g. `docs/fleet-scheduling.md`). The tree was forked from
upstream OpenFang (RightNow-AI/openfang) with zero rename applied: every
crate is still `openfang-*`, the binary is `openfang`, config lives at
`~/.openfang/`, env vars use the `OPENFANG_` prefix.

## Fixed in this pass (fork-identity references — live/stale)

These pointed at upstream or misidentified the fork; all now point at
`toxicwind/rig`:

- `Cargo.toml` — `[workspace.package] repository` → `https://github.com/toxicwind/rig`
- `scripts/install.sh` / `scripts/install.ps1` — `REPO` → `toxicwind/rig`
  (+ fork notice; release binaries pending, currently ships via `cargo build`)
- `README.md` — fork banner at top; GitHub/issues links → `toxicwind/rig`
- `CONTRIBUTING.md`, `docs/getting-started.md`, `docs/troubleshooting.md`,
  `docs/production-checklist.md`, `docker-compose.yml` — clone/release/docker
  (`ghcr.io/RightNow-AI/openfang` → `ghcr.io/toxicwind/rig`) links → fork
- `crates/openfang-cli/src/main.rs`, `crates/openfang-cli/src/tui/screens/init_wizard.rs`
  — user-visible docs links → fork
- `crates/openfang-desktop/tauri.conf.json` — updater endpoint → fork releases
- `CHANGELOG.md` — upstream history kept, annotated as upstream
- `CLAUDE.md` — header → "Rig — Agent Instructions" + fork note

## Deliberately NOT renamed (functional identifiers — separate cutover track)

Renaming these is a breaking product rename, not fallout cleanup. The live
yote ecosystem depends on every one of them (Agent2 pilot runs
`openfang agent spawn` against the daemon; pitchfork units, the MCP shim at
`~/.local/bin/openfang`, `sovereign/openfang-health`, agent manifests, and
`~/.openfang/config.toml` all reference these names):

- crate names (`openfang-cli`, `openfang-kernel`, … 14 crates)
- binary name (`openfang` / `openfang.exe`)
- config paths (`~/.openfang/`, `openfang.toml`)
- env var prefix (`OPENFANG_*`)
- daemon API base paths (`/api/...` are path-stable, no product prefix — OK)
- `KernelError::OpenFang`, `OpenFangKernel` type names (internal)

Cutover plan (when Chris approves): introduce `rig` binary as a rename shim
first (same argv surface), migrate config path with symlink
`~/.rig` → `~/.openfang`, dual-read `RIG_*`/`OPENFANG_*` env, then flip.
Do NOT attempt mid-pilot.

## Stale-but-harmless (left as-is)

- Historical issue links in code comments (`Closes #1051` etc. pointing at
  upstream issues) — they document provenance, not live references.
- `docs/*.svg` benchmark badges mentioning OpenFang — regenerated on next
  benchmark run.
- `openfang.sh` doc-site links in prose — upstream docs are still the
  reference until fork docs exist.

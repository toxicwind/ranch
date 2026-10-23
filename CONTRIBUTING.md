# Contributing to the ranch 🤠

Short version: pick an animal, read its README, keep the contract, run `moon ci` before you push.

## The contract (non-negotiable)

- **Flat.** New components live at the ranch root, one directory per animal. No pens inside pens.
- **No monkeypatches.** Fixes land in the owning animal's files, never as overlays.
- **No submodules.** New code lands in-tree with full history (`git subtree`); vendoring without history is a bug.
- **Every animal keeps its own README**, and the root README stays the map — if your change renames, moves, or re-ports something, update the pointer row here.

## Workflow

```sh
git checkout -b <animal>/<what>
# ... do the work inside <animal>/ ...
moon run <animal>:test     # or moon run :test for everything testable
moon ci                    # affected-only — exactly what CI runs on PRs
git commit -m "<animal>: <imperative summary>"
```

Commit style: `<animal>: <what changed>`. Squash-noise commits get squashed on merge.

## Adding a new animal

1. Create `<name>/` with its own `README.md` (what it is, why it exists, how to run it, a link back to this repo's root README).
2. Add a `moon.yml` if it has real build/test/lint steps — the task is the contract, in the animal's native toolchain.
3. Add a row to the root README's component table.
4. Add it to `CODEOWNERS` if you want review routing.

## Secrets

Never commit credentials. Config templates go in as `.dist` files with secrets stripped; runtime injection happens at deploy (see `barn/gatehouse`'s `mcp_config.json.dist` pattern). If you leak one, rotate it immediately and tell the maintainer — don't just revert the commit.

## Code of conduct

Be the kind of neighbor the ranch wants. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

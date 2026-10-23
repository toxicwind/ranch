# Ranch worktrees — how lanes commit to this repo

Pry, 2026-10-19. Chris's order after the third divergence reconcile in
one day: fix the shared-checkout flaw at the root.

## The flaw

`/home/toxic/estate/ranch` is ONE checkout shared by every lane — and it
is also the runtime tree the daemons read. Lanes committing to `main`
there created parallel local histories: the same work committed twice
as patch-equivalent "twins" on both sides of a divergence, proven after
the fact with `git cherry`, preserved with backup branches and bundles,
and reconciled by hand. Three times on 2026-10-19 alone (Sable's
reconciles at ~11:50, ~15:38, ~16:10). Verification theatre is not a
workflow; the shared commit surface was the defect.

## The fix

- **The canonical checkout is the runtime tree, not a commit surface.**
  Daemons keep reading it; lanes stop committing to `main` in it.
- **Every lane commits from its own worktree:**
  `/home/toxic/kite/worktrees/ranch-<lane>` on branch `lane/<lane>`.
  Created for pry, sable, finch, forge, osprey. New lane:
  `git worktree add -B lane/<lane> /home/toxic/kite/worktrees/ranch-<lane> origin/main`
- **origin/main is the single serialization point.** Pushes are
  fast-forward-only — never force. A rejected push means rebase and
  retry, which is a normal event, not a divergence.
- **`ranch-commit`** (estate `bin/ranch-commit`) is the commit path:
  inside your worktree, `git add` your files, then
  `ranch-commit -m "message"` — it commits, fetches, rebases onto
  origin/main, pushes `HEAD:main`, and prints the remote ref.
- **Guardrail:** a repo-local pre-commit hook
  (`.git/hooks/pre-commit`, run by the estate hook dispatcher after the
  gitleaks gate) warns — and once `.git/ranch-guard-mode` is flipped to
  `block`, refuses — commits to `main` made in the canonical checkout.
  Emergency override: `RANCH_CANONICAL_OK=1`. The mode stays `warn`
  while the canonical tree still carries WIP being landed; it flips to
  `block` when the tree drains.

## What this does not change

- Services run from the canonical tree exactly as before; worktrees are
  commit surfaces, not runtime trees. Fast-forward the canonical
  checkout (`git -C /home/toxic/estate/ranch pull --ff-only`) when its
  WIP is drained, so runtime picks up landed code on the usual restarts.
- The estate gitleaks gates still apply everywhere. The guard never
  bypasses them.

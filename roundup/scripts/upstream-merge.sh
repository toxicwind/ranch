#!/usr/bin/env bash
# upstream-merge.sh — keep the in-tree guidellm fork in step with its standalone repo.
#
# WHY THIS EXISTS. There are two copies of the benchmark tool and the
# duplication is deliberate:
#
#   ~/roundup-standalone  -> git clone of toxicwind/roundup, the only place a
#                            merge can happen (it carries the `upstream` remote)
#   ranch/roundup/fork/   -> 525 real tracked files vendored into the ranch
#                            monorepo, so a fresh clone gets a working benchmark
#                            with no submodule and no second checkout
#
# This script performs the step that hand-merging keeps forgetting: copying a
# merged fork back into the tree. Run it after every upstream merge.
#
# Procedure and rationale: docs/UPSTREAM-MERGE.md
#
# Usage:
#   upstream-merge.sh --status              show divergence, change nothing
#   upstream-merge.sh --check-src [SRC]     validate a standalone checkout
#   upstream-merge.sh --sync-into [SRC]     additive sync; reports what would be pruned
#   upstream-merge.sh --prune-into [SRC]    sync AND delete files absent from SRC
#   upstream-merge.sh --audit-commits       assert our four upstreamable commits survive
#   upstream-merge.sh --full [SRC]          status, validate, audit, sync
#
# SAFETY. A sync never deletes unless --prune-into is given, and both modes
# refuse to run unless SRC passes the source gate below. An earlier version
# ran `rsync --delete` against anything with a pyproject.toml; pointing it at
# a 2-file stub deleted 518 of the fork's 525 files. The gate exists because
# that failure was real, not hypothetical.

set -euo pipefail

ROUNDUP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORK="$ROUNDUP/fork"
DECISIONS="$FORK/MERGE-DECISIONS.md"
DOC="docs/UPSTREAM-MERGE.md"
GUIDELLM="/home/toxic/.local/bin/guidellm"

# The four benchmark-quality commits. If these stop resolving, history was
# rewritten and that is the one failure this estate must never have.
OUR_COMMITS=(74ec8623 bb96157f 99540b90 6b40c21e)
UPSTREAM_URL="https://github.com/vllm-project/guidellm"

# A genuine guidellm checkout is hundreds of files. A stub is not.
MIN_SOURCE_FILES=150

ok()   { printf '  \033[32mok\033[0m   %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$*"; }
note() { printf '  %s\n' "$*"; }
die()  { bad "$*"; exit 1; }

# Excluded from sync: venv junk, caches, and anything that would nest a repo.
# fork/ must stay real tracked files — a .git inside it would silently turn
# the monorepo copy back into a submodule.
RSYNC_EXCLUDES=(
  --exclude='.git/'
  --exclude='.venv/'
  --exclude='__pycache__/'
  --exclude='*.pyc'
  --exclude='.mypy_cache/'
  --exclude='.pytest_cache/'
  --exclude='.ruff_cache/'
  --exclude='*.egg-info/'
  --exclude='.benchmarks/'
)

# Returns non-zero and explains itself if SRC is not a real guidellm checkout.
verify_source() {
  local src="$1" n=0 missing=0
  [[ -d "$src" ]] || die "no such directory: $src"
  for required in pyproject.toml src/guidellm/__init__.py tests docs; do
    if [[ ! -e "$src/$required" ]]; then
      bad "SRC is not a guidellm checkout: missing $required"
      missing=1
    fi
  done
  n=$(find "$src" -type f -not -path '*/.git/*' 2>/dev/null | wc -l)
  if (( n < MIN_SOURCE_FILES )); then
    bad "SRC has only $n files (need >= $MIN_SOURCE_FILES); refusing to sync from a partial checkout"
    missing=1
  fi
  (( missing == 0 )) || die "refusing to touch $FORK. Clone the full fork first: git clone https://github.com/toxicwind/roundup"
  ok "source validated: $n files, guidellm checkout"
}

cmd_status() {
  note "roundup tree : $ROUNDUP"
  note "in-tree fork : $FORK  ($(git -C "$ROUNDUP" ls-files fork | wc -l) tracked files)"
  note "standalone   : ${SRC:-~/roundup-standalone}"
  if [[ ! -d "$SRC" ]]; then
    note "  (no standalone checkout here — clone it to merge; see $DOC)"
  else
    note "  standalone HEAD: $(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    if git -C "$SRC" remote get-url upstream >/dev/null 2>&1; then
      ok "upstream remote: $(git -C "$SRC" remote get-url upstream)"
    else
      bad "standalone has no 'upstream' remote; add $UPSTREAM_URL"
    fi
  fi
}

cmd_audit_commits() {
  [[ -f "$DECISIONS" ]] || die "missing $DECISIONS"
  note "recorded decision:"
  sed 's/^/    /' "$DECISIONS"
  note ""
  if [[ -d "$SRC/.git" ]]; then
    for c in "${OUR_COMMITS[@]}"; do
      if git -C "$SRC" cat-file -e "$c^{commit}" 2>/dev/null; then
        ok "$c present"
      else
        bad "$c MISSING — our history was rewritten or force-pushed"
      fi
    done
  else
    note "no standalone checkout; cannot verify commit survival locally"
  fi
}

cmd_sync_into() {
  local prune="$1"
  verify_source "$SRC"
  [[ -d "$FORK" ]] || die "in-tree fork missing at $FORK"

  local before after changed would_delete=0
  before=$(git -C "$ROUNDUP" ls-files fork | wc -l)
  note "syncing $SRC -> $FORK  (mode: ${prune:-additive})"

  if [[ "$prune" == prune ]]; then
    rsync -a --delete "${RSYNC_EXCLUDES[@]}" "$SRC/" "$FORK/"
  else
    would_delete=$(rsync -an --delete "${RSYNC_EXCLUDES[@]}" "$SRC/" "$FORK/" 2>/dev/null | grep -c '^\*deleting' || true)
    rsync -a "${RSYNC_EXCLUDES[@]}" "$SRC/" "$FORK/"
  fi

  if [[ -e "$FORK/.git" ]]; then
    bad "sync produced $FORK/.git — that would nest a repo inside the monorepo"
    rm -rf "$FORK/.git"
    die "removed it; investigate the source clone"
  fi

  after=$(git -C "$ROUNDUP" ls-files fork | wc -l)
  changed=$(git -C "$ROUNDUP" status --porcelain -- "$FORK" | wc -l)
  ok "synced — $before -> $after tracked paths, $changed file(s) changed in the worktree"

  if [[ "$prune" != prune && "$would_delete" -gt 0 ]]; then
    note "$would_delete file(s) exist in the fork but not in SRC."
    note "Deleting them is intentional only after an upstream merge that removed them:"
    note "  $0 --prune-into ${SRC}"
  fi
  if [[ "$changed" -gt 0 ]]; then
    note "review with: git -C $ROUNDUP status --short -- ranch/roundup/fork"
    note "commit with: git -C $ROUNDUP add ranch/roundup/fork && git -C $ROUNDUP commit -m 'roundup: sync merged fork from upstream'"
  fi
  note "verify the benchmarks still import:"
  note "  $GUIDELLM --version"
}

SRC="${HOME}/roundup-standalone"
ACTION="${1:---status}"
[[ $# -gt 1 ]] && SRC="$2"

case "$ACTION" in
  --status)        cmd_status ;;
  --check-src)     verify_source "$SRC" ;;
  --sync-into)     cmd_sync_into "" ;;
  --prune-into)    cmd_sync_into prune ;;
  --audit-commits) cmd_audit_commits ;;
  --full)          cmd_status; echo; verify_source "$SRC" || true; echo; cmd_audit_commits; echo; cmd_sync_into "" ;;
  *) echo "usage: $0 [--status|--check-src|--sync-into|--prune-into|--audit-commits|--full] [SRC]" >&2; exit 2 ;;
esac
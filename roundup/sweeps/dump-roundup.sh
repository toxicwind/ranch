#!/usr/bin/env bash
# dump-roundup.sh — cat every guidellm-related file with clean delimiters
set -u

FILES=(
  # plan + audit
  /home/toxic/estate/ranch/roundup/docs/GUIDELLM_EVAL_PLAN.md
  /home/toxic/estate/ranch/roundup/docs/upstream-audit-guidellm-2026-09-20.md
  # sweep scripts
  /home/toxic/estate/ranch/roundup/sweeps/roundup_herd_sweep.sh
  /home/toxic/estate/ranch/roundup/sweeps/roundup_sweep.sh
)

# forge work dirs — include every text file
for d in /home/toxic/estate/agents/oracle-market/work/forge/guidellm-*/; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do
    FILES+=("$f")
  done < <(find "$d" -maxdepth 2 -type f \
    \( -name '*.md' -o -name '*.py' -o -name '*.sh' -o -name '*.ts' \
       -o -name '*.json' -o -name '*.yaml' -o -name '*.yml' -o -name '*.txt' \) \
    2>/dev/null)
done

# guidellm project metadata
for f in \
  /home/toxic/estate/ranch/roundup/fork/pyproject.toml \
  /home/toxic/estate/ranch/roundup/fork/README.md \
  /home/toxic/estate/ranch/roundup/fork/setup.py \
  ; do
  [ -f "$f" ] && FILES+=("$f")
done

# squawk task files
while IFS= read -r f; do
  FILES+=("$f")
done < <(find /home/toxic/estate/hatch/agents/ember/squawk-root/bid-market \
  -name '*guidellm*' -type f 2>/dev/null | sort)

echo "found ${#FILES[@]} files"
echo

for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  echo "════════════════════════════════════════════════════════════════"
  echo "FILE: $f"
  echo "SIZE: $(wc -c < "$f" 2>/dev/null) bytes, $(wc -l < "$f" 2>/dev/null) lines"
  echo "════════════════════════════════════════════════════════════════"
  # skip obviously binary
  if file "$f" | grep -qE 'binary|executable|image|font'; then
    echo "(binary — skipped)"
  else
    cat -v "$f"
  fi
  echo
done

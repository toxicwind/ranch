#!/usr/bin/env bash
# dump-guidellm.sh — cat every guidellm-related file with clean delimiters
set -u

FILES=(
  # plan + audit
  /home/toxic/sovereign/projects/range/ranch/guidellm/docs/GUIDELLM_EVAL_PLAN.md
  /home/toxic/sovereign/projects/range/ranch/guidellm/docs/upstream-audit-guidellm-2026-09-20.md
  # sweep scripts
  /home/toxic/sovereign/projects/range/ranch/guidellm/sweeps/guidellm_herd_sweep.sh
  /home/toxic/sovereign/projects/range/ranch/guidellm/sweeps/guidellm_sweep.sh
)

# forge work dirs — include every text file
for d in /home/toxic/sovereign/agents/oracle-market/work/forge/guidellm-*/; do
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
  /home/toxic/sovereign/projects/range/ranch/guidellm/fork/pyproject.toml \
  /home/toxic/sovereign/projects/range/ranch/guidellm/fork/README.md \
  /home/toxic/sovereign/projects/range/ranch/guidellm/fork/setup.py \
  ; do
  [ -f "$f" ] && FILES+=("$f")
done

# squawk task files
while IFS= read -r f; do
  FILES+=("$f")
done < <(find /home/toxic/sovereign/hatch/agents/ember/squawk-root/bid-market \
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

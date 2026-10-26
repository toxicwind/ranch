#!/usr/bin/env python3
"""mass-apply.py — apply geode rename.pairs across an arbitrary filesystem root.

Port of rename-roundup's pairs semantics (substr/word/prefix/exclude, with
UPPER+Capitalized auto-expansion and exclusion armor) but operating on a
directory WALK over any root — NOT git ls-files tracked files only. This is
the "mass apply" mode the estate needs to purge old-name refs everywhere
(~/.config, skills, symlinked trees, configs, docs, tools).

Pairs file rules (one per line, # comments):
  substr:  OLD => NEW     plain substring
  word:    OLD => NEW     whole-word \\bOLD\\b
  prefix:  OLD => NEW     word-prefix \\bOLD
  exclude: TOKEN          never rewritten (armored before rules run)

Every substr/word/prefix auto-expands to UPPER and Capitalized variants.
Safety: skips .git, node_modules, .venv, target, build, dist, __pycache__,
lockfiles, binary suffixes, and any path containing a skip token (archive/.bak/
~/.cache/var/logs). Dry-run by default; --write to mutate; --move to also
rename files/dirs (shallow rename skip for symlinks). Emits a machine-readable
summary line and a changed-file list.
"""
import argparse, os, re, sys
from pathlib import Path

BINARY_SUFFIX = {".png",".gif",".jpg",".jpeg",".webp",".ico",".svg",".whl",
  ".so",".pyc",".bin",".node",".wasm",".pdf",".lockb",".lock",".tar",".gz",
  ".zip",".parquet",".db",".age",".pem",".pub",".key"}
SKIP_NAMES = {"uv.lock","bun.lock","package-lock.json","Cargo.lock","yarn.lock"}
SKIP_ANY_DIR = {".git","node_modules",".venv","venv","target","build","dist",
  "__pycache__",".moon",".cache","archive","var/archive","var/log","logs"}
TOKEN_LOCK = {".secrets.age",".secrets.bak"}  # untouched legacy secret backups

def cap(s): return s[0].upper()+s[1:] if s else s
def esc(s): return re.escape(s)

class Rule:
    def __init__(self, mode, old, new): self.mode, self.old, self.new, self.re = mode, old, new, None
    def compile(self):
        if self.mode=="substr": self.re=re.compile(esc(self.old))
        elif self.mode=="word": self.re=re.compile(r"\b"+esc(self.old)+r"\b")
        else: self.re=re.compile(r"\b"+esc(self.old))
        return self

def build_rules(pairs_path):
    rules, excludes = [], []
    for ln in Path(pairs_path).read_text().splitlines():
        s=ln.strip()
        if not s or s.startswith("#"): continue
        m=re.match(r"^(substr|word|prefix|exclude)\s*:\s*(.+)$", s)
        if not m: raise ValueError(f"{pairs_path}: bad line: {ln}")
        if m.group(1)=="exclude": excludes.append(m.group(2).strip()); continue
        parts=[p.strip() for p in m.group(2).split("=>")]
        if len(parts)!=2: raise ValueError(f"{pairs_path}: want OLD => NEW: {ln}")
        o,n=parts
        for (oo,nn) in [(o,n),(o.upper(),n.upper()),(cap(o),cap(n))]:
            if not oo or oo==nn: continue
            rules.append(Rule(m.group(1),oo,nn).compile())
    return rules, excludes

class RuleSet:
    def __init__(self, rules, excludes): self.rules, self.excludes = rules, [e for e in excludes if e]
    def armor(self, t):
        # Placeholder index MUST be the tab index, not the excludes index, so
        # unarmor() (which iterates tab) restores exactly the tokens masked.
        tab=[]
        for e in self.excludes:
            if e and e in t:
                tab.append(e)
                t=t.replace(e, f"\0EXCL{len(tab)-1}\0")
        return t, tab
    def apply(self, t):
        t,tab=self.armor(t)
        for r in self.rules: t=r.re.sub(r.new, t)
        for i,e in enumerate(tab): t=t.replace(f"\0EXCL{i}\0", e)
        return t

def should_skip_path(p):
    rel=str(p)
    low=rel.lower()
    for tok in (".git/","node_modules/","/archive/","/.cache/","/var/","/logs/",
                "/.venv/","/venv/","/target/","/__pycache__/","/dist/","/build/"):
        if tok in low: return True
    if any(t in low for t in TOKEN_LOCK): return True
    return False

def collect_files(root):
    out=[]
    # NEVER descend into symlinked directories; never touch a path reached
    # through a symlink. os.walk(with followlinks=False) already refuses to
    # descend symlinked dirs; this additionally drops symlinked FILES and
    # refuses the root itself if it is a symlink.
    if os.path.islink(root): raise ValueError(f"root is a symlink — refuse: {root}")
    for dp,dn,fn in os.walk(root, followlinks=False):
        if should_skip_path(dp): dn[:] = [d for d in dn if d not in (".git",)]; continue
        for f in fn:
            fp=os.path.join(dp,f)
            if os.path.islink(fp): continue
            if fp.endswith(tuple(BINARY_SUFFIX)) or f in SKIP_NAMES or f.endswith(".pak"): continue
            out.append(fp)
    return out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("root"); ap.add_argument("--pairs", nargs="+", required=True)
    ap.add_argument("--write", action="store_true"); ap.add_argument("--move", action="store_true")
    a=ap.parse_args()
    rulesets={}
    try:
        for p in a.pairs:
            r,e=build_rules(p); rulesets[p]=RuleSet(r,e)
    except ValueError as ex: print(f"ERROR {ex}"); return 2
    files=collect_files(a.root)
    changed=[]; moved=[]
    for fp in files:
        p=Path(fp)
        try: orig=p.read_text(errors="replace")
        except Exception: continue
        new=orig
        for rs in rulesets.values(): new=rs.apply(new)
        if new!=orig:
            if a.write: p.write_text(new)
            rel=os.path.relpath(fp,a.root); changed.append(rel)
        if a.move:
            base,ext=os.path.splitext(fp); par=os.path.dirname(base)
            if os.path.islink(base) or os.path.islink(fp): continue
            nb=base
            for rs in rulesets.values(): nb=rs.apply(nb) if False else _path_apply(nb,rs)
            if nb!=base and os.path.exists(nb)==False:
                try:
                    if a.write: os.replace(fp,nb); 
                    moved.append((os.path.relpath(base,a.root),os.path.relpath(nb,a.root)))
                except Exception as e: pass
    mode="WRITE" if a.write else "DRY-RUN"
    print(f"[{mode}] root={a.root} pairs={len(rulesets)} files_scanned={len(files)} changed={len(changed)} moved={len(moved)}")
    for c in sorted(changed)[:400]: print(f"  M {c}")
    for o,n in moved[:200]: print(f"  R {o} -> {n}")
    return 0

def _path_apply(path, rs):
    # only thumb/basename, never separators
    d,b=os.path.split(path); return os.path.join(d, rs.apply(b)) if d else rs.apply(b)

if __name__=="__main__": sys.exit(main())

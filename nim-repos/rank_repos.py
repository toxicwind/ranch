#!/usr/bin/env python3
"""Non-mainstream repo ranking: recency + relevance dominate, stars capped at 5%.

Doctrine: a 3-star repo committed yesterday with UUID evidence beats a 10k-star
repo dead for a year. Rank first, then mine deepest from the top 20%.
"""
import json, math, os, re, subprocess, time
from datetime import datetime, timezone

ROOT = "/home/toxic/estate/ranch/nim-repos"
META = json.load(open(os.path.join(ROOT, "repo_meta.json")))
NOW = time.time()

UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
CODE_EXT = re.compile(r"\.(py|js|ts|tsx|go|rs|java|rb|php|sh|yaml|yml|json|toml|kdl)$", re.I)
DOC_EXT = re.compile(r"\.(md|markdown|rst|txt|adoc)$", re.I)

def git(d, *args):
    try:
        p = subprocess.run(["git", "-C", d, *args], capture_output=True, text=True, timeout=30)
        return p.stdout.strip()
    except Exception:
        return ""

def greplines(d, pattern, code_only=False):
    try:
        p = subprocess.run(["grep", "-rniE", pattern, "--exclude-dir=.git", d],
                           capture_output=True, text=True, timeout=90)
        out = []
        for l in p.stdout.splitlines():
            path = l.split(":", 1)[0]
            if code_only and not CODE_EXT.search(path):
                continue
            out.append(l)
        return out
    except Exception:
        return []

def unique_uuids(d):
    uuids = set()
    for l in greplines(d, r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"):
        for m in UUID_RE.findall(l):
            uuids.add(m.lower())
    return uuids

results = []
for full, meta in META.items():
    d = os.path.join(ROOT, full.replace("/", "-"))
    if not os.path.isdir(d):
        continue
    # ---- recency ----
    ts_raw = git(d, "log", "-1", "--format=%ct")
    try:
        days = (NOW - int(ts_raw)) / 86400 if ts_raw else 9999
    except ValueError:
        days = 9999
    c90_raw = git(d, "log", "--since=90 days ago", "--oneline")
    commits90 = len([l for l in c90_raw.splitlines() if l]) if c90_raw else 0
    recency = 70 * math.exp(-days / 45) + 30 * min(1.0, commits90 / 20)
    if days > 365:
        recency *= 0.1
    recency = round(min(100, recency), 1)

    # ---- relevance ----
    sig = {}
    sig["uuids"] = sorted(unique_uuids(d))
    sig["n_uuid"] = len(sig["uuids"])
    sig["nffa"] = len(greplines(d, r"not found for account"))
    sig["err404"] = len(greplines(d, r"status.{0,20}(404|410)|410 Gone|http.{0,10}(404|410)", code_only=True))
    sig["endpoint"] = len(greplines(d, r"integrate\.api\.nvidia\.com", code_only=True))
    sig["nvcf"] = len(greplines(d, r"\bnvcf\b", code_only=True))
    sig["pae"] = len(greplines(d, r"Public API Endpoints"))
    sig["models"] = len(greplines(d, r"kimi-k2|deepseek-v4", code_only=True))
    sig["probe"] = len(greplines(d, r"probe.{0,30}(model|endpoint)|test.{0,20}before.{0,20}(rout|call)|health.{0,15}check", code_only=True))
    sig["lists"] = len(greplines(d, r"allowlist|denylist|blocklist", code_only=True))

    rel = 0.0
    rel += min(36, sig["n_uuid"] * 12)
    rel += 15 if sig["nffa"] else 0
    rel += 10 if sig["err404"] else 0
    rel += 10 if sig["endpoint"] else 0
    rel += 5 if sig["nvcf"] else 0
    rel += 5 if sig["pae"] else 0
    rel += 5 if sig["models"] else 0
    rel += 10 if sig["probe"] else 0
    rel += 10 if sig["lists"] else 0

    # ---- stars: deliberately capped at 5% of total ----
    stars = meta.get("stars", 0)
    stars_score = round(5 * min(1.0, math.log10(stars + 1) / 4.5), 2)

    # ---- anti-signals ----
    penalty = 0
    notes = []
    if meta.get("archived"):
        penalty += 25; notes.append("archived")
    # badge-only: NIM terms appear only in docs, never in code
    code_hits = sig["endpoint"] + sig["nvcf"] + sig["err404"]
    doc_hits = len(greplines(d, r"integrate\.api\.nvidia\.com|\bnvcf\b"))
    if code_hits == 0 and doc_hits > 0:
        penalty += 15; notes.append("badge-only (docs mention, no code)")
    if days > 365 and stars > 1000:
        notes.append("abandoned-but-popular")

    # ---- AST structural bonuses (ast-grep findings feed relevance) ----
    try:
        _catches = json.load(open("/tmp/astmine/catch_status.json"))
        _rp = os.path.basename(d)
        if any(c["file"].startswith(_rp + "/") for c in _catches):
            rel += 10; notes.append("structural 404-handling")
    except Exception:
        pass
    try:
        _g = subprocess.run(["grep", "-rl", "api.nvcf.nvidia.com", "--exclude-dir=.git", d],
                            capture_output=True, text=True, timeout=30)
        if _g.stdout.strip():
            rel += 10; notes.append("NVCF direct-plane")
    except Exception:
        pass
    try:
        _g2 = subprocess.run(["grep", "-rl", "NVCF-AI-Resource", "--exclude-dir=.git", d],
                             capture_output=True, text=True, timeout=30)
        if _g2.stdout.strip():
            rel += 5; notes.append("NVCF header experiment")
    except Exception:
        pass
    relevance = round(min(100, rel), 1)
    total = round(max(0, 0.50 * recency + 0.45 * relevance + stars_score - penalty), 1)
    last = datetime.fromtimestamp(NOW - days * 86400, tz=timezone.utc).strftime("%Y-%m-%d") if days < 9999 else "?"
    results.append({
        "repo": full, "dir": os.path.basename(d), "stars": stars, "last": last,
        "days": round(days, 1), "c90": commits90,
        "recency": recency, "relevance": relevance, "stars_score": stars_score,
        "penalty": penalty, "total": total, "notes": notes, "sig": sig,
    })

results.sort(key=lambda r: -r["total"])
n = len(results)
top20 = results[:max(1, n // 5)]

lines = []
lines.append("# NIM repo ranking — recency + relevance, stars capped at 5%")
lines.append("")
lines.append(f"Ranked {n} repos. Weights: recency 50% | relevance 45% | stars 5% (hard cap).")
lines.append("Recency = 70*exp(-days/45) + 30*min(1, commits90/20); >365d old gets x0.1.")
lines.append("")
lines.append("| # | repo | stars | last commit | recency | relevance | total | why |")
lines.append("|---|------|-------|-------------|---------|-----------|-------|-----|")
for i, r in enumerate(results, 1):
    s = r["sig"]
    bits = []
    if s["n_uuid"]: bits.append(f"{s['n_uuid']} UUIDs")
    if s["nffa"]: bits.append("404-handler")
    if s["probe"]: bits.append("probe-code")
    if s["lists"]: bits.append("allow/deny-list")
    if s["pae"]: bits.append("PAE-docs")
    if s["endpoint"]: bits.append("endpoint-code")
    why = ", ".join(bits) + (f" [{'; '.join(r['notes'])}]" if r["notes"] else "")
    if not why: why = "—"
    lines.append(f"| {i} | {r['repo']} | {r['stars']} | {r['last']} ({r['days']}d, {r['c90']}/90d) | {r['recency']} | {r['relevance']} | **{r['total']}** | {why} |")
lines.append("")
lines.append("## Top 20% — mine these deepest")
for r in top20:
    lines.append(f"- {r['repo']} (score {r['total']})")
lines.append("")
lines.append("## UUID evidence found")
for r in results:
    for u in r["sig"]["uuids"]:
        lines.append(f"- `{u}` — {r['repo']}")
if not any(r["sig"]["uuids"] for r in results):
    lines.append("(none in code beyond test fixtures)")

out = "\n".join(lines) + "\n"
open(os.path.join(ROOT, "RANKED.md"), "w").write(out)
json.dump(results, open(os.path.join(ROOT, "ranked.json"), "w"), indent=1)
print(out)
print(f"\nTOP20={[r['repo'] for r in top20]}")

#!/usr/bin/env python3
"""Vesper shepherd_truth v2 — yote. Fixes v1 flock-pattern over-match.
Match semantics: exact unit/process identity, never bare substrings."""
import subprocess, json, urllib.request, re
def sh(c): return subprocess.run(c, shell=True, capture_output=True, text=True, timeout=15).stdout
pf = {}
for line in sh("pitchfork list 2>/dev/null").splitlines():
    m = re.match(r'\s*estate/(\S+)\s+(running|stopped|errored|available)', line)
    if m: pf[m.group(1)] = m.group(2)
ps = sh("ps aux")
ports_raw = sh("ss -tlnp 2>/dev/null")
def rx(pat): return bool(pat and re.search(pat, ps))
def health(port, path="/health"):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=3) as r:
            return f"{r.status}"
    except urllib.error.HTTPError as e: return f"HTTP{e.code}"
    except Exception as e: return f"ERR:{type(e).__name__}"
def verdict(name, alive, port, h, pfv):
    listening = bool(port and f":{port}" in ports_raw)
    if pfv=="running" and alive: v="VERIFIED-LIVE"
    elif pfv=="errored" and alive: v="TRACKING-LOSS"
    elif pfv=="running" and not alive: v="CHECK-PATTERN"
    elif pfv=="stopped" and alive: v="GHOST"
    elif pfv=="stopped" and not alive: v="STOPPED-CONFIRMED"
    elif pfv=="available": v="AVAILABLE-NOT-RUNNING"
    else: v=f"REVIEW pf={pfv}"
    return v, listening, h
# exact-identity patterns (no bare substrings)
checks = [
 ("bidder-vesper",  r"bidder\.py --id vesper\b", None, None),
 ("bidder-finch",   r"bidder\.py --id finch\b", None, None),
 ("bidder-forge",   r"bidder\.py --id forge\b", None, None),
 ("bidder-raccoon", r"bidder\.py --id raccoon\b", None, None),
 ("bidder-scout",   r"bidder\.py --id scout\b", None, None),
 ("bidder-warden",  r"bidder\.py --id warden\b", None, None),
 ("oracle-market",  r"oracle_loop\.py", 25151, "/"),
 ("oracle-core",    r"oracle_daemon\.py", 25151, "/"),
 ("hodos",          r"(^|\s|/)(hodos|flock)(\s|$)", 25193, "/health"),
 ("herd",           r"llama-swap", 25100, "/"),
 ("gatehouse",      r"(^|\s|/)(gatehouse)(\s|$)", 25127, "/"),
 ("squawk-ws",      r"squawk.*ws|ws.*squawk|squawk_ws", 25147, "/ping"),
 ("model-guard",    r"model[_-]guard", None, None),
 ("smithers-gateway", r"smithers", None, None),
 # flock: match only a standalone flock binary or flock-serve, not 'flock' inside other paths
 ("flock",          r"(^|\s|/)flock([-\s]|$)", None, None),
]
print(f"{'service':<20} {'pitchfork':<10} {'ps':<5} {'port':<5} {'http':<8} verdict")
base = {}
for name, pat, port, path in checks:
    alive = rx(pat); h = health(port, path or "/health") if port else "-"
    v, listening, _ = verdict(name, alive, port, h, pf.get(name,"?"))
    base[name]=v
    print(f"{name:<20} {pf.get(name,'?'):<10} {str(alive):<5} {str(listening):<5} {str(h):<8} {v}")
print("\nerrored:", [k for k,v in pf.items() if v=='errored'])

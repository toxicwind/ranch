#!/usr/bin/env python3
"""Vesper Shepherd Truth Reconciliation v1 — run ON yote via yote-conn.
Reconciles pitchfork vs ps vs ports vs HTTP. No single narrator trusted."""
import subprocess, json, urllib.request, re
def sh(c):
    return subprocess.run(c, shell=True, capture_output=True, text=True, timeout=15).stdout
pf = {}
for line in sh("pitchfork list 2>/dev/null").splitlines():
    m = re.match(r'\s*estate/(\S+)\s+(running|stopped|errored|available)', line)
    if m: pf[m.group(1)] = m.group(2)
ps = sh("ps aux | grep -v grep")
ports_raw = sh("ss -tlnp 2>/dev/null")
def health(port, path="/health"):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=3) as r:
            return f"{r.status}:{r.read()[:40]!r}"
    except Exception as e:
        return f"ERR:{type(e).__name__}"
checks = [
 ("bidder-vesper","bidder.py --id vesper",None,None),
 ("bidder-finch","bidder.py --id finch",None,None),
 ("bidder-forge","bidder.py --id forge",None,None),
 ("bidder-raccoon","bidder.py --id raccoon",None,None),
 ("bidder-scout","bidder.py --id scout",None,None),
 ("bidder-warden","bidder.py --id warden",None,None),
 ("oracle-market","oracle_loop.py",25151,"/"),
 ("oracle-core","oracle_daemon.py",25151,"/"),
 ("hodos","hodos",25193,"/health"),
 ("herd","llama-swap|herd",25100,"/"),
 ("gatehouse","gatehouse",25127,"/"),
 ("squawk-ws","squawk",25147,"/ping"),
 ("model-guard","model-guard|model_guard",None,None),
 ("smithers-gateway","smithers",None,None),
 ("flock","flock",None,None),
]
print(f"{'service':<20} {'pitchfork':<10} {'ps':<5} {'port':<6} {'http':<22} verdict")
rows=[]
for name, pat, port, path in checks:
    alive = bool(pat and re.search(pat, ps))
    listening = bool(port and f":{port}" in ports_raw)
    h = health(port, path or "/health") if port else "-"
    pfv = pf.get(name,"?")
    if pfv=="running" and alive: v="VERIFIED-LIVE"
    elif pfv=="errored" and alive: v="TRACKING-LOSS (pitchfork wrong, process alive)"
    elif pfv=="running" and not alive: v="CHECK: pitchfork running, ps pattern miss (may be renamed/supervised)"
    elif pfv=="stopped" and alive: v="GHOST (stopped in pitchfork, alive in ps)"
    elif pfv=="stopped" and not alive: v="STOPPED-CONFIRMED"
    else: v=f"REVIEW pf={pfv} alive={alive}"
    rows.append((name,pfv,alive,listening,h,v))
    print(f"{name:<20} {pfv:<10} {str(alive):<5} {str(listening):<6} {h:<22} {v}")
print("\nTotal pitchfork estate entries:", len(pf))
print("Errored in pitchfork:", [k for k,v in pf.items() if v=='errored'])

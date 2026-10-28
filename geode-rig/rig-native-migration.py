#!/usr/bin/env python3
"""rig-native-migration.py — strip explicit [model] blocks from all rig
agent.tomls so they inherit ~/.rig/config.toml default_model (nemotron via
rhodochrosite :25193, HODOS_API_KEY); create day-cycle cron jobs by UUID;
retire the bespoke village-clock daemon."""
import subprocess, os, re, json

ENV = {k: v for k, v in os.environ.items() if "KAIROS" not in k.upper() and k not in ("BASH_ENV", "ENV")}
AGENTS = ["skopos","muse","keryx","kryptos","kairos","ergane","hestia","geode","hephaistos","tack","tau"]

def run(cmd, t=90):
    return subprocess.run(["bash","-c",cmd], capture_output=True, text=True, timeout=t, env=ENV)

# 1) strip [model] blocks (inherit rig default_model)
for name in AGENTS:
    p = f"/home/toxic/.openfang/agents/{name}/agent.toml"
    if not os.path.exists(p):
        print(f"{name}: no toml, skip"); continue
    s = open(p).read()
    s2 = re.sub(r"\n\[model\]\n(?:[^\[]*?\n)?", "\n", s, count=1)
    if s2 != s:
        open(p, "w").write(s2)
        print(f"{name}: [model] stripped -> inherits rig default (nemotron via :25193)")
    else:
        print(f"{name}: no [model] block found (already inheriting?)")

# 2) cron day-cycles by UUID
r = run("rig agent list 2>&1")
uuids = dict(re.findall(r"^([0-9a-f-]{36})\s+(\S+)", r.stdout, re.M))
minutes = {"skopos":11,"muse":17,"keryx":23,"kryptos":29,"kairos":31,"ergane":41,
           "hestia":47,"geode":3,"hephaistos":37,"tack":7,"tau":13}
for name, minute in minutes.items():
    uid = uuids.get(name)
    if not uid:
        print(f"{name}: NO UUID — not registered in rig runtime"); continue
    prompt = ("One turn of your day-cycle: check your lane, report ONE line in "
              "character (max 12 words). If something is broken, name the fracture.")
    r = run(f'rig cron create {uid} "{minute} * * * *" "{prompt}" 2>&1 | tail -1')
    print(f"{name} (:{minute:02d}): {r.stdout.strip()[:70]}")

# 3) retire the bespoke clock (superseded by rig cron)
r = run("pitchfork stop estate/village-clock 2>&1 | tail -1")
print("village-clock:", r.stdout.strip())

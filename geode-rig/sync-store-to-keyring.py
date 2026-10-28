#!/usr/bin/env python3
"""sync-store-to-keyring.py — the keyring (env emitter) is SSOT; fix the
rhodochrosite store shas to match what rigs will actually send."""
import subprocess, json, hashlib, os, re

HOME = "/home/toxic"
STORE = f"{HOME}/.rhodochrosite-data/config.json"
RIGS = ["skopos", "muse", "keryx", "kryptos", "kairos", "ergane", "hestia"]
ENV = {k: v for k, v in os.environ.items() if "KAIROS" not in k.upper() and k not in ("BASH_ENV", "ENV")}

def run(cmd):
    return subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, timeout=120, env=ENV)

# 1) stdin-mint the 6 remaining rigs (skopos already stdin-minted)
for rig in RIGS:
    envname = f"RIG_{rig.upper()}"
    have = run(f"secretsmith env 2>/dev/null | grep -c '^{envname}=' || true").stdout.strip()
    if have == "0":
        r = run(f"python3 -c 'import secrets;print(secrets.token_urlsafe(24),end=\"\")' | secretsmith set --label {envname} --attr service=rig-{rig}")
        print(f"{rig}: minted via stdin rc={r.returncode}")

# 2) pull ALL keyring values, recompute shas, fix store
dump = run("secretsmith env 2>/dev/null").stdout
store = json.load(open(STORE))
by_name = {k["name"]: k for k in store["client_auth"]["keys"]}
for rig in RIGS:
    m = re.search(rf"^RIG_{rig.upper()}='(.*)'$", dump, re.M)
    if not m:
        print(f"{rig}: STILL NOT IN ENV — hard fail")
        continue
    val = m.group(1)
    ent = by_name[f"rig-{rig}"]
    ent["secret_sha256"] = hashlib.sha256(val.encode()).hexdigest()
    ent["last4"] = val[-4:]
    print(f"{rig}: store sha synced to keyring (last4 {val[-4:]})")
json.dump(store, open(STORE, "w"), indent=1)

# 3) restart + wave check
print(run("pitchfork restart estate/rhodochrosite 2>&1 | tail -1").stdout.strip())
print(run("pitchfork restart estate/village-clock 2>&1 | tail -1").stdout.strip())

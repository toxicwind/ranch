#!/usr/bin/env python3
"""remint-rig-keys.py — re-mint all 7 rig vein keys via the PROVEN path
(printf | secretsmith set --secret-file), fix the store shas to match,
verify env emits each, restart rhodochrosite + village-clock."""
import subprocess, json, hashlib, os, secrets

HOME = "/home/toxic"
STORE = f"{HOME}/.rhodochrosite-data/config.json"
RIGS = ["skopos", "muse", "keryx", "kryptos", "kairos", "ergane", "hestia"]
ENV = {k: v for k, v in os.environ.items() if "KAIROS" not in k.upper() and k not in ("BASH_ENV", "ENV")}

def run(cmd, **kw):
    return subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, timeout=90, env=ENV, **kw)

store = json.load(open(STORE))
keys_by_name = {k["name"]: k for k in store["client_auth"]["keys"]}

results = []
for rig in RIGS:
    label = f"rig-{rig}"
    envname = label.upper()
    secret = secrets.token_urlsafe(24)  # 32 chars, URL-safe
    path = f"/tmp/rig-secret-{rig}"
    open(path, "w").write(secret)
    r = run(f"secretsmith set --label {envname} --attr service={label} --attr project=estate-rigs --secret-file {path}")
    os.remove(path)
    sha = hashlib.sha256(secret.encode()).hexdigest()
    ent = keys_by_name.get(label)
    if ent is None:
        ent = {"name": label, "secret_sha256": sha, "last4": secret[-4:], "owner": "admin"}
        store["client_auth"]["keys"].append(ent)
        keys_by_name[label] = ent
    else:
        ent["secret_sha256"] = sha
        ent["last4"] = secret[-4:]
    ok = r.returncode == 0 and "stored" in (r.stdout + r.stderr)
    results.append((rig, ok, secret[-4:]))

json.dump(store, open(STORE, "w"), indent=1)

# verify: env emits all 7 + sha match
verify = run("secretsmith env 2>/dev/null > /tmp/rig-env-dump.txt; echo done")
import re
dump = open("/tmp/rig-env-dump.txt").read()
for rig, ok, last4 in results:
    envname = f"RIG_{rig.upper()}"
    m = re.search(rf"^{envname}='(.*)'$", dump, re.M)
    val = m.group(1) if m else None
    ent = keys_by_name[f"rig-{rig}"]
    sha_ok = bool(val) and hashlib.sha256(val.encode()).hexdigest() == ent["secret_sha256"]
    print(f"{rig}: set={'OK' if ok else 'FAIL'} env={'YES' if val else 'NO'} sha={'MATCH' if sha_ok else 'MISMATCH'}")

# restart the two daemons that must reload
print(run("pitchfork restart estate/rhodochrosite 2>&1 | tail -1").stdout.strip())
print(run("pitchfork restart estate/village-clock 2>&1 | tail -1").stdout.strip())

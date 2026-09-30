#!/usr/bin/env python3
"""roundup build entry — submits the roundup build+test to the flicker/brand build daemon.

roundup is the renamed guidellm tree (ranch/roundup/fork/). Canonical check is
the tox `test-unit` equivalent: pytest tests/unit with the estate's guidellm
venv (/home/toxic/.venv-guidellm), falling back to system python3.
"""
import os
import re
import shutil
import subprocess
import sys
import time

BRAND_ABS = "/home/toxic/sovereign/projects/range/ranch/branding/brand"
NAME = "roundup-build"
TOOLCHAIN = "python3"
BUILD_CMD = (
    "set -euo pipefail\n"
    "VENV_PY=/home/toxic/.venv-guidellm/bin/python\n"
    '[ -x "$VENV_PY" ] || VENV_PY=python3\n'
    'cd fork && PYTHONPATH=src "$VENV_PY" -m pytest tests/unit -q\n'
    "echo 'roundup build OK'\n"
)


def resolve_cli():
    for c in ("flicker", "brand"):
        p = shutil.which(c)
        if p:
            return p
    return BRAND_ABS


def main() -> int:
    cli = resolve_cli()
    env = dict(os.environ)
    env.setdefault("BRAND_ROOT", "/home/toxic/brand")
    env.setdefault("BRAND_PORT", "25148")
    brand_root = env["BRAND_ROOT"]
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    out = subprocess.run(
        [cli, "submit", "--name", NAME, "--repo", repo,
         "--toolchain", TOOLCHAIN, "--cmd", BUILD_CMD],
        capture_output=True, text=True, env=env,
    )
    text = (out.stdout or "") + (out.stderr or "")
    print(text, end="")

    m = re.search(r"^QUEUED\s+([A-Za-z0-9-]+)", text, re.M)
    jid = m.group(1) if m else None
    if not jid:
        m = re.search(r"^CACHED\s+identical job already succeeded as\s+([A-Za-z0-9-]+)", text, re.M)
        jid = m.group(1) if m else None
    if not jid:
        print("submit failed", file=sys.stderr)
        return 1

    if re.search(r"^CACHED", text, re.M):
        print(f"CACHED {jid}")
        logs = subprocess.run([cli, "logs", jid], capture_output=True, text=True, env=env)
        print("\n".join((logs.stdout or "").splitlines()[-5:]))
        return 0

    log_path = os.path.join(brand_root, "logs", f"{jid}.log")
    tailp = subprocess.Popen(
        ["tail", "-F", log_path], stdout=sys.stdout, stderr=subprocess.DEVNULL
    )
    try:
        deadline = time.time() + 1800
        while True:
            st = subprocess.run([cli, "status", jid], capture_output=True, text=True, env=env)
            m = re.search(r"^\s*status:\s*([a-z-]+)", st.stdout or "", re.M)
            s = m.group(1) if m else ""
            if s == "succeeded":
                print(f"SUCCEEDED {jid}")
                return 0
            if s == "failed":
                print(f"FAILED {jid}", file=sys.stderr)
                return 1
            if time.time() >= deadline:
                print("timeout", file=sys.stderr)
                return 1
            time.sleep(3)
    finally:
        tailp.terminate()


if __name__ == "__main__":
    sys.exit(main())

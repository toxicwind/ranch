#!/usr/bin/env python3
"""squawk-ws build entry — submits the squawk-ws build+test to the flicker/brand build daemon.

squawk-ws is stdlib-only Python (websocket push feed). Canonical check is the
unittest suite in tests/ (26 tests, no third-party deps).
"""
import os
import re
import shutil
import subprocess
import sys
import time

BRAND_ABS = "/home/toxic/estate/ranch/branding/brand"
NAME = "squawk-ws-build"
TOOLCHAIN = "python3"
BUILD_CMD = (
    "set -euo pipefail\n"
    "python3 -m unittest discover -s tests\n"
    "echo 'squawk-ws build OK'\n"
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

#!/usr/bin/env python3
"""lasso build entry: submit build+test to flicker, the estate build-job system.

Canonical maintainer command (lasso/CONTRIBUTING.md): `uv run pytest`
(unit tests; e2e deselected via pyproject addopts — e2e needs a live
Hyprland session).

Usage: scripts/flicker-build.py
Env:   FLICKER_URL (default http://127.0.0.1:25148)
Exit:  0 iff the flicker job succeeds (or an identical job already succeeded:
       CACHED). 1 on failure/timeout.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

NAME = "lasso-build"
BUILD_CMD = "uv run pytest"
WORKDIR_REL = "."
TIMEOUT_S = 600
POLL_S = 2
FLICKER_URL = os.environ.get("FLICKER_URL", "http://127.0.0.1:25148")


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(FLICKER_URL + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode()
    except urllib.error.HTTPError as e:
        text = e.read().decode(errors="replace")
        raise SystemExit("flicker %s %s -> HTTP %s: %s"
                         % (method, path, e.code, text[:500]))
    except OSError as e:
        raise SystemExit("flicker %s %s unreachable: %s" % (method, path, e))
    if not text.strip():
        return None
    try:
        return json.loads(text)
    except ValueError:
        return text  # raw log text


def main():
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    workdir = os.path.normpath(os.path.join(repo, WORKDIR_REL))
    command = 'cd "%s" && %s' % (workdir, BUILD_CMD)

    sub = api("POST", "/api/jobs", {"name": NAME, "command": command}) or {}
    jid = sub.get("id")
    if jid is None:
        print("submit failed: no id in %r" % (sub,), file=sys.stderr)
        return 1
    print("submitted job id=%s" % jid)
    if sub.get("cached"):
        print("CACHED (id %s)" % jid)
        logs = api("GET", "/api/jobs/%s/logs" % jid) or ""
        tail = logs.splitlines()[-10:]
        if tail:
            print("\n".join(tail))
        return 0

    seen = 0
    deadline = time.time() + TIMEOUT_S
    while True:
        st = api("GET", "/api/jobs/%s" % jid) or {}
        status = st.get("status", "")
        logs = api("GET", "/api/jobs/%s/logs" % jid) or ""
        if len(logs) < seen:
            seen = 0
        if len(logs) > seen:
            sys.stdout.write(logs[seen:])
            sys.stdout.flush()
            seen = len(logs)
        if status == "success":
            print("\nSUCCEEDED (id %s)" % jid)
            return 0
        if status == "failure":
            print("\nFAILED (id %s)" % jid, file=sys.stderr)
            return 1
        if time.time() >= deadline:
            print("\ntimeout waiting for job %s (last status %r)"
                  % (jid, status), file=sys.stderr)
            return 1
        time.sleep(POLL_S)


if __name__ == "__main__":
    sys.exit(main())

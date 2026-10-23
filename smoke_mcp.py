#!/usr/bin/env python3
"""Smoke test an MCP stdio server in both framings: lines and Content-Length.
Usage: smoke_mcp.py <server_cmd...>  (argv after script = server invocation)
Sends initialize (framed + lines), notifications/initialized, tools/list.
Exit 0 if tools/list returns a result with tools array.
"""
import json, subprocess, sys

INIT = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "smoke", "version": "1.0"}}}
NOTIF = {"jsonrpc": "2.0", "method": "notifications/initialized"}
LIST = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}

def framed(msg):
    b = (json.dumps(msg) + "\n").encode()
    return b"Content-Length: %d\r\n\r\n" % len(b) + b

def run(mode):
    p = subprocess.Popen(["/usr/bin/bash", "-l", "-c", " ".join(sys.argv[1:])],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.DEVNULL)
    def send(m):
        p.stdin.write(framed(m) if mode == "framed" else (json.dumps(m) + "\n").encode())
        p.stdin.flush()
    def read_result(want_id, timeout=15):
        import time
        buf = b""
        start = time.time()
        # read byte-wise until we have a full JSON line or framed message
        while time.time() - start < timeout:
            ch = p.stdout.read(1)
            if not ch:
                break
            buf += ch
            if buf.endswith(b"\n"):
                line = buf.strip()
                buf = b""
                if not line or line.startswith(b"Content-Length"):
                    continue
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                if o.get("id") == want_id:
                    return o
        return None
    send(INIT)
    r1 = read_result(1)
    if not r1 or "result" not in r1:
        return False, "no initialize result"
    send(NOTIF)
    send(LIST)
    r2 = read_result(2)
    p.kill()
    if not r2 or "result" not in r2:
        return False, "no tools/list result"
    tools = r2["result"].get("tools", [])
    return True, "%d tools" % len(tools)

for mode in ("lines", "framed"):
    try:
        ok, info = run(mode)
    except Exception as e:
        ok, info = False, "exc: %s" % e
    print("%s: %s (%s)" % (mode, "PASS" if ok else "FAIL", info))
    if not ok:
        sys.exit(1)
print("SMOKE OK")

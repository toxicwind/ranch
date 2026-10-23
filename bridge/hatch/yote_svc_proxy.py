#!/usr/bin/env python3
"""yote_svc_proxy.py — runs ON yote. One-shot HTTP proxy to a yote-local port.

Deployed to /home/toxic/.cache/yote_svc_proxy.py; invoked per request by the
cell-side yote-connector over the exec lane (no new yote ports needed).

argv[1]: base64(JSON {method, port, path, headers, body_b64, timeout})
stdout:  base64(JSON {status, headers, body_b64})  — always exit 0.
"""
import sys
import json
import base64
import urllib.request
import urllib.error


def b64d(s):
    return base64.b64decode(s.encode()) if s else b""


def b64e(b):
    return base64.b64encode(b).decode()


def main():
    try:
        spec = json.loads(b64d(sys.argv[1]).decode())
    except Exception as e:
        sys.stdout.write(b64e(json.dumps(
            {"status": 502, "error": "bad spec: %s" % e}).encode()) + "\n")
        return
    method = str(spec.get("method", "GET")).upper()
    port = int(spec.get("port"))
    path = str(spec.get("path", "/") or "/")
    headers = spec.get("headers", {}) or {}
    body = b64d(spec.get("body_b64", ""))
    timeout = float(spec.get("timeout", 60))
    url = "http://127.0.0.1:%d%s" % (port, path)
    skip = {"host", "content-length", "connection",
            "transfer-encoding", "expect", "upgrade"}
    req = urllib.request.Request(url, data=body if body else None,
                                 method=method)
    for k, v in headers.items():
        if k.lower() not in skip and v is not None:
            try:
                req.add_header(k, str(v))
            except ValueError:
                pass
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        out = {"status": resp.status,
               "headers": dict(resp.headers.items()),
               "body_b64": b64e(resp.read())}
    except urllib.error.HTTPError as e:
        try:
            rbody = e.read()
        except Exception:
            rbody = b""
        try:
            rheaders = dict(e.headers.items())
        except Exception:
            rheaders = {}
        out = {"status": e.code, "headers": rheaders,
               "body_b64": b64e(rbody)}
    except Exception as e:
        out = {"status": 502,
               "error": "%s: %s" % (type(e).__name__, e),
               "headers": {}, "body_b64": b64e(b"")}
    sys.stdout.write(b64e(json.dumps(out).encode()) + "\n")


main()

#!/usr/bin/env python3
"""xfer.py — file transfer between the cell and yote, fastest lane first.

Primary: binary WebSocket frames via wss://.../exec-ws (binary frames,
no base64 overhead, resumable, server-side sha256 verify, atomic install).
Fallback: mcp lane via yote-mcp-exec (base64-in-heredoc, same verify).

Transport priority (2026-10-12, Chris: fastest primary):
  1. WS binary (wss:// through egress proxy, or ws://127.0.0.1:8379 direct)
  2. MCP lane (yote-mcp-exec code_execution) — if WS is down

Usage:
    xfer.py put <local> <remote> [--mode 0644] [--chunk-kb N] [--via auto|bridge|direct|mcp]
    xfer.py get <remote> <local> [--chunk-kb N] [--via ...]

Remote paths must be inside /home/toxic or /tmp (server policy).
Exit 0 on success with a "sha256 ok" line; exit 1 with "xfer: <reason>"
on stderr otherwise. Reasons are never empty.
"""
import argparse
import asyncio
import base64
import hashlib
import importlib.util
import json
import os
import secrets
import shlex
import socket
import ssl
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
BIN_DIR = os.path.dirname(os.path.abspath(__file__))
from wsframe import (WS_GUID, read_frame, send_frame, read_message,  # noqa: E402
                     _DrainTimeout, _DEFAULT_DRAIN_TIMEOUT_S)

WS_HOSTS = ["estate.tailc9ac71.ts.net", "github-mcp-host.tailc9ac71.ts.net"]
WS_PATH = "/exec-ws"
LOCAL_PORT = 8379
TOKEN_FILE = os.path.expanduser("~/.awrawr_mcp_token")
IDLE_S = 150
PUT_DRAIN_TIMEOUT_S = 60.0
MCP_EXEC_PATH = "/home/hatch/workspace/bin/yote-mcp-exec"


# ---------------------------------------------------------------- WS lane
def _surrogate():
    sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
    sys.path.insert(0, os.path.join(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))), "..",
        "skill-creator", "bin"))
    from dynamic_credentials import dynamic_credential_entry
    entry = dynamic_credential_entry("custom.awrawr-mcp")
    placement = entry.get("placement") or {}
    header = placement.get("custom_header", "X-MCP-Token")
    return header, str(entry["surrogate"]).strip()


def _proxy_target():
    for k in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        v = os.environ.get(k, "")
        if v:
            u = urllib.parse.urlparse(v)
            return u.hostname, u.port or 8080
    raise RuntimeError("no proxy configured")


async def _ws_handshake(reader, writer, host, path, auth_header,
                        auth_value):
    key = base64.b64encode(secrets.token_bytes(16)).decode()
    writer.write((
        "GET %s HTTP/1.1\r\nHost: %s\r\n"
        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
        "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n"
        "%s: %s\r\n\r\n" % (path, host, key, auth_header, auth_value)
    ).encode())
    await writer.drain()
    hs = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 20)
    if b"101" not in hs.split(b"\r\n", 1)[0]:
        raise RuntimeError("ws handshake failed: " +
                           hs.split(b"\r\n", 1)[0][:80].decode("latin-1"))


async def connect_bridge():
    """Cell -> wss:// through the egress proxy, surrogate auth.

    Tries each WS_HOSTS entry in order; the /exec-ws route lives on the
    estate hostname, but github-mcp-host is kept as a fallback.
    """
    header, surrogate = await asyncio.to_thread(_surrogate)
    phost, pport = _proxy_target()
    last_err = None
    for ws_host in WS_HOSTS:
        raw = socket.create_connection((phost, pport), timeout=15)
        try:
            raw.sendall(("CONNECT %s:443 HTTP/1.1\r\nHost: %s:443\r\n\r\n"
                         % (ws_host, ws_host)).encode())
            resp = b""
            while b"\r\n\r\n" not in resp:
                blk = raw.recv(4096)
                if not blk:
                    break
                resp += blk
            if b" 200" not in resp.split(b"\r\n", 1)[0]:
                raise RuntimeError("proxy CONNECT failed")
            ctx = ssl.create_default_context()
            reader, writer = await asyncio.open_connection(
                sock=raw, ssl=ctx, server_hostname=ws_host)
        except Exception as e:
            raw.close()
            last_err = e
            continue
        try:
            await _ws_handshake(reader, writer, ws_host, WS_PATH,
                                header, surrogate)
            return reader, writer
        except Exception as e:
            try:
                writer.close()
            except Exception:
                pass
            last_err = e
            continue
    raise RuntimeError("ws handshake failed on all hosts: %s"
                       % (str(last_err).strip() or repr(last_err)))


async def connect_direct():
    """awrawr-pc -> ws://127.0.0.1:8379, token-file auth. No proxy/TLS."""
    try:
        with open(TOKEN_FILE) as f:
            token = f.read().strip()
    except OSError:
        raise RuntimeError("no token file: " + TOKEN_FILE)
    if not token:
        raise RuntimeError("empty token file")
    reader, writer = await asyncio.open_connection("127.0.0.1", LOCAL_PORT)
    await _ws_handshake(reader, writer, "127.0.0.1:%d" % LOCAL_PORT,
                        WS_PATH, "X-MCP-Token", token)
    return reader, writer


async def connect_ws(via):
    if via == "direct":
        return await connect_direct()
    if via == "bridge":
        return await connect_bridge()
    try:
        s = socket.create_connection(("127.0.0.1", LOCAL_PORT), timeout=3)
        s.close()
        return await connect_direct()
    except OSError:
        return await connect_bridge()


async def _send_json(writer, doc):
    await send_frame(writer, 0x1, json.dumps(doc).encode(), mask=True)


async def _pong(writer, payload):
    await send_frame(writer, 0xA, payload, mask=True)


async def _recv_json(reader, writer):
    while True:
        kind, payload = await asyncio.wait_for(read_message(reader), IDLE_S)
        if kind == "ping":
            await _pong(writer, payload)
            continue
        if kind is not True:
            raise RuntimeError("expected text frame, got binary")
        return json.loads(payload.decode("utf-8", "replace"))


async def _ws_put_once(reader, writer, local, remote, size, digest,
                       chunk, mode):
    op_id = secrets.token_hex(8)
    await _send_json(writer, {"id": op_id, "op": "put", "path": remote,
                              "size": size, "sha256": digest, "mode": mode})
    doc = await _recv_json(reader, writer)
    if doc.get("type") == "put-error":
        raise RuntimeError("server: " + doc.get("message", "?"))
    if doc.get("type") != "put-ready":
        raise RuntimeError("unexpected reply: %r" % (doc,))
    offset = int(doc.get("offset", 0))
    t0 = time.monotonic()
    with open(local, "rb") as f:
        f.seek(offset)
        while True:
            blk = f.read(chunk)
            if not blk:
                break
            try:
                await send_frame(writer, 0x2, blk, mask=True,
                                 drain_timeout=PUT_DRAIN_TIMEOUT_S)
            except _DrainTimeout:
                raise RuntimeError("drain timeout: path stalled for "
                                   "%.0fs; retry resumes" % PUT_DRAIN_TIMEOUT_S)
    await _send_json(writer, {"id": op_id, "op": "put-end"})
    doc = await _recv_json(reader, writer)
    dt = time.monotonic() - t0
    if doc.get("type") != "put-done":
        raise RuntimeError("server: " + doc.get("message", repr(doc)))
    bps = (size - offset) / dt if dt > 0 else 0
    print("put %s -> %s  %d bytes  sha256 ok  %.1fs  %.0f B/s%s (ws)"
          % (local, doc.get("path"), size, dt, bps,
             "  (resumed from %d)" % offset if offset else ""))


async def do_put_ws(via, local, remote, chunk, mode):
    size = os.path.getsize(local)
    digest = _sha256_of(local)
    deadline = time.monotonic() + 300
    while True:
        reader, writer = await connect_ws(via)
        try:
            await _ws_put_once(reader, writer, local, remote, size, digest,
                                chunk, mode)
            return
        except RuntimeError as e:
            msg = str(e)
            retryable = ("transfer busy" in msg) or ("drain timeout" in msg)
            if not retryable or time.monotonic() >= deadline:
                raise
            await asyncio.sleep(2)
        finally:
            try:
                writer.close()
            except Exception:
                pass


async def do_get_ws(via, remote, local, chunk):
    op_id = secrets.token_hex(8)
    reader, writer = await connect_ws(via)
    try:
        await _send_json(writer, {"id": op_id, "op": "get", "path": remote})
        doc = await _recv_json(reader, writer)
        if doc.get("type") == "get-error":
            raise RuntimeError("server: " + doc.get("message", "?"))
        if doc.get("type") != "get-meta":
            raise RuntimeError("unexpected reply: %r" % (doc,))
        size = int(doc["size"])
        want = doc["sha256"]
        tmp = local + ".part-xfer"
        received = 0
        t0 = time.monotonic()
        with open(tmp, "wb") as f:
            while received < size:
                kind, payload = await asyncio.wait_for(
                    read_message(reader), IDLE_S)
                if kind == "ping":
                    await _pong(writer, payload)
                    continue
                if kind is True:
                    end = json.loads(payload.decode("utf-8", "replace"))
                    raise RuntimeError("server: " +
                                       end.get("message", repr(end)))
                f.write(payload)
                received += len(payload)
        doc = await _recv_json(reader, writer)
        if doc.get("type") != "get-done":
            raise RuntimeError("missing get-done: %r" % (doc,))
        got = _sha256_of(tmp)
        if got != want:
            os.unlink(tmp)
            raise RuntimeError("sha256 mismatch on download")
        os.replace(tmp, local)
        dt = time.monotonic() - t0
        print("get %s -> %s  %d bytes  sha256 ok  %.1fs  %.0f B/s (ws)"
              % (remote, local, size, dt, size / dt if dt > 0 else 0))
    finally:
        try:
            writer.close()
        except Exception:
            pass


# --------------------------------------------------------------- MCP lane
def _load_mcp():
    from importlib.machinery import SourceFileLoader
    if not os.path.isfile(MCP_EXEC_PATH):
        raise RuntimeError("mcp lane missing: %s not found" % MCP_EXEC_PATH)
    loader = SourceFileLoader("yote_mcp_exec", MCP_EXEC_PATH)
    spec = importlib.util.spec_from_loader("yote_mcp_exec", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


_MCP = None


def mcp_run(cmd, timeout_ms=60000):
    global _MCP
    if _MCP is None:
        _MCP = _load_mcp()
    try:
        return _MCP.run(cmd, timeout_ms)
    except Exception as e:
        msg = str(e).strip()
        raise RuntimeError("mcp transport failed: %s" % (msg or repr(e)))


def _check_policy(remote):
    if not (remote.startswith("/home/toxic/") or remote.startswith("/tmp/")):
        raise RuntimeError("remote path outside /home/toxic or /tmp: %s"
                           % remote)


def _sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            blk = f.read(1048576)
            if not blk:
                break
            h.update(blk)
    return h.hexdigest()


def do_put_mcp(local, remote, chunk_kb=512, mode="0644"):
    _check_policy(remote)
    size = os.path.getsize(local)
    digest = _sha256_of(local)
    q = shlex.quote
    tmp = remote + ".xfer-tmp"
    tmo = 120000
    rc, out = mcp_run(
        "mkdir -p %s && rm -f %s && : > %s && echo STAGED"
        % (q(os.path.dirname(remote) or "."), q(tmp), q(tmp)),
        tmo)
    if rc != 0 or out.strip() != "STAGED":
        raise RuntimeError("remote staging failed: rc=%d out=%r"
                           % (rc, out.strip()[:200]))
    t0 = time.monotonic()
    raw_per_call = chunk_kb * 1024
    n = 0
    with open(local, "rb") as f:
        while True:
            raw = f.read(raw_per_call)
            if not raw:
                break
            b64 = base64.b64encode(raw).decode()
            rc, out = mcp_run(
                "base64 -d >> %s <<'XFER_EOF'\n%s\nXFER_EOF\n"
                "echo CHUNK_OK" % (q(tmp), b64), tmo)
            if rc != 0 or out.strip() != "CHUNK_OK":
                raise RuntimeError("chunk %d failed: rc=%d out=%r"
                                   % (n, rc, out.strip()[:200]))
            n += 1
    rc, out = mcp_run("stat -c%%s %s && sha256sum %s | cut -d' ' -f1"
                      % (q(tmp), q(tmp)), tmo)
    if rc != 0:
        raise RuntimeError("remote verify failed: rc=%d out=%r"
                           % (rc, out.strip()[:200]))
    lines = out.strip().split()
    if len(lines) < 2 or int(lines[0]) != size or lines[1] != digest:
        raise RuntimeError("sha256/size mismatch on upload")
    rc, out = mcp_run("mv %s %s && chmod %s %s && echo COMMITTED"
                      % (q(tmp), q(remote), q(mode), q(remote)), tmo)
    if rc != 0 or out.strip() != "COMMITTED":
        raise RuntimeError("remote commit failed: rc=%d out=%r"
                           % (rc, out.strip()[:200]))
    dt = time.monotonic() - t0
    print("put %s -> %s  %d bytes  sha256 ok  %.1fs  %.0f B/s  (%d chunks, mcp)"
          % (local, remote, size, dt, size / dt if dt > 0 else 0, n))


def do_get_mcp(remote, local, chunk_kb=512):
    _check_policy(remote)
    q = shlex.quote
    tmo = 120000
    rc, out = mcp_run("stat -c%%s %s && sha256sum %s | cut -d' ' -f1"
                      % (q(remote), q(remote)), tmo)
    if rc != 0:
        raise RuntimeError("remote stat failed: rc=%d out=%r"
                           % (rc, out.strip()[:200]))
    lines = out.strip().split()
    if len(lines) < 2:
        raise RuntimeError("remote stat parse failed")
    size, digest = int(lines[0]), lines[1]
    t0 = time.monotonic()
    raw_per_call = chunk_kb * 1024
    chunks = (size + raw_per_call - 1) // raw_per_call if size else 0
    tmp = local + ".part-xfer"
    with open(tmp, "wb") as f:
        for i in range(chunks):
            rc, b64 = mcp_run(
                "dd if=%s bs=%d skip=%d 2>/dev/null | base64 -w0"
                % (q(remote), raw_per_call, i), tmo)
            if rc != 0:
                raise RuntimeError("chunk %d failed" % i)
            f.write(base64.b64decode(b64))
    got = _sha256_of(tmp)
    if got != digest:
        os.unlink(tmp)
        raise RuntimeError("sha256 mismatch on download")
    os.replace(tmp, local)
    dt = time.monotonic() - t0
    print("get %s -> %s  %d bytes  sha256 ok  %.1fs  %.0f B/s  (%d chunks, mcp)"
          % (remote, local, size, dt, size / dt if dt > 0 else 0, chunks))


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--via", choices=["auto", "bridge", "direct", "mcp"],
                    default="auto",
                    help="transport: WS binary (auto/bridge/direct) or mcp lane")
    ap.add_argument("--chunk-kb", type=int, default=64,
                    help="WS upload frame size in KiB (default 64)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("put")
    p.add_argument("local")
    p.add_argument("remote")
    p.add_argument("--mode", default="0644")
    p.add_argument("--chunk-kb", type=int, default=64)
    p.add_argument("--mcp-chunk-kb", type=int, default=512,
                   help="mcp lane chunk size in KiB (default 512)")
    g = sub.add_parser("get")
    g.add_argument("remote")
    g.add_argument("local")
    g.add_argument("--chunk-kb", type=int, default=64)
    g.add_argument("--mcp-chunk-kb", type=int, default=512)
    args = ap.parse_args()

    # Forced mcp lane
    if args.via == "mcp":
        try:
            if args.cmd == "put":
                do_put_mcp(args.local, args.remote,
                           args.mcp_chunk_kb, args.mode)
            else:
                do_get_mcp(args.remote, args.local, args.mcp_chunk_kb)
        except Exception as e:
            print("xfer: %s" % (str(e).strip() or repr(e)), file=sys.stderr)
            sys.exit(1)
        return

    # Primary: WS binary (fastest). Fallback: mcp lane.
    try:
        if args.cmd == "put":
            if not os.path.isfile(args.local):
                raise RuntimeError("not a file: %s" % args.local)
            asyncio.run(do_put_ws(args.via, args.local, args.remote,
                                  args.chunk_kb * 1024, args.mode))
        else:
            asyncio.run(do_get_ws(args.via, args.remote, args.local,
                                  args.chunk_kb * 1024))
    except Exception as e:
        msg = str(e).strip() or repr(e)
        print("xfer: WS path down (%s); falling back to mcp lane" % msg,
              file=sys.stderr)
        try:
            if args.cmd == "put":
                do_put_mcp(args.local, args.remote,
                           args.mcp_chunk_kb, args.mode)
            else:
                do_get_mcp(args.remote, args.local, args.mcp_chunk_kb)
        except Exception as e2:
            print("xfer: %s" % (str(e2).strip() or repr(e2)),
                  file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Regression tests for xfer.py's mcp-lane transfer.

The gateway may be down; these tests emulate the yote side with a local
directory so the protocol logic (chunking, staging, sha256 verify, atomic
commit, mode preservation, error paths) is verified without a live box.

Run: python3 test_xfer_mcp.py
"""
import base64
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile

XFER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "xfer.py")
YOTE = None  # emulated yote root, set per-test


def fake_mcp_run(cmd, timeout_ms=60000):
    """Emulate yote-mcp-exec.run against a local dir as /home/toxic."""
    yote = os.environ["YOTE_EMU"]
    # Only supports the exact command shapes xfer.py emits.
    if "<<'XFER_EOF'" in cmd:
        m = re.search(r"base64 -d >> (\S+) <<'XFER_EOF'\n(.*)\nXFER_EOF",
                      cmd, re.S)
        assert m, "chunk cmd shape changed: %r" % cmd[:120]
        path = _unquote(m.group(1))
        data = base64.b64decode(m.group(2))
        with open(_map(path), "ab") as f:
            f.write(data)
        assert cmd.rstrip().endswith("echo CHUNK_OK")
        return 0, "CHUNK_OK"
    if cmd.startswith("mkdir -p "):
        # mkdir -p <dir> && rm -f <tmp> && : > <tmp> && echo STAGED
        parts = re.findall(r"mkdir -p (\S+) && rm -f (\S+) && : > (\S+)",
                           cmd)
        assert parts, "stage cmd shape changed: %r" % cmd[:120]
        d, _, tmp = parts[0]
        os.makedirs(_map(_unquote(d)), exist_ok=True)
        p = _map(_unquote(tmp))
        if os.path.exists(p):
            os.unlink(p)
        open(p, "wb").close()
        return 0, "STAGED"
    if cmd.startswith("stat -c%s "):
        m = re.search(r"stat -c%s (\S+) && sha256sum (\S+)", cmd)
        p = _map(_unquote(m.group(1)))
        if not os.path.isfile(p):
            return 1, ""
        h = hashlib.sha256(open(p, "rb").read()).hexdigest()
        return 0, "%d\n%s" % (os.path.getsize(p), h)
    if cmd.startswith("mv "):
        m = re.search(r"mv (\S+) (\S+) && chmod (\S+) (\S+)", cmd)
        src, dst = _map(_unquote(m.group(1))), _map(_unquote(m.group(2)))
        os.replace(src, dst)
        os.chmod(dst, int(m.group(3), 8))
        return 0, "COMMITTED"
    if " | base64 -w0" in cmd:
        m = re.search(r"dd if=(\S+) bs=(\d+) skip=(\d+)", cmd)
        p, bs, skip = _map(_unquote(m.group(1))), int(m.group(2)), int(
            m.group(3))
        with open(p, "rb") as f:
            f.seek(skip * bs)
            data = f.read(bs)
        return 0, base64.b64encode(data).decode()
    raise AssertionError("unexpected cmd: %r" % cmd[:160])


def _unquote(s):
    if len(s) >= 2 and s[0] == "'" and s[-1] == "'":
        return s[1:-1]
    return s


def _map(remote):
    yote = os.environ.get("YOTE_EMU") or YOTE
    # /home/toxic/... -> $YOTE/..., /tmp[/...] -> $YOTE/tmp[/...]
    if remote == "/tmp":
        return os.path.join(yote, "tmp")
    assert remote.startswith("/home/toxic/") or remote.startswith("/tmp/"), \
        "policy: " + remote
    rel = remote[len("/home/toxic/"):] if remote.startswith(
        "/home/toxic/") else "tmp/" + remote[len("/tmp/"):]
    return os.path.join(yote, rel)


def run_xfer(args):
    """Run xfer.py as a subprocess with mcp_run monkeypatched to the emu."""
    shim = tempfile.mkdtemp()
    try:
        wrapper = os.path.join(shim, "run.py")
        with open(wrapper, "w") as fh:
            fh.write(
                "import importlib.util, sys\n"
                "sys.path.insert(0, %r)\n"
                "import test_xfer_mcp as t\n"
                "spec = importlib.util.spec_from_file_location('x', %r)\n"
                "x = importlib.util.module_from_spec(spec)\n"
                "spec.loader.exec_module(x)\n"
                "x.mcp_run = t.fake_mcp_run\n"
                "sys.argv = ['xfer.py'] + %r\n"
                "try:\n"
                "    x.main()\n"
                "except SystemExit as e:\n"
                "    sys.exit(e.code)\n" % (os.path.dirname(
                    os.path.abspath(__file__)), XFER, args))
        env = dict(os.environ, YOTE_EMU=YOTE)
        p = subprocess.run([sys.executable, wrapper], capture_output=True,
                           text=True, timeout=120, env=env)
        return p.returncode, p.stdout, p.stderr
    finally:
        shutil.rmtree(shim, ignore_errors=True)


def _setup():
    global YOTE
    YOTE = tempfile.mkdtemp(prefix="xfer-yote-")
    os.makedirs(os.path.join(YOTE, "tmp"), exist_ok=True)


def _teardown():
    shutil.rmtree(YOTE, ignore_errors=True)


def test_put_small():
    _setup()
    try:
        src = os.path.join(YOTE, "src.bin")
        data = os.urandom(4096)
        open(src, "wb").write(data)
        rc, out, err = run_xfer(
            ["put", src, "/home/toxic/bin/probe", "--mode", "755",
             "--chunk-kb", "1"])
        assert rc == 0, "rc=%d err=%r" % (rc, err)
        assert "sha256 ok" in out, out
        dst = os.path.join(YOTE, "bin", "probe")
        assert open(dst, "rb").read() == data, "bytes differ"
        assert oct(os.stat(dst).st_mode & 0o777) == "0o755", "mode lost"
        assert not os.path.exists(dst + ".xfer-tmp"), "staging not cleaned"
        print("PASS put_small (4KB, 4 chunks, mode 755)")
    finally:
        _teardown()


def test_put_multichunk_binary():
    _setup()
    try:
        src = os.path.join(YOTE, "big.bin")
        data = bytes(range(256)) * 300  # 76800 bytes, all byte values
        open(src, "wb").write(data)
        rc, out, err = run_xfer(
            ["put", src, "/tmp/big.bin", "--chunk-kb", "16"])
        assert rc == 0, "rc=%d err=%r" % (rc, err)
        dst = os.path.join(YOTE, "tmp", "big.bin")
        assert open(dst, "rb").read() == data, "bytes differ"
        want = hashlib.sha256(data).hexdigest()
        assert hashlib.sha256(open(dst, "rb").read()).hexdigest() == want
        print("PASS put_multichunk_binary (76800B, 5 chunks, all byte values)")
    finally:
        _teardown()


def test_get_roundtrip():
    _setup()
    try:
        remote = "/home/toxic/data/blob.bin"
        data = os.urandom(100000)
        p = _map(remote)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "wb").write(data)
        local = os.path.join(YOTE, "got.bin")
        rc, out, err = run_xfer(["get", remote, local, "--chunk-kb", "32"])
        assert rc == 0, "rc=%d err=%r" % (rc, err)
        assert "sha256 ok" in out, out
        assert open(local, "rb").read() == data, "bytes differ"
        print("PASS get_roundtrip (100000B)")
    finally:
        _teardown()


def test_put_rejects_bad_remote():
    _setup()
    try:
        src = os.path.join(YOTE, "s.bin")
        open(src, "wb").write(b"x")
        rc, out, err = run_xfer(["put", src, "/etc/passwd"])
        assert rc != 0, "must fail"
        assert "xfer:" in err and len(err.strip()) > len("xfer:") + 3, \
            "error must be non-empty: %r" % err
        print("PASS put_rejects_bad_remote (rc=%d, msg=%r)" % (rc, err.strip()))
    finally:
        _teardown()


def test_put_missing_local():
    _setup()
    try:
        rc, out, err = run_xfer(["put", "/nonexistent/file.bin", "/tmp/x"])
        assert rc != 0, "must fail"
        assert "xfer:" in err and "not a file" in err, err
        print("PASS put_missing_local (rc=%d)" % rc)
    finally:
        _teardown()


def test_get_missing_remote():
    _setup()
    try:
        rc, out, err = run_xfer(
            ["get", "/tmp/does-not-exist.bin", os.path.join(YOTE, "out.bin")])
        assert rc != 0, "must fail"
        assert "xfer:" in err and len(err.strip()) > len("xfer:") + 3, \
            "error must be non-empty: %r" % err
        print("PASS get_missing_remote (rc=%d, msg=%r)" % (rc, err.strip()))
    finally:
        _teardown()


if __name__ == "__main__":
    test_put_small()
    test_put_multichunk_binary()
    test_get_roundtrip()
    test_put_rejects_bad_remote()
    test_put_missing_local()
    test_get_missing_remote()
    print("ALL XFER MCP TESTS PASSED")

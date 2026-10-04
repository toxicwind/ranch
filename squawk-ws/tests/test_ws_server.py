#!/usr/bin/env python3
"""Tests for squawk-ws/squawk_ws_server.py (stdlib unittest, no deps).

Covers: message parsing, WS framing roundtrip, auth-gated handshake,
durable file_seq->gseq map (no seq:0 seeds), since-replay (outbox +
disk fallback), slow-consumer 1013 close, dynamic channel discovery,
and a live end-to-end subscribe/reconnect cycle.
"""
import asyncio
import base64
import hashlib
import importlib.util
import json
import os
import socket
import struct
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

WS_SERVER_FILE = Path(os.environ.get(
    "WS_SERVER_FILE",
    str(Path(__file__).resolve().parent.parent / "squawk_ws_server.py")))


def load_server(env):
    """Import squawk_ws_server with a controlled environment."""
    name = "squawk_ws_server_under_test_%d" % (time.time_ns() % 10**9)
    for k, v in env.items():
        os.environ[k] = v
    try:
        spec = importlib.util.spec_from_file_location(
            name, WS_SERVER_FILE)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[name] = mod
        spec.loader.exec_module(mod)
        return mod
    finally:
        for k in env:
            os.environ.pop(k, None)


def make_root():
    tmp = Path(tempfile.mkdtemp(prefix="ws-test-"))
    root = tmp / "root"
    (root / "fleet").mkdir(parents=True)
    (root / "leads").mkdir(parents=True)
    return tmp, root


def write_msg(root, channel, seq, sender="tester", text="hello", sealed=False):
    d = root / channel
    d.mkdir(parents=True, exist_ok=True)
    status = "sealed" if sealed else "open"
    body = "" if sealed else text
    (d / ("%d-%s.md" % (seq, sender))).write_text(
        "---\nseq: %d\nchannel: %s\nfrom: %s\nts: 2026-09-30T00:00:00Z\n"
        "status: %s\n---\n%s\n" % (seq, channel, sender, status, body))


def server_env(tmp, root, port=0):
    return {
        "SQUAWK_WS_PORT": str(port),
        "SQUAWK_CHAT_ROOT": str(root),
        "SQUAWK_WS_CHANNELS": "fleet,leads",
        "SQUAWK_WS_VAULT": str(tmp / "no-vault.zip"),
        "SQUAWK_WS_TOKEN_FILE": str(tmp / "token"),
        "SQUAWK_WS_STATE_DIR": str(tmp / "state"),
    }


class ParseTest(unittest.TestCase):
    def setUp(self):
        self.tmp, self.root = make_root()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        self.srv = load_server(server_env(self.tmp, self.root))

    def test_parse_ok(self):
        write_msg(self.root, "fleet", 41, sender="ember", text="hi there")
        p = self.srv.parse_msg_file(self.root / "fleet" / "41-ember.md")
        self.assertEqual(p["msg_seq"], 41)
        self.assertEqual(p["channel"], "fleet")
        self.assertEqual(p["sender"], "ember")
        self.assertEqual(p["text"], "hi there")
        self.assertFalse(p["sealed"])

    def test_parse_sealed_hides_text(self):
        write_msg(self.root, "fleet", 42, text="secret", sealed=True)
        p = self.srv.parse_msg_file(self.root / "fleet" / "42-tester.md")
        self.assertTrue(p["sealed"])
        self.assertEqual(p["text"], "")

    def test_parse_no_frontmatter(self):
        f = self.root / "fleet" / "43-x.md"
        f.write_text("no frontmatter here\n")
        self.assertIsNone(self.srv.parse_msg_file(f))

    def test_parse_bad_seq_defaults_zero(self):
        f = self.root / "fleet" / "44-x.md"
        f.write_text("---\nseq: nope\n---\nbody\n")
        self.assertEqual(self.srv.parse_msg_file(f)["msg_seq"], 0)


class FramingTest(unittest.TestCase):
    def setUp(self):
        self.tmp, self.root = make_root()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        self.srv = load_server(server_env(self.tmp, self.root))

    def test_accept_rfc6455_vector(self):
        key = "dGhlIHNhbXBsZSBub25jZQ=="
        self.assertEqual(self.srv.ws_accept(key),
                         "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")

    def _roundtrip(self, payload: bytes):
        async def go():
            srv = self.srv
            data = srv.ws_encode(payload)
            # client frames are masked; wrap payload in a masked frame
            mask = b"\x11\x22\x33\x44"
            masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            n = len(payload)
            if n < 126:
                hdr = bytes([0x81, 0x80 | n])
            elif n < 65536:
                hdr = bytes([0x81, 0x80 | 126]) + struct.pack(">H", n)
            else:
                hdr = bytes([0x81, 0x80 | 127]) + struct.pack(">Q", n)
            frame = hdr + mask + masked

            class R:
                def __init__(self, buf): self.buf = buf
                async def readexactly(self, k):
                    out, self.buf = self.buf[:k], self.buf[k:]
                    return out
            opcode, fin, out = await srv.ws_read_frame(R(frame))
            self.assertEqual(opcode, 0x1)
            self.assertTrue(fin)
            self.assertEqual(out, payload)
            # server encode is unmasked; decode it back manually
            self.assertEqual(data, srv.ws_encode(payload))
        asyncio.run(go())

    def test_roundtrip_small(self):
        self._roundtrip(b'{"seq": 1}')

    def test_roundtrip_126_boundary(self):
        self._roundtrip(b"x" * 200)

    def test_roundtrip_64k(self):
        self._roundtrip(b"y" * 70000)


class StateMapTest(unittest.TestCase):
    def setUp(self):
        self.tmp, self.root = make_root()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        self.env = server_env(self.tmp, self.root)
        self.srv = load_server(self.env)

    def test_initial_scan_assigns_real_gseqs(self):
        write_msg(self.root, "fleet", 10, text="first")
        write_msg(self.root, "fleet", 11, text="second")
        self.srv.load_state()
        self.srv.do_rescan.__wrapped__ if hasattr(self.srv.do_rescan, "__wrapped__") else None
        # call the locked scanner directly (initial=True seeds, no broadcast)
        self.srv._scan_lock.acquire()
        try:
            self.srv._scan_channels_locked(initial=True)
        finally:
            self.srv._scan_lock.release()
        buf = self.srv.outbox["fleet"]
        self.assertEqual(len(buf), 2)
        seqs = [m["seq"] for m in buf]
        self.assertTrue(all(s > 0 for s in seqs), "no seq:0 seeds, got %r" % seqs)
        self.assertEqual(seqs, sorted(seqs))
        self.assertEqual([m["file_seq"] for m in buf], [10, 11])
        # durable map recorded
        self.assertEqual(self.srv._map_get("fleet", 10), seqs[0])
        self.assertEqual(self.srv._map_get("fleet", 11), seqs[1])

    def test_map_survives_restart(self):
        write_msg(self.root, "fleet", 10, text="first")
        self.srv.load_state()
        self.srv._scan_lock.acquire()
        try:
            self.srv._scan_channels_locked(initial=True)
        finally:
            self.srv._scan_lock.release()
        self.srv.save_state()
        first_gseq = self.srv.outbox["fleet"][0]["seq"]

        srv2 = load_server(self.env)  # fresh import, same state dir
        srv2.load_state()
        self.assertEqual(srv2.gseq, self.srv.gseq)
        srv2._scan_lock.acquire()
        try:
            srv2._scan_channels_locked(initial=True)
        finally:
            srv2._scan_lock.release()
        buf = srv2.outbox["fleet"]
        self.assertEqual(buf[0]["seq"], first_gseq,
                         "restart must keep the recorded gseq, not renumber")

    def test_state_write_is_atomic(self):
        self.srv.gseq = 99
        self.srv._map_put("fleet", 7, 99)
        self.srv.save_state()
        raw = (self.tmp / "state" / "state.json").read_text()
        s = json.loads(raw)
        self.assertEqual(s["gseq"], 99)
        self.assertEqual(s["gseq_map"]["fleet"]["7"], 99)
        self.assertFalse((self.tmp / "state" / "state.json.tmp").exists())


class PublishTest(unittest.TestCase):
    def setUp(self):
        self.tmp, self.root = make_root()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        self.srv = load_server(server_env(self.tmp, self.root))
        self.srv.gseq = 0

    def test_publish_monotonic_and_mapped(self):
        m1 = self.srv.publish("fleet", "a", "one", "ts", False, file_seq=5)
        m2 = self.srv.publish("fleet", "b", "two", "ts", False, file_seq=6)
        self.assertEqual((m1["seq"], m2["seq"]), (1, 2))
        self.assertEqual((m1["file_seq"], m2["file_seq"]), (5, 6))
        self.assertEqual(self.srv._map_get("fleet", 5), 1)
        self.assertEqual(self.srv._map_get("fleet", 6), 2)

    def test_publish_caps_outbox(self):
        self.srv.OUTBOX_KEEP = 200
        for i in range(1, 250):
            self.srv.publish("fleet", "a", "m%d" % i, "", False, file_seq=i)
        self.assertEqual(len(self.srv.outbox["fleet"]), 200)
        self.assertEqual(self.srv.outbox["fleet"][0]["file_seq"], 50)

    def test_slow_consumer_gets_1013_close(self):
        closed = []

        class FakeLoop:
            def call_soon_threadsafe(self, fn, *a):
                fn(*a)  # run inline for the test

        class FakeWriter:
            def __init__(self): self.wrote = bytearray()
            def write(self, b): self.wrote += b
            def close(self): closed.append(True)
            def get_extra_info(self, k): return ("127.0.0.1", 1)

        self.srv._loop = FakeLoop()
        q = asyncio.Queue(maxsize=1)
        q.put_nowait({"seq": 0})  # fill it
        writer = FakeWriter()
        self.srv.subscribers.add((q, frozenset(["fleet"]), writer))
        self.srv.publish("fleet", "a", "overflow", "", False, file_seq=1)
        # subscriber discarded from fan-out...
        self.assertNotIn((q, frozenset(["fleet"]), writer), self.srv.subscribers)
        # ...and a WS close frame with code 1013 was written
        self.assertTrue(closed, "writer.close() must be called")
        self.assertIn(bytes([0x88, 0x02, 0x03, 0xF5]), bytes(writer.wrote))


class ReplayTest(unittest.TestCase):
    def setUp(self):
        self.tmp, self.root = make_root()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        self.srv = load_server(server_env(self.tmp, self.root))
        for i in range(1, 6):
            write_msg(self.root, "fleet", i, text="msg%d" % i)
        self.srv.load_state()
        self.srv._scan_lock.acquire()
        try:
            self.srv._scan_channels_locked(initial=True)
        finally:
            self.srv._scan_lock.release()

    def test_replay_numeric_since(self):
        buf = self.srv.outbox["fleet"]
        since = buf[1]["seq"]
        out = self.srv.replay_since(frozenset(["fleet"]), since)
        self.assertEqual([m["seq"] for m in out],
                         [m["seq"] for m in buf[2:]])
        self.assertTrue(all(m["seq"] > since for m in out))

    def test_replay_dict_since(self):
        write_msg(self.root, "leads", 1, text="lead1")
        self.srv._scan_lock.acquire()
        try:
            self.srv._scan_channels_locked(initial=True)
        finally:
            self.srv._scan_lock.release()
        fleet_buf = self.srv.outbox["fleet"]
        out = self.srv.replay_since(
            frozenset(["fleet", "leads"]),
            {"fleet": fleet_buf[-1]["seq"], "leads": 0})
        self.assertTrue(all(m["channel"] == "leads" for m in out))
        self.assertEqual(len(out), 1)

    def test_replay_disk_fallback_for_old_cursor(self):
        # shrink outbox to simulate retention loss, then replay from 0
        self.srv.outbox["fleet"] = self.srv.outbox["fleet"][-2:]
        out = self.srv.replay_since(frozenset(["fleet"]), 0)
        self.assertEqual(len(out), 5, "disk fallback must recover all 5, got %d" % len(out))
        self.assertEqual([m["file_seq"] for m in out], [1, 2, 3, 4, 5])
        seqs = [m["seq"] for m in out]
        self.assertEqual(seqs, sorted(seqs))

    def test_replay_respects_cap(self):
        self.srv.REPLAY_MAX = 3
        out = self.srv.replay_since(frozenset(["fleet"]), 0)
        self.assertEqual(len(out), 3)
        # oldest-first cap keeps the NEWEST 3
        self.assertEqual([m["file_seq"] for m in out], [3, 4, 5])


class DiscoveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp, self.root = make_root()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        self.srv = load_server(server_env(self.tmp, self.root))

    def test_new_channel_dir_discovered(self):
        (self.root / "ops").mkdir()
        write_msg(self.root, "ops", 1, text="ops msg")
        self.srv._discover_channels()
        self.assertIn("ops", self.srv._dynamic_channels)
        self.assertIn("ops", self.srv.all_channels())
        # and its messages get scanned/published with real seqs
        self.srv.load_state()
        self.srv._scan_lock.acquire()
        try:
            self.srv._scan_channels_locked(initial=True)
        finally:
            self.srv._scan_lock.release()
        self.assertIn("ops", self.srv.outbox)
        self.assertTrue(all(m["seq"] > 0 for m in self.srv.outbox["ops"]))


class EndToEndTest(unittest.TestCase):
    """Live server on 127.0.0.1:0 -- handshake, subscribe, since-reconnect."""

    def setUp(self):
        self.tmp, self.root = make_root()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        (self.tmp / "token").write_text("test-token")
        env = server_env(self.tmp, self.root)
        env["SQUAWK_WS_TOKEN_FILE"] = str(self.tmp / "token")
        self.srv = load_server(env)
        for i in range(1, 4):
            write_msg(self.root, "fleet", i, text="e2e-%d" % i)

    def _run_server(self):
        self._ready = threading.Event()

        def runner():
            async def amain():
                self.srv.load_state()
                self.srv.do_rescan()
                self.srv._loop = asyncio.get_running_loop()
                server = await asyncio.start_server(
                    self.srv.handle_client, "127.0.0.1", 0)
                self.server = server
                self.port = server.sockets[0].getsockname()[1]
                self._ready.set()
                async with server:
                    await server.serve_forever()
            asyncio.run(amain())

        self.thread = threading.Thread(target=runner, daemon=True)
        self.thread.start()
        if not self._ready.wait(timeout=10):
            raise AssertionError("server did not start")
        time.sleep(0.2)

    def tearDown(self):
        try:
            self.server.close()
        except Exception:
            pass

    def _connect(self, subscribe_obj):
        s = socket.create_connection(("127.0.0.1", self.port), timeout=5)
        key = base64.b64encode(os.urandom(16)).decode()
        s.sendall((
            "GET /squawk-ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\n"
            "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "Authorization: Bearer test-token\r\n\r\n" % key).encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = s.recv(4096)
            if not chunk:
                raise AssertionError("no handshake response")
            resp += chunk
        self.assertIn(b"101 Switching Protocols", resp)
        # send masked subscribe frame
        payload = json.dumps(subscribe_obj).encode()
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        s.sendall(bytes([0x81, 0x80 | len(payload)]) + mask + masked)
        return s

    def _read_text_frames(self, s, count, timeout=5):
        s.settimeout(timeout)
        msgs = []
        buf = b""
        while len(msgs) < count:
            chunk = s.recv(65536)
            if not chunk:
                break
            buf += chunk
            while len(buf) >= 2:
                b1, b2 = buf[0], buf[1]
                opcode = b1 & 0x0F
                ln = b2 & 0x7F
                idx = 2
                if ln == 126:
                    ln = struct.unpack(">H", buf[2:4])[0]; idx = 4
                elif ln == 127:
                    ln = struct.unpack(">Q", buf[2:10])[0]; idx = 10
                if len(buf) < idx + ln:
                    break
                payload = buf[idx:idx + ln]
                buf = buf[idx + ln:]
                if opcode == 0x1:
                    msgs.append(json.loads(payload.decode()))
                elif opcode == 0x8:
                    return msgs  # close frame
                # ignore ping/pong
        return msgs

    def test_subscribe_replay_then_live(self):
        self._run_server()
        s = self._connect({"subscribe": ["fleet"]})
        try:
            # no `since` -> last BACKFILL_N per channel (3 msgs here)
            msgs = self._read_text_frames(s, 3)
            self.assertEqual(len(msgs), 3)
            self.assertTrue(all(m["seq"] > 0 for m in msgs))
            self.assertEqual([m["file_seq"] for m in msgs], [1, 2, 3])
            last_seq = msgs[-1]["seq"]
            # live publish arrives on the open connection
            write_msg(self.root, "fleet", 4, text="live-four")
            self.srv.scan_channels()
            time.sleep(0.8)
            live = self._read_text_frames(s, 1, timeout=5)
            self.assertEqual(len(live), 1)
            self.assertEqual(live[0]["file_seq"], 4)
            self.assertGreater(live[0]["seq"], last_seq)
        finally:
            s.close()

    def test_reconnect_with_since(self):
        self._run_server()
        s = self._connect({"subscribe": ["fleet"]})
        try:
            msgs = self._read_text_frames(s, 3)
            cursor = msgs[0]["seq"]  # pretend we only processed the first
        finally:
            s.close()
        time.sleep(0.3)
        # reconnect with since=cursor -> get the remaining 2, no dupes
        s2 = self._connect({"subscribe": ["fleet"], "since": cursor})
        try:
            msgs2 = self._read_text_frames(s2, 2)
            self.assertEqual(len(msgs2), 2)
            self.assertTrue(all(m["seq"] > cursor for m in msgs2))
            self.assertEqual([m["file_seq"] for m in msgs2], [2, 3])
        finally:
            s2.close()

    def test_auth_rejected(self):
        self._run_server()
        s = socket.create_connection(("127.0.0.1", self.port), timeout=5)
        try:
            key = base64.b64encode(os.urandom(16)).decode()
            s.sendall((
                "GET /squawk-ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\n"
                "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
                "Sec-WebSocket-Version: 13\r\n"
                "Authorization: Bearer wrong\r\n\r\n" % key).encode())
            resp = s.recv(4096)
            self.assertIn(b"401", resp)
        finally:
            s.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)


class AuthTest(unittest.TestCase):
    """?token= query auth + feed-token acceptance (unified web credential)."""

    def setUp(self):
        self.tmp, self.root = make_root()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        (self.tmp / "ws-token").write_text("ws-secret")
        (self.tmp / "feed-token").write_text("feed-secret")
        env = server_env(self.tmp, self.root)
        env["SQUAWK_WS_TOKEN_FILE"] = str(self.tmp / "ws-token")
        # point the feed-token fallback at our temp file via env
        self.srv = load_server(env)
        self.srv.FEED_TOKEN_FILE = self.tmp / "feed-token"

    def test_load_tokens_has_both(self):
        toks = self.srv.load_tokens()
        self.assertIn("ws-secret", toks)
        self.assertIn("feed-secret", toks)

    def test_query_token_auth_ok(self):
        # full handshake using ?token= instead of the header
        self.tmp2 = None
        import socket as _socket, base64 as _b64, os as _os
        tmp, root = make_root()
        self.addCleanup(lambda: __import__("shutil").rmtree(tmp, ignore_errors=True))
        (tmp / "ws-token").write_text("ws-secret")
        (tmp / "feed-token").write_text("feed-secret")
        env = server_env(tmp, root)
        env["SQUAWK_WS_TOKEN_FILE"] = str(tmp / "ws-token")
        srv = load_server(env)
        srv.FEED_TOKEN_FILE = tmp / "feed-token"
        write_msg(root, "fleet", 1, text="q")

        import threading as _th, time as _time, asyncio as _aio
        ready = _th.Event()
        holder = {}

        def runner():
            async def amain():
                srv.load_state()
                srv.do_rescan()
                srv._loop = _aio.get_running_loop()
                server = await _aio.start_server(
                    srv.handle_client, "127.0.0.1", 0)
                holder["server"] = server
                holder["port"] = server.sockets[0].getsockname()[1]
                ready.set()
                async with server:
                    await server.serve_forever()
            _aio.run(amain())

        th = _th.Thread(target=runner, daemon=True)
        th.start()
        self.assertTrue(ready.wait(timeout=10))
        _time.sleep(0.2)
        try:
            # 1. feed token via query param -> 101
            s = _socket.create_connection(
                ("127.0.0.1", holder["port"]), timeout=5)
            key = _b64.b64encode(_os.urandom(16)).decode()
            s.sendall((
                "GET /squawk-ws?token=feed-secret HTTP/1.1\r\nHost: x\r\n"
                "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n"
                % key).encode())
            resp = s.recv(4096)
            self.assertIn(b"101 Switching Protocols", resp,
                          "feed token via ?token= must authenticate")
            s.close()
            # 2. wrong token via query param -> 401
            s2 = _socket.create_connection(
                ("127.0.0.1", holder["port"]), timeout=5)
            key2 = _b64.b64encode(_os.urandom(16)).decode()
            s2.sendall((
                "GET /squawk-ws?token=nope HTTP/1.1\r\nHost: x\r\n"
                "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n"
                % key2).encode())
            resp2 = s2.recv(4096)
            self.assertIn(b"401", resp2)
            s2.close()
        finally:
            # Python 3.12 asyncio.Server.close() raises TypeError when
            # serve_forever() was cancelled before _waiters was set up
            # (CPython _wakeup() iterates None). The server is already
            # shutting down; ignore the race.
            try:
                holder["server"].close()
            except TypeError:
                pass


class ReservedDirsTest(unittest.TestCase):
    def test_keys_not_discovered_as_channel(self):
        tmp, root = make_root()
        self.addCleanup(lambda: __import__("shutil").rmtree(tmp, ignore_errors=True))
        (root / "keys").mkdir(exist_ok=True)
        (root / "keys" / "agent1.key").write_text("x")
        (root / "realchan").mkdir(exist_ok=True)
        srv = load_server(server_env(tmp, root))
        srv._discover_channels()
        self.assertNotIn("keys", srv._dynamic_channels)
        self.assertIn("realchan", srv._dynamic_channels)
        self.assertIn("keys", srv.RESERVED_DIRS)


class EmptyOutboxReplayTest(unittest.TestCase):
    """Fresh restart (empty outbox): since=0 must still backfill from disk."""

    def test_replay_since_zero_with_empty_outbox(self):
        tmp, root = make_root()
        self.addCleanup(lambda: __import__("shutil").rmtree(tmp, ignore_errors=True))
        for i in (1, 2, 3):
            write_msg(root, "fleet", i, text="m%d" % i)
        srv = load_server(server_env(tmp, root))
        srv.load_state()
        srv.scan_channels(initial=True)
        # simulate a fresh restart: outbox empty, map/state intact
        srv.outbox.clear()
        got = srv.replay_since(frozenset(["fleet"]), 0)
        self.assertEqual(len(got), 3)
        self.assertEqual([m["file_seq"] for m in got], [1, 2, 3])
        self.assertTrue(all(m["seq"] > 0 for m in got))
        # and a real cursor still filters
        got2 = srv.replay_since(frozenset(["fleet"]), got[1]["seq"])
        self.assertEqual([m["file_seq"] for m in got2], [3])

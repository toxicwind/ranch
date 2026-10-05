#!/usr/bin/env python3
"""Regression tests for the 2026-10-05 WS-lane proxy-frame truncation fixes.

Diagnosis (collab/20261005-0515-bridge-502-diagnosis-ddea0ca0.md): under
concurrent load the WS exec lane truncates large proxy frames (~49KB for
/herd/v1/models) to a few hundred bytes; cell-side svc_proxy failed
json.loads on the truncated frame and synthesized a 502 (~1 in 10-15
concurrent requests). Two defects fixed:

1. connector.svc_proxy: no frame-integrity check, no retry. Now
   _parse_proxy_frame classifies frame failures and svc_proxy re-issues
   the request exactly once for idempotent methods.
2. exec._ws_run: `except ValueError: continue` silently dropped malformed
   chunk lines and the "done" frame returned partial stdout as success
   with truncated=False. Now malformed frames are counted and reported.

3. connector.svc_proxy retry guards (2026-10-05 retry-load follow-up):
   a rolling 10s retry budget (retries >= 25% of attempts -> fail fast)
   and a jittered 50-200ms backoff before each retry.

Run: python3 test_proxy_frame.py
"""

import base64
import json
import os
import socket
import sys
import threading
import time
import unittest
from importlib import import_module
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# connector.py lives in bridge/hatch/ relative to the ranch repo root;
# on the cell it lives in ~/workspace/yote-connector/. Try repo layout first.
_here = os.path.dirname(os.path.abspath(__file__))
_repo_root = os.path.abspath(os.path.join(_here, "..", "..", ".."))
_repo_connector = os.path.join(_repo_root, "bridge", "hatch")
_cell_connector = os.path.expanduser("~/workspace/yote-connector")
for _cand in (_repo_connector, _cell_connector):
    if os.path.isfile(os.path.join(_cand, "connector.py")):
        sys.path.insert(0, _cand)
        break

try:
    import connector
    _HAVE_CONNECTOR = True
except Exception as _e:  # e.g. on yote: connector hardcodes the cell bridge path
    connector = None
    _HAVE_CONNECTOR = False
    _CONNECTOR_IMPORT_ERROR = _e

try:
    bexec = import_module("exec")
except ModuleNotFoundError as _e:
    # exec.py hardcodes a cell-only skill path for dynamic_credentials,
    # which _ws_run never touches. Stub it so the transport tests run
    # on hosts without the cell skill tree (e.g. yote).
    import types

    _fake_dc = types.ModuleType("dynamic_credentials")
    _fake_dc.add_surrogate_to_request = lambda *a, **k: None
    _fake_dc.ensure_allowed_url = lambda *a, **k: True
    sys.modules.setdefault("dynamic_credentials", _fake_dc)
    bexec = import_module("exec")
# Never let the test touch the real lane-down flag file.
bexec._ws_mark_down = lambda: None  # noqa: E731


def make_frame(status=200, body=b'{"models":[]}'):
    doc = {"status": status, "headers": {"Content-Type": "application/json"},
           "body_b64": base64.b64encode(body).decode()}
    return base64.b64encode(json.dumps(doc).encode()).decode() + "\n"


def make_big_frame():
    # Production-sized frame: /herd/v1/models is ~49KB of base64.
    return make_frame(body=b'{"m":"' + b"x" * 48000 + b'"}')


@unittest.skipUnless(_HAVE_CONNECTOR,
                     "connector.py not importable on this host")
class ParseProxyFrameTests(unittest.TestCase):
    def test_good_frame(self):
        doc, err = connector._parse_proxy_frame(make_frame())
        self.assertIsNone(err)
        self.assertEqual(doc["status"], 200)

    def test_empty(self):
        doc, err = connector._parse_proxy_frame("")
        self.assertIsNone(doc)
        self.assertTrue(err.startswith("frame-empty"))

    def test_truncated_b64(self):
        # Truncation mid-frame: cut the base64 to a few hundred bytes.
        doc, err = connector._parse_proxy_frame(make_big_frame()[:173])
        self.assertIsNone(doc)
        self.assertTrue(err.startswith("frame-"), err)

    def test_bad_json(self):
        raw = base64.b64encode(b'{"status": 200, "unterminated').decode()
        doc, err = connector._parse_proxy_frame(raw)
        self.assertIsNone(doc)
        self.assertTrue(err.startswith("frame-json"), err)

    def test_bad_shape(self):
        raw = base64.b64encode(json.dumps({"nope": 1}).encode()).decode()
        doc, err = connector._parse_proxy_frame(raw)
        self.assertIsNone(doc)
        self.assertTrue(err.startswith("frame-shape"), err)


@unittest.skipUnless(_HAVE_CONNECTOR,
                     "connector.py not importable on this host")
class SvcProxyRetryTests(unittest.TestCase):
    def setUp(self):
        connector._proxy_budget_reset()

    def _run(self, method, frames):
        calls = []

        def fake_exec(cmd, workdir="/home/toxic", timeout=120,
                      https_timeout=150):
            calls.append(cmd)
            return {"code": 0, "stdout": frames[len(calls) - 1],
                    "stderr": "", "error": None}

        with mock.patch.object(connector, "yote_exec", fake_exec):
            res = connector.svc_proxy("herd", method, "/v1/models", {}, b"")
        return res, calls

    def test_get_retries_once_on_truncated_frame(self):
        res, calls = self._run("GET", [make_big_frame()[:173], make_frame()])
        self.assertEqual(len(calls), 2, "expected exactly one retry")
        self.assertEqual(res["status"], 200)
        self.assertEqual(res["body"], b'{"models":[]}')

    def test_post_does_not_retry(self):
        res, calls = self._run("POST", [make_big_frame()[:173], make_frame()])
        self.assertEqual(len(calls), 1, "non-idempotent must not retry")
        self.assertEqual(res["status"], 502)
        self.assertIn(b"bad proxy frame", res["body"])

    def test_persistent_truncation_gives_502(self):
        res, calls = self._run("GET", [make_big_frame()[:100]] * 2)
        self.assertEqual(len(calls), 2)
        self.assertEqual(res["status"], 502)

    def test_exec_failure_not_retried_as_frame(self):
        def fake_exec(cmd, workdir="/home/toxic", timeout=120,
                      https_timeout=150):
            return {"code": 1, "stdout": "", "stderr": "boom",
                    "error": "lane down"}

        with mock.patch.object(connector, "yote_exec", fake_exec):
            res = connector.svc_proxy("herd", "GET", "/v1/models", {}, b"")
        self.assertEqual(res["status"], 502)
        self.assertIn(b"yote exec failed", res["body"])


@unittest.skipUnless(_HAVE_CONNECTOR,
                     "connector.py not importable on this host")
class SvcProxyBudgetTests(unittest.TestCase):
    def setUp(self):
        connector._proxy_budget_reset()

    def _run(self, method, frames):
        calls = []

        def fake_exec(cmd, workdir="/home/toxic", timeout=120,
                      https_timeout=150):
            calls.append(cmd)
            return {"code": 0, "stdout": frames[len(calls) - 1],
                    "stderr": "", "error": None}

        with mock.patch.object(connector, "yote_exec", fake_exec):
            res = connector.svc_proxy("herd", method, "/v1/models", {}, b"")
        return res, calls

    def test_retry_still_allowed_on_fresh_budget(self):
        # The budget must not change the normal retry path.
        with mock.patch.object(connector, "_proxy_retry_backoff") as bo:
            res, calls = self._run("GET",
                                   [make_big_frame()[:173], make_frame()])
        self.assertEqual(len(calls), 2)
        self.assertEqual(res["status"], 200)
        bo.assert_called_once_with()

    def test_backoff_not_called_when_no_retry(self):
        with mock.patch.object(connector, "_proxy_retry_backoff") as bo:
            res, calls = self._run("POST", [make_big_frame()[:173],
                                            make_frame()])
        self.assertEqual(len(calls), 1)
        self.assertEqual(res["status"], 502)
        bo.assert_not_called()

    def test_backoff_is_50_to_200ms(self):
        with mock.patch.object(connector.random, "uniform",
                               return_value=0.123) as uni, \
             mock.patch.object(connector.time, "sleep") as slp:
            connector._proxy_retry_backoff()
        uni.assert_called_once_with(0.05, 0.20)
        slp.assert_called_once_with(0.123)

    def test_budget_trips_under_distress(self):
        # Seed 3 attempts + 1 retry in-window: the retry decision then sees
        # 1 retry / 4 attempts = 25% -> budget tripped, fail fast.
        now = time.time()
        for _ in range(3):
            connector._proxy_budget_note_attempt(now)
        self.assertTrue(connector._proxy_budget_retry_allowed(now))
        res, calls = self._run("GET", [make_big_frame()[:173],
                                       make_frame()])
        self.assertEqual(len(calls), 1, "tripped budget must not retry")
        self.assertEqual(res["status"], 502)
        self.assertIn(b"retry budget tripped", res["body"])

    def test_budget_recovers_after_window(self):
        # A budget tripped >10s ago must not block a fresh retry.
        old = time.time() - 11.0
        for _ in range(3):
            connector._proxy_budget_note_attempt(old)
        self.assertTrue(connector._proxy_budget_retry_allowed(old))
        res, calls = self._run("GET",
                               [make_big_frame()[:173], make_frame()])
        self.assertEqual(len(calls), 2, "window aged out: retry allowed")
        self.assertEqual(res["status"], 200)

    def test_quiet_lane_never_trips(self):
        # Many clean attempts, no retries: ratio stays 0, retry allowed.
        now = time.time()
        for _ in range(50):
            connector._proxy_budget_note_attempt(now)
        self.assertTrue(connector._proxy_budget_retry_allowed(now))


class WsRunMalformedFrameTests(unittest.TestCase):
    def _daemon(self, sock, script):
        """Play a scripted daemon: read payload line, write frames, linger."""
        def run():
            buf = b""
            while b"\n" not in buf:
                blk = sock.recv(65536)
                if not blk:
                    return
                buf += blk
            for frame in script:
                sock.sendall(frame)
            time.sleep(5)
            try:
                sock.close()
            except OSError:
                pass

        t = threading.Thread(target=run, daemon=True)
        t.start()
        return t

    def test_malformed_chunk_reported_loudly(self):
        client, daemon = socket.socketpair()
        script = [
            (json.dumps({"type": "chunk", "data": "hello "}) + "\n").encode(),
            b'{"type": "chunk", "data": "trunca',  # truncated: no newline yet
            b'ted garbage \xff\xfe not json at all}\n',
            (json.dumps({"type": "done", "code": 0}) + "\n").encode(),
        ]
        self._daemon(daemon, script)
        res = bexec._ws_run(client, "echo hi", "/tmp", None, 30,
                            capture=True)
        self.assertEqual(res["transport"], "ws")
        self.assertEqual(res["stdout"], "hello ")
        self.assertEqual(res["malformed_frames"], 1)
        self.assertTrue(res["truncated"], "partial output must flag truncated")
        self.assertIn("malformed", res["error"])

    def test_clean_stream_unchanged(self):
        client, daemon = socket.socketpair()
        script = [
            (json.dumps({"type": "chunk", "data": "ok"}) + "\n").encode(),
            (json.dumps({"type": "done", "code": 0}) + "\n").encode(),
        ]
        self._daemon(daemon, script)
        res = bexec._ws_run(client, "echo hi", "/tmp", None, 30,
                            capture=True)
        self.assertEqual(res["stdout"], "ok")
        self.assertEqual(res["malformed_frames"], 0)
        self.assertFalse(res["truncated"])
        self.assertIsNone(res["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

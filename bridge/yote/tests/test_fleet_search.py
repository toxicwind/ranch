"""Repo-owned tests for fleet_search in bridge/yote/awrawr_mcp.py.

Covers: sender filter, oldest-first ordering in the latest window,
since_seq cursor paging, empty query, invalid channel, limit enforcement.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import awrawr_mcp as mcp_mod


def _write(d, seq, sender, title, body):
    d.joinpath("%05d-%s-t.md" % (seq, sender)).write_text(
        "---\n"
        "seq: %d\nfrom: %s\nto: all\nchannel: fleet\n"
        "ts: 2026-10-02T00:00:00+00:00\nstatus: discussion\n"
        "title: %s\n---\n%s\n" % (seq, sender, title, body),
        encoding="utf-8",
    )


def _seqs(text):
    out = []
    for line in text.splitlines():
        if line.startswith("["):
            out.append(int(line[1:].split("]")[0]))
    return out


@pytest.fixture()
def chan(tmp_path, monkeypatch):
    d = tmp_path / "fleet"
    d.mkdir()
    monkeypatch.setattr(mcp_mod, "SQUAWK_ROOT", str(tmp_path))
    return d


def test_sender_filter(chan):
    for i in range(1, 4):
        _write(chan, i, "alice", "note %d" % i, "quux payload alpha")
    for i in range(4, 6):
        _write(chan, i, "bob", "note %d" % i, "quux payload beta")
    assert _seqs(mcp_mod.fleet_search("fleet", "quux", sender="bob")) == [4, 5]
    assert _seqs(mcp_mod.fleet_search("fleet", "quux")) == [1, 2, 3, 4, 5]


def test_sender_filter_case_insensitive(chan):
    _write(chan, 1, "Alice", "hello", "quux here")
    assert _seqs(mcp_mod.fleet_search("fleet", "quux", sender="alice")) == [1]
    assert _seqs(mcp_mod.fleet_search("fleet", "quux", sender="ALICE")) == [1]


def test_ordering_oldest_first_latest_window(chan):
    for i in range(1, 151):
        _write(chan, i, "mcp", "bulk %d" % i, "needle in the haystack")
    seqs = _seqs(mcp_mod.fleet_search("fleet", "needle", limit=20))
    assert len(seqs) == 20
    assert seqs == sorted(seqs)  # oldest-first
    assert seqs == list(range(131, 151))  # latest window of 20


def test_since_seq_cursor(chan):
    for i in range(1, 31):
        _write(chan, i, "mcp", "m %d" % i, "cursorprobe body")
    page1 = _seqs(mcp_mod.fleet_search("fleet", "cursorprobe", limit=10))
    assert page1 == list(range(21, 31))
    # forward cursor: nothing newer than the newest seen
    assert _seqs(mcp_mod.fleet_search("fleet", "cursorprobe",
                                      since_seq=page1[-1])) == []
    mid = _seqs(mcp_mod.fleet_search("fleet", "cursorprobe", since_seq=25))
    assert mid == [26, 27, 28, 29, 30]


def test_empty_query(chan):
    _write(chan, 1, "mcp", "t", "some body")
    assert mcp_mod.fleet_search("fleet", "   ") == "error: empty query"
    assert mcp_mod.fleet_search("fleet", "") == "error: empty query"


def test_invalid_channel(chan):
    assert (mcp_mod.fleet_search("no/such!!", "x")
            == "error: unknown or invalid channel")
    assert (mcp_mod.fleet_search("ghost-channel-xyz", "x")
            == "error: unknown or invalid channel")


def test_limit_enforcement(chan):
    for i in range(1, 151):
        _write(chan, i, "mcp", "bulk %d" % i, "captest marker")
    assert len(_seqs(mcp_mod.fleet_search("fleet", "captest", limit=500))) == 100
    assert len(_seqs(mcp_mod.fleet_search("fleet", "captest", limit=0))) == 1


def test_no_matches(chan):
    _write(chan, 1, "mcp", "t", "unrelated body")
    assert mcp_mod.fleet_search("fleet", "zzz-no-such-token") == "(no matches)"


def test_query_case_insensitive(chan):
    _write(chan, 1, "mcp", "LOUD TITLE", "quiet body")
    assert _seqs(mcp_mod.fleet_search("fleet", "loud")) == [1]
    assert _seqs(mcp_mod.fleet_search("fleet", "QUIET")) == [1]

"""Hyper-race focus_window tests: concurrency, strict verification, edge cases.

Everything here is mocked at hyprctl._run / hyprctl._wlrctl_focus — no live
compositor is touched. A live focus flip moves Chris's real Hyprland
session, so the real flip is validated by hand (focus the already-focused
window: full IPC round-trip, zero visual disruption), never in this suite.
"""

import json
import shutil
import subprocess
import threading
import time

import pytest

from hypruse import hyprctl
from hypruse import journal

STATUS_LUA = json.dumps({"configProvider": "lua", "backend": "drm"})
STATUS_HYPRLANG = json.dumps({"configProvider": "hyprlang", "backend": "drm"})
WANT = "0xabc"


def pin(monkeypatch, provider, broken):
    """Pin the provider and the lua_ipc_broken probe (value + TTL timestamp)."""
    monkeypatch.setattr(hyprctl, "_provider", provider)
    monkeypatch.setattr(hyprctl, "_lua_ipc_broken", broken)
    monkeypatch.setattr(hyprctl, "_lua_ipc_broken_at", time.monotonic())


def make_run(monkeypatch, *, status=STATUS_LUA, eval_out="table",
             on_dispatch=None, active=WANT, clients=()):
    """Script hyprctl._run.

    on_dispatch(args) -> "ok" or raises HyprctlError. active is the address
    reported by -j activewindow (None -> {}). clients feeds -j clients.
    """
    def run(*args):
        if args == ("-j", "status"):
            return status
        if args[0] == "eval":
            return eval_out
        if args[0] == "dispatch":
            return "ok" if on_dispatch is None else on_dispatch(args)
        if args == ("-j", "activewindow"):
            return json.dumps({"address": active} if active else {})
        if args == ("-j", "clients"):
            return json.dumps(clients)
        raise AssertionError(f"unexpected hyprctl call {args!r}")

    monkeypatch.setattr(hyprctl, "_run", run)
    return run


def fake_wlrctl(monkeypatch, behavior="ok", seen=None):
    """Replace _wlrctl_focus. behavior: "ok" | "fail" | ("sleep", secs) | fn."""
    def fake(app_id, timeout=hyprctl._FOCUS_DISPATCH_TIMEOUT_S):
        if seen is not None:
            seen.append((app_id, timeout))
        if behavior == "ok":
            return None
        if behavior == "fail":
            raise hyprctl.HyprctlError("wlrctl not on PATH")
        if isinstance(behavior, tuple):
            _, secs = behavior
            time.sleep(secs)
            return None
        return behavior(app_id, timeout)

    monkeypatch.setattr(hyprctl, "_wlrctl_focus", fake)


def lua_dispatch_ok_but_legacy_syntax_error(args):
    # On a healthy Lua manager the legacy dispatcher string is a Lua syntax
    # error; the hl.dsp.* expression answers "ok".
    if args[1].startswith("hl.dsp"):
        return "ok"
    raise hyprctl.HyprctlError("error: <eof> expected near 'focuswindow'")


# --- dry-run barrier ----------------------------------------------------------


def test_dryrun_barrier_fires_before_any_strategy(monkeypatch):
    monkeypatch.setenv("HYPRUSE_DRYRUN", "1")
    calls = []
    monkeypatch.setattr(hyprctl, "_run", lambda *a: calls.append(a) or "ok")
    with pytest.raises(journal.DryRunError):
        hyprctl.focus_window(WANT)
    assert calls == []  # not even the applicability reads ran


# --- the race itself ----------------------------------------------------------


def test_hyprctl_wins_with_strict_verification(monkeypatch):
    pin(monkeypatch, hyprctl.LUA, False)
    seen_dispatch = []
    make_run(
        monkeypatch,
        on_dispatch=lambda args: seen_dispatch.append(args) or "ok",
        clients=[{"address": WANT, "class": "firefox"}],
    )
    fake_wlrctl(monkeypatch, "fail")
    # legacy raises on this Lua session; only hyprctl can win
    orig = hyprctl._dispatch_as

    def dispatch_as(prov, name, args):
        if prov == hyprctl.HYPRLANG:
            raise hyprctl.HyprctlError("error: <eof> expected near 'focuswindow'")
        return orig(prov, name, args)

    monkeypatch.setattr(hyprctl, "_dispatch_as", dispatch_as)
    assert hyprctl.focus_window(WANT) == "hyprctl"
    assert seen_dispatch and seen_dispatch[0][1].startswith("hl.dsp.focus")


def test_false_ok_is_not_a_win(monkeypatch):
    """hyprctl's dispatch lies ("ok", no focus moves); wlrctl really focuses."""
    pin(monkeypatch, hyprctl.LUA, False)
    state = {"focused": "0xother"}
    make_run(
        monkeypatch,
        on_dispatch=lua_dispatch_ok_but_legacy_syntax_error,
        clients=[{"address": WANT, "class": "firefox"}],
    )
    # activewindow follows the lie-detector state, not the mock default
    orig_query = hyprctl.query

    def query(cmd):
        if cmd == "activewindow":
            return {"address": state["focused"]}
        return orig_query(cmd)

    monkeypatch.setattr(hyprctl, "query", query)

    def wlrctl(app_id, timeout=3.0):
        assert app_id == "firefox"
        state["focused"] = WANT  # the real focus happened here

    monkeypatch.setattr(hyprctl, "_wlrctl_focus", wlrctl)
    monkeypatch.setattr(hyprctl, "_FOCUS_VERIFY_TIMEOUT_S", 0.4)
    assert hyprctl.focus_window(WANT) == "wlrctl"


def test_legacy_wins_when_only_it_applies(monkeypatch):
    """Broken IPC Lua state + no app-id mapping: the last resort carries it."""
    pin(monkeypatch, hyprctl.LUA, True)
    make_run(monkeypatch, on_dispatch=lambda args: "ok", clients=[])
    fake_wlrctl(monkeypatch, "fail")  # must not even run: no app-id
    assert hyprctl.focus_window(WANT) == "legacy"


def test_all_fail_raises_with_every_error_and_skip_reason(monkeypatch):
    pin(monkeypatch, hyprctl.LUA, True)  # hyprctl strategy skipped
    make_run(
        monkeypatch,
        on_dispatch=lambda args: (_ for _ in ()).throw(
            hyprctl.HyprctlError("error: <eof> expected near 'focuswindow'")
        ),
        clients=[],
        active="0xother",
    )
    fake_wlrctl(monkeypatch, "fail")
    monkeypatch.setattr(hyprctl, "_FOCUS_VERIFY_TIMEOUT_S", 0.2)
    with pytest.raises(hyprctl.HyprctlError) as ei:
        hyprctl.focus_window(WANT)
    msg = str(ei.value)
    assert "all strategies failed" in msg
    assert "hyprctl: skipped" in msg and "hl API table" in msg
    assert "wlrctl: no app-id" in msg
    assert "legacy:" in msg


def test_same_tick_tie_breaks_to_hyprctl(monkeypatch):
    """All three verify True: preference order (hyprctl > wlrctl > legacy) decides.

    Workers complete in microseconds; the race loop's first check (before
    any sleep) sees all three (True,) outcomes and must pick hyprctl by
    preference. Run repeatedly to catch any ordering flake.
    """
    pin(monkeypatch, hyprctl.LUA, False)
    make_run(
        monkeypatch,
        on_dispatch=lambda args: "ok",
        clients=[{"address": WANT, "class": "firefox"}],
    )
    fake_wlrctl(monkeypatch, "ok")
    for i in range(20):
        assert hyprctl.focus_window(WANT) == "hyprctl", f"iteration {i}"


def test_hung_strategy_never_blocks_the_race(monkeypatch):
    pin(monkeypatch, hyprctl.LUA, False)
    make_run(
        monkeypatch,
        on_dispatch=lua_dispatch_ok_but_legacy_syntax_error,
        clients=[{"address": WANT, "class": "firefox"}],
    )
    fake_wlrctl(monkeypatch, ("sleep", 30))  # hung loser
    start = time.monotonic()
    assert hyprctl.focus_window(WANT) == "hyprctl"
    assert time.monotonic() - start < 5.0


# --- edge cases ----------------------------------------------------------------


def test_lua_ipc_broken_reprobes_after_ttl(monkeypatch):
    monkeypatch.setattr(hyprctl, "_lua_ipc_broken", False)
    monkeypatch.setattr(hyprctl, "_lua_ipc_broken_at", time.monotonic() - 61.0)

    def run(*args):
        raise hyprctl.HyprctlError("attempt to index a boolean value (global 'hl')")

    monkeypatch.setattr(hyprctl, "_run", run)
    assert hyprctl.lua_ipc_broken() is True  # the reload flipped it; we noticed


def test_lua_ipc_broken_uses_fresh_cache(monkeypatch):
    monkeypatch.setattr(hyprctl, "_lua_ipc_broken", True)
    monkeypatch.setattr(hyprctl, "_lua_ipc_broken_at", time.monotonic())

    def run(*args):
        raise AssertionError("fresh cache must not re-probe")

    monkeypatch.setattr(hyprctl, "_run", run)
    assert hyprctl.lua_ipc_broken() is True


def test_app_id_refreshes_on_stale_miss(monkeypatch):
    calls = []
    pages = [
        [{"address": "0xother", "class": "x"}],
        [{"address": WANT, "class": "firefox"}],
    ]

    def run(*args):
        assert args == ("-j", "clients")
        calls.append(args)
        return json.dumps(pages[min(len(calls) - 1, 1)])

    monkeypatch.setattr(hyprctl, "_run", run)
    assert hyprctl._app_id_for_address(WANT) == "firefox"
    assert len(calls) == 2  # miss, then one fresh query


def test_app_id_gives_up_after_refresh(monkeypatch):
    monkeypatch.setattr(
        hyprctl, "_run", lambda *a: json.dumps([{"address": "0xother"}])
    )
    assert hyprctl._app_id_for_address(WANT) is None


def test_wlrctl_focus_builds_exact_argv(monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda name: "/usr/local/bin/wlrctl")
    seen = {}

    class Proc:
        returncode = 0
        stdout = ""
        stderr = ""

    def run(argv, **kw):
        seen["argv"] = argv
        seen["timeout"] = kw["timeout"]
        seen["env"] = kw["env"]
        return Proc()

    monkeypatch.setattr(subprocess, "run", run)
    hyprctl._wlrctl_focus("firefox")
    assert seen["argv"] == ["wlrctl", "toplevel", "focus", "firefox"]
    assert seen["timeout"] == hyprctl._FOCUS_DISPATCH_TIMEOUT_S
    assert seen["env"]["WAYLAND_DISPLAY"] == "wayland-1"
    assert seen["env"]["XDG_RUNTIME_DIR"] == "/run/user/1000"


def test_verify_requires_exact_address_match(monkeypatch):
    pin(monkeypatch, hyprctl.LUA, False)
    make_run(monkeypatch, active="0xother")
    monkeypatch.setattr(hyprctl, "_FOCUS_VERIFY_POLL_S", 0.05)
    assert hyprctl._verify_focus("0xabc", timeout=0.2) is False
    # normalization: "address:" prefix and case are not significant
    make_run(monkeypatch, active="0xABC")
    assert hyprctl._verify_focus("address:0xabc", timeout=0.2) is True

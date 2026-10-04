"""Thin layer over Hyprland's hyprctl IPC.

Everything hypruse knows about the desktop comes through here, and every
workspace/window action goes back out through dispatch(). It shells out to
the hyprctl binary rather than opening the .socket directly so behaviour
always matches what the user's own shell would do.

Hyprland 0.56 shipped a second config manager, and which one a session runs
changes the IPC, not just how the config is written: under the Lua manager
`hyprctl dispatch` evaluates its argument as a Lua expression and `hyprctl
keyword` is refused outright. It is chosen by the config file's EXTENSION,
so it is not something a version check can answer. provider() probes it and
the rest of this module speaks whichever language came back.

Coordinates everywhere in hypruse are Hyprland's global *logical* layout
coordinates, the same space `hyprctl cursorpos`, client `at`, and cursor
positioning use.
"""

from __future__ import annotations

import contextlib
import json
import os
import shutil
import subprocess
import threading
import time
from typing import Any, Callable

from hypruse import journal


class HyprctlError(RuntimeError):
    """hyprctl failed, returned an error, or is unreachable."""


class VerificationFailed(HyprctlError):
    """A focus strategy failed verification, with a machine-readable reason.

    Borrowed idea (Hypr-Agent-Portal hunt, 2026-09-30): the Portal refuses
    stale targets and reports an explicit VerificationFailed taxonomy
    instead of stringly-typed errors. Ported here as our own implementation:
    the race classifies every loss so the aggregated error — and any caller
    catching this — can tell a closed window from a lying dispatcher from a
    dispatch that raised, without parsing message strings.
    """

    STALE_TARGET = "stale_target"  # window gone from the clients list
    UNVERIFIED = "unverified"      # dispatch ok, activewindow never matched
    DISPATCH = "dispatch"          # the dispatch itself raised

    def __init__(self, strategy: str, wanted: str, reason: str, detail: str = "") -> None:
        self.strategy = strategy
        self.wanted = wanted
        self.reason = reason
        self.detail = detail
        msg = "%s: verification failed (%s)" % (strategy, reason)
        if detail:
            msg += ": %s" % detail
        super().__init__(msg)


def _run(*args: str) -> str:
    if shutil.which("hyprctl") is None:
        raise HyprctlError("hyprctl not found, hypruse needs a running Hyprland session")
    try:
        proc = subprocess.run(
            ["hyprctl", *args], capture_output=True, text=True, timeout=5
        )
    except subprocess.TimeoutExpired as exc:
        raise HyprctlError(f"hyprctl {' '.join(args)} timed out") from exc
    out = proc.stdout.strip()
    if proc.returncode != 0:
        raise HyprctlError(f"hyprctl {' '.join(args)}: {proc.stderr.strip() or out}")
    return out


def query(command: str) -> Any:
    """Run a JSON query: monitors, workspaces, clients, activewindow, cursorpos, ..."""
    out = _run("-j", command)
    try:
        return json.loads(out)
    except json.JSONDecodeError as exc:
        raise HyprctlError(f"unparseable hyprctl -j {command} output: {out[:200]!r}") from exc


def batch_query(commands: list[str]) -> list[Any]:
    """Run several JSON queries in ONE hyprctl invocation (one fork, one
    socket round-trip) instead of one per command, ~4x faster for the
    snapshot. hyprctl concatenates the JSON documents, so split them by
    decoding successive values."""
    spec = " ; ".join(f"j/{c}" for c in commands)
    out = _run("--batch", spec)
    decoder = json.JSONDecoder()
    vals: list[Any] = []
    i, n = 0, len(out)
    while i < n:
        while i < n and out[i].isspace():
            i += 1
        if i >= n:
            break
        try:
            value, i = decoder.raw_decode(out, i)
        except json.JSONDecodeError as exc:
            raise HyprctlError(
                f"unparseable hyprctl --batch output near {out[i : i + 80]!r}"
            ) from exc
        vals.append(value)
    if len(vals) != len(commands):
        raise HyprctlError(
            f"hyprctl --batch returned {len(vals)} results for {len(commands)} commands"
        )
    return vals


# --- config manager ---------------------------------------------------------

# Hyprland 0.56 added a Lua config manager beside the original hyprlang one,
# and picks between them by the config file's extension: `hyprland.lua` is
# looked for BEFORE `hyprland.conf`, a fresh install is given a .lua, and
# safe mode always boots one. That choice reaches the IPC. Under the Lua
# manager `hyprctl dispatch X` is a shorthand for evaluating the Lua
# expression `hl.dispatch(X)`, so a legacy dispatcher string like
# `movecursor 100 100` is a syntax error, and `hyprctl keyword` answers
# "keyword can't work with non-legacy parsers. Use eval." The hyprlang
# manager is untouched, including on 0.56, which is why this is a provider
# check and NOT a version check.
LUA = "lua"
HYPRLANG = "hyprlang"


def parse_provider(out: str) -> str:
    """Read the config manager out of a `hyprctl -j status` reply.

    Anything unreadable means hyprlang. `status` arrived with the Lua
    manager in 0.56, and an older compositor answers the plain string
    "unknown request" with exit code 0, which is exactly the session that
    wants the legacy strings; so does a reply with a provider name this
    version of hypruse has never heard of, since legacy is the only other
    language it can speak."""
    try:
        return LUA if json.loads(out).get("configProvider") == LUA else HYPRLANG
    except (json.JSONDecodeError, AttributeError):
        return HYPRLANG


_provider: str | None = None


def provider() -> str:
    """Which config manager this session runs, probed once and cached.

    `-j status` and not `systeminfo`: both carry the line, but systeminfo
    shells out to `lspci` on the compositor's own event loop and takes two
    seconds, which is a desktop freeze to pay for a string. A probe that
    cannot reach the compositor answers hyprlang without caching, so the
    caller gets the legacy path (right for every pre-0.56 session) and the
    next call tries again rather than inheriting a guess."""
    global _provider
    if _provider is None:
        try:
            _provider = parse_provider(_run("-j", "status"))
        except HyprctlError:
            return HYPRLANG
    return _provider


def forget_provider() -> None:
    """Drop the cached probe, so the next call re-reads it. A session can
    change manager while hypruse is running: `hyprctl reload full-reset`
    re-picks it from the config file's extension, and entering safe mode
    forces the Lua one."""
    global _provider
    _provider = None

_lua_ipc_broken: bool | None = None
_lua_ipc_broken_at: float = 0.0
# A Hyprland `reload full-reset` (or safe-mode entry) can swap the config
# manager and rebuild the IPC Lua state while hypruse is running, so a
# forever-cache would pin the wrong strategy. The probe re-runs when the
# cached answer is older than this; one `hyprctl eval` a minute is the
# whole cost.
_LUA_IPC_BROKEN_TTL_S = 60.0


def lua_ipc_broken() -> bool:
    """Whether this session's IPC Lua state lacks the hl API table.

    Ranch/lasso fork addition: on some Hyprland 0.56.x builds (observed on
    the ranch's own Nix-built 0.56.2, 2026-09-30) the *config* Lua state has
    the full hl.* API but the *IPC* Lua state (hyprctl eval / dispatch)
    only sees hl as a boolean flag. Every hl.dsp.* expression then fails
    with "attempt to index a boolean value (global 'hl')", so no dispatcher
    can run through IPC at all. A clear error beats the raw Lua traceback.
    See COMPAT.md.
    """
    global _lua_ipc_broken, _lua_ipc_broken_at
    now = time.monotonic()
    if _lua_ipc_broken is None or now - _lua_ipc_broken_at >= _LUA_IPC_BROKEN_TTL_S:
        try:
            _run("eval", "return type(hl.dsp)")
            _lua_ipc_broken = False
        except HyprctlError as exc:
            _lua_ipc_broken = "boolean" in str(exc)
        _lua_ipc_broken_at = now
    return _lua_ipc_broken


# --- Lua ---------------------------------------------------------------------

# Everything hypruse sends on the Lua path is built by the helpers below and
# never by an f-string over raw input. `hyprctl dispatch` hands its argument
# to the compositor's own interpreter as an EXPRESSION, with the standard
# library open, so an unescaped argument is not a syntax error to shrug at:
# it is code running inside the compositor.

_LUA_LITERAL = frozenset(range(0x20, 0x7F)) - {0x22, 0x5C}


def lua_str(text: str) -> str:
    """`text` as a Lua string literal, byte for byte.

    Escapes are three digits (`\\009`, not `\\9`) because Lua reads up to
    three, so a short escape followed by a digit character silently becomes
    a different byte. Long-bracket literals would be the obvious
    alternative and are worse on every count: they swallow a leading
    newline, rewrite CRLF, and end early on a closing bracket in the
    content, which turns the rest of the payload into code."""
    if "\0" in text:
        raise HyprctlError("a NUL byte cannot be sent to hyprctl")
    body = "".join(
        chr(b) if b in _LUA_LITERAL else f"\\{b:03d}" for b in text.encode("utf-8")
    )
    return f'"{body}"'


def _lua_exec(command: str) -> str:
    # exec_cmd, not exec_raw: only exec_cmd reaches the spawner that parses
    # a leading `[workspace 3 silent]` rule prefix, which is how launch()
    # places a window. It is the same C++ spawn call legacy `exec` made.
    return f"hl.dsp.exec_cmd({lua_str(command)})"


def _lua_movecursor(x: str, y: str) -> str:
    return f"hl.dsp.cursor.move({{ x = {int(x)}, y = {int(y)} }})"


def _lua_focuswindow(window: str) -> str:
    return f"hl.dsp.focus({{ window = {lua_str(window)} }})"


def _lua_workspace(workspace: str) -> str:
    # `hl.dsp.workspace` holds rename/move/swap, not the switch: changing
    # which workspace you are LOOKING at is hl.dsp.focus, the same
    # dispatcher that focuses a window.
    return f"hl.dsp.focus({{ workspace = {lua_str(workspace)} }})"


def _lua_closewindow(window: str) -> str:
    return f"hl.dsp.window.close({{ window = {lua_str(window)} }})"


def _lua_movetoworkspacesilent(arg: str) -> str:
    # `follow = false` is the entire difference between this and the loud
    # move, and it has to be the Lua literal. Hyprland reads the field as
    # `silent = follow.has_value() && !*follow`, so leaving it out, or
    # sending anything that is not boolean false, drags the human's view to
    # the target workspace and still answers "ok".
    workspace, _, window = arg.partition(",")
    target = f", window = {lua_str(window)}" if window else ""
    return f"hl.dsp.window.move({{ workspace = {lua_str(workspace)}{target}, follow = false }})"


_LUA_FULLSCREEN_MODES = {"0": "fullscreen", "1": "maximized"}


def _lua_fullscreen(mode: str = "0") -> str:
    name = _LUA_FULLSCREEN_MODES.get(mode)
    if name is None:
        raise HyprctlError(f"fullscreen {mode}: expected 0 (fullscreen) or 1 (maximized)")
    return f'hl.dsp.window.fullscreen({{ mode = "{name}", action = "toggle" }})'


def _lua_togglefloating(window: str = "") -> str:
    target = f", window = {lua_str(window)}" if window else ""
    return f'hl.dsp.window.float({{ action = "toggle"{target} }})'


def _lua_tagwindow(tag: str, window: str = "") -> str:
    # the +/- prefix stays inside the tag string on both sides: Hyprland's
    # tag keeper reads it there ('+' sets, '-' unsets, bare toggles).
    target = f", window = {lua_str(window)}" if window else ""
    return f"hl.dsp.window.tag({{ tag = {lua_str(tag)}{target} }})"


# Every dispatcher hypruse emits, and the Lua expression that does the same
# thing. Each pair lands on the SAME C++ action, so the desktop behaves
# identically either way; the two places where the Lua defaults are not the
# legacy ones (a silent move, a fullscreen toggle) are spelled out above.
_LUA_DISPATCH = {
    "exec": _lua_exec,
    "movecursor": _lua_movecursor,
    "focuswindow": _lua_focuswindow,
    "workspace": _lua_workspace,
    "closewindow": _lua_closewindow,
    "movetoworkspacesilent": _lua_movetoworkspacesilent,
    "fullscreen": _lua_fullscreen,
    "togglefloating": _lua_togglefloating,
    "tagwindow": _lua_tagwindow,
}


def lua_dispatch(name: str, args: tuple[str, ...] = ()) -> str:
    """The Lua expression for a legacy dispatcher call, as one argument for
    `hyprctl dispatch`. Sent as a single argv element: hyprctl joins argv
    with spaces, and the expression already carries its own."""
    build = _LUA_DISPATCH.get(name)
    if build is None:
        raise HyprctlError(
            f"dispatch {name}: this session runs the Lua config manager, which does "
            "not speak the legacy dispatcher strings, and hypruse has no Lua form "
            f"for {name!r}"
        )
    try:
        return build(*args)
    except (TypeError, ValueError) as exc:
        raise HyprctlError(f"dispatch {name} {' '.join(args)}: {exc}") from exc


def eval_lua(code: str) -> None:
    """Run a snippet in the compositor's own Lua interpreter (`hyprctl
    eval`). The config-edit sibling of keyword(), and refused by the
    hyprlang manager the way keyword() is refused by the Lua one. Not an
    acting path: dispatchers go through dispatch(), which is where the
    dry-run barrier lives."""
    out = _run("eval", code)
    if out != "ok":
        raise HyprctlError(f"eval {code}: {out}")


# --- acting -----------------------------------------------------------------


def _dispatch_as(prov: str, name: str, args: tuple[str, ...]) -> None:
    request = (lua_dispatch(name, args),) if prov == LUA else (name, *args)
    out = _run("dispatch", *request)
    if out != "ok":
        raise HyprctlError(f"dispatch {name} {' '.join(args)}: {out}")


def dispatch(name: str, *args: str) -> None:
    """Run a dispatcher; Hyprland answers 'ok' on success, an error string
    otherwise. Every dispatcher changes the desktop, so this is the second
    dry-run barrier alongside the input path (see journal.refuse_if_dry).
    Reads go through query/batch_query and are never barriered.

    Callers pass the legacy dispatcher name and arguments whichever config
    manager is running; translation to Lua happens here, so the shape of a
    window op is one thing described in one place."""
    journal.refuse_if_dry(f"dispatch {name}")
    was = provider()
    if was == LUA and lua_ipc_broken():
        raise HyprctlError(
            "dispatch %s: this Hyprland session's IPC Lua state does not "
            "expose the hl API table (hl is a boolean there), so no dispatcher "
            "can run through hyprctl on this build. Read-only tools "
            "(desktop/screenshot/ui/binds) are unaffected. See lasso/COMPAT.md."
            % name
        )
    try:
        _dispatch_as(was, name, args)
    except HyprctlError:
        # The failure may be that the session changed manager under us.
        # Retry only when a re-probe says so, and only when that re-probe
        # actually reached the compositor: provider() answers hyprlang on an
        # unreachable one, and a guess is not evidence the manager moved. It
        # matters because the failure could equally have been the compositor
        # going quiet mid-call, where a retry would repeat a dispatch that
        # did land. When the answer really did move, the first attempt was
        # in the wrong language and inert (a legacy string does not parse as
        # Lua, and an escaped Lua expression is not a dispatcher name), so
        # there is nothing to repeat.
        forget_provider()
        now = provider()
        if now == was or _provider is None:
            raise
        _dispatch_as(now, name, args)


# --- ranch/lasso: hyper-raced three-strategy window focus ------------------------
# Hyprland 0.56.2's IPC Lua state exposes hl as boolean true (not the API
# table), so hl.dsp.* dispatch fails there. Strategy 2 routes around it via
# Wayland foreign-toplevel-management (wlrctl). Verified live 2026-09-30.
#
# The three strategies race concurrently (one daemon thread each) instead of
# running in sequence: a hung strategy never blocks the race, and the first
# STRICTLY VERIFIED win returns. Verification is the win condition — a
# strategy that answers "ok" without the window actually taking focus loses.
# Nothing is ever rolled back: all three strategies stay, cutting edge
# first; the race itself is the fallback mechanism.

# Per-strategy ceiling for the dispatch attempt. Daemon threads, so a loser
# that hangs here never blocks the return.
_FOCUS_DISPATCH_TIMEOUT_S = 3.0
# Activewindow polling budget after a strategy claims success.
_FOCUS_VERIFY_TIMEOUT_S = 2.0
_FOCUS_VERIFY_POLL_S = 0.1
# Race loop quantum. Two strategies verifying inside the same quantum tie;
# ties break by _FOCUS_PREFERENCE, otherwise first-valid-wins, period.
_FOCUS_RACE_QUANTUM_S = 0.025
# Backstop: the whole race, stragglers included, never exceeds this.
_FOCUS_RACE_TIMEOUT_S = 12.0
# Same-tick tie-break only: hyprctl > wlrctl > legacy.
_FOCUS_PREFERENCE = ("hyprctl", "wlrctl", "legacy")


def _app_id_for_address(address: str) -> str | None:
    """Map a Hyprland window address to its Wayland app-id (class).

    The clients list can be stale (a window opened since the last read), so
    a miss is followed by ONE fresh query before giving up — declaring
    wlrctl inapplicable on a stale read would forfeit a working strategy
    for no reason.
    """
    addr = address.removeprefix("address:")
    for _ in range(2):
        try:
            clients = query("clients")
        except HyprctlError:
            return None
        for c in clients:
            if isinstance(c, dict) and c.get("address") == addr:
                return c.get("class") or None
    return None


def _target_live(address: str) -> bool:
    """Is the target window still in the compositor's clients list?

    A single fresh query — no retry on miss (a window that closed stays
    closed; retrying only delays the refusal). If the query itself fails we
    cannot tell, so fail OPEN and let the race decide: never refuse on
    uncertainty.
    """
    addr = address.removeprefix("address:").lower()
    try:
        clients = query("clients")
    except HyprctlError:
        return True
    return any(
        isinstance(c, dict)
        and str(c.get("address") or "").removeprefix("address:").lower() == addr
        for c in clients
    )


def _wlrctl_focus(app_id: str, timeout: float = _FOCUS_DISPATCH_TIMEOUT_S) -> None:
    """Focus via wlrctl foreign-toplevel-management. Raises on failure."""
    if not shutil.which("wlrctl"):
        raise HyprctlError("wlrctl not on PATH")
    env = dict(os.environ)
    env.setdefault("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    env.setdefault("WAYLAND_DISPLAY", "wayland-1")
    try:
        proc = subprocess.run(
            ["wlrctl", "toplevel", "focus", app_id],
            capture_output=True, text=True, timeout=timeout, env=env,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        raise HyprctlError(f"wlrctl toplevel focus: {exc}")
    if proc.returncode != 0:
        raise HyprctlError(
            f"wlrctl toplevel focus {app_id!r}: {proc.stderr.strip() or proc.stdout.strip()}"
        )


def _verify_focus(wanted: str, timeout: float = _FOCUS_VERIFY_TIMEOUT_S) -> bool:
    """Strict win condition: `hyprctl -j activewindow` must name our address.

    Polls briefly because the compositor applies focus asynchronously; a
    strategy whose dispatch answered "ok" without the window taking focus
    (wrong workspace, swallowed event, lying exit status) is NOT a win. A
    verification that cannot complete inside the budget fails the strategy
    the same as a wrong answer.
    """
    wanted = wanted.removeprefix("address:").lower()
    deadline = time.monotonic() + timeout
    while True:
        try:
            active = query("activewindow")
        except HyprctlError:
            active = None
        if isinstance(active, dict):
            got = str(active.get("address") or "").removeprefix("address:").lower()
            if got and got == wanted:
                return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(_FOCUS_VERIFY_POLL_S)


def _applicable_focus_strategies(
    addr: str, raw_address: str
) -> tuple[list[tuple[str, Callable[[], None]]], list[tuple[str, str]]]:
    """The strategies that may run, plus the ones skipped and why.

    Applicability is decided BEFORE the race starts, in the main thread, so
    the dry-run barrier (which fires first, in focus_window) strictly
    precedes any strategy thread. A strategy with no app-id mapping is kept
    as an immediately-raising entry so the final error says WHY wlrctl sat
    out instead of silently dropping it.
    """
    runners: list[tuple[str, Callable[[], None]]] = []
    skipped: list[tuple[str, str]] = []
    prov = provider()
    if not (prov == LUA and lua_ipc_broken()):
        runners.append(("hyprctl", lambda: _dispatch_as(prov, "focuswindow", (addr,))))
    else:
        skipped.append(
            ("hyprctl", "IPC Lua state lacks the hl API table (see lasso/COMPAT.md)")
        )

    app_id = _app_id_for_address(raw_address)
    if app_id is not None:
        runners.append(("wlrctl", lambda: _wlrctl_focus(app_id, _FOCUS_DISPATCH_TIMEOUT_S)))
    else:
        def _no_app_id() -> None:
            raise HyprctlError(f"no app-id for {raw_address} in clients list")

        runners.append(("wlrctl", _no_app_id))

    runners.append(("legacy", lambda: _dispatch_as(HYPRLANG, "focuswindow", (addr,))))
    return runners, skipped


def _race_focus_strategy(
    name: str,
    thunk: Callable[[], None],
    wanted: str,
    outcomes: dict[str, tuple[bool, str, VerificationFailed | None]],
    lock: threading.Lock,
    won: threading.Event,
) -> None:
    """One strategy's race entry: dispatch, then strict verification.

    Any exception — dispatch failure, verify timeout, anything unexpected —
    is recorded as this strategy's loss, never as a dead thread: a worker
    must never kill the race. Losses carry a VerificationFailed taxonomy
    (None for unexpected exceptions) so the aggregation can classify.
    """
    ok, err, failure = False, "", None
    try:
        thunk()
    except HyprctlError as exc:
        failure = VerificationFailed(name, wanted, VerificationFailed.DISPATCH, str(exc))
        err = str(failure)
    except Exception as exc:  # noqa: BLE001 — the race degrades, never dies
        err = f"{name}: unexpected {type(exc).__name__}: {exc}"
    else:
        if won.is_set():
            return  # decided already; don't pile verification queries on
        if _verify_focus(wanted, timeout=_FOCUS_VERIFY_TIMEOUT_S):
            ok = True
        else:
            # Dispatch claimed success but the compositor never showed our
            # window focused. Distinguish the window closing mid-race from a
            # dispatcher that lied: one fresh liveness probe decides.
            try:
                active = query("activewindow")
                observed = str((active or {}).get("address") or "?")
            except HyprctlError:
                observed = "?"
            reason = (
                VerificationFailed.STALE_TARGET
                if not _target_live(wanted)
                else VerificationFailed.UNVERIFIED
            )
            failure = VerificationFailed(
                name, wanted, reason, f"activewindow shows {observed}"
            )
            err = str(failure)
    with lock:
        outcomes[name] = (ok, err, failure)


def focus_window(address: str) -> str:
    """Focus the window at ADDRESS, hyper-racing three strategies.

    All applicable strategies fire at once (one daemon thread each); the
    first STRICTLY VERIFIED win returns. Verification queries
    `hyprctl -j activewindow` and requires the focused address to match —
    an "ok" that didn't move focus is a loss, not a win. Per-strategy
    ceilings (dispatch and verify) mean a hung strategy never blocks the
    race; losers are daemon threads that die with the process.

    1. hyprctl dispatch (Lua hl.dsp.* when the IPC Lua state has the API
       table, else legacy) — strict stdout == "ok" check.
    2. wlrctl toplevel focus <app-id> via foreign-toplevel-management.
    3. Legacy focuswindow as a last resort (hyprlang sessions).

    Same-tick ties break hyprctl > wlrctl > legacy; otherwise
    first-valid-wins, period. Returns the winning strategy's name
    ("hyprctl", "wlrctl", "legacy"). Raises HyprctlError carrying every
    strategy's error (and every skip reason) if all fail. Losses are
    classified (VerificationFailed: stale_target / unverified / dispatch);
    a target missing from the clients list is refused before the race
    starts. The dry-run
    barrier fires before any strategy thread starts.
    """
    journal.refuse_if_dry(f"focus_window {address}")
    addr = address if address.startswith("address:") else f"address:{address}"
    wanted = addr.removeprefix("address:").lower()
    # Stale-target refusal (borrowed from the Hypr-Agent-Portal hunt): never
    # race three strategies against a window that already closed. Fail open —
    # _target_live returns True when the clients query itself fails.
    if not _target_live(address):
        raise VerificationFailed(
            "pre-race",
            wanted,
            VerificationFailed.STALE_TARGET,
            f"target {address} not in clients list; refusing to race a closed window",
        )
    runners, skipped = _applicable_focus_strategies(addr, address)

    outcomes: dict[str, tuple[bool, str, VerificationFailed | None]] = {}
    lock = threading.Lock()
    won = threading.Event()
    for name, thunk in runners:
        threading.Thread(
            target=_race_focus_strategy,
            args=(name, thunk, wanted, outcomes, lock, won),
            name=f"focus-race-{name}",
            daemon=True,
        ).start()

    deadline = time.monotonic() + _FOCUS_RACE_TIMEOUT_S
    while True:
        with lock:
            for name in _FOCUS_PREFERENCE:
                res = outcomes.get(name)
                if res is not None and res[0]:
                    won.set()
                    return name
            if len(outcomes) >= len(runners):
                break  # everyone reported; no winner among them
        if time.monotonic() >= deadline:
            break  # hung stragglers; daemon threads die with the process
        time.sleep(_FOCUS_RACE_QUANTUM_S)

    errors = [f"{name}: skipped ({reason})" for name, reason in skipped]
    reasons: set[str] = set()
    for name, _thunk in runners:
        res = outcomes.get(name)
        if res is None:
            errors.append(f"{name}: timed out without reporting")
        elif not res[0]:
            errors.append(res[1])
            if res[2] is not None:
                reasons.add(res[2].reason)
    headline = "all strategies failed"
    if reasons == {VerificationFailed.STALE_TARGET}:
        headline = "target went stale; all strategies failed"
    raise HyprctlError(
        f"focus_window {address}: {headline}: " + "; ".join(errors)
    )


def keyword(name: str, *values: str) -> None:
    """Set a config keyword at runtime (`hyprctl keyword`, not a dispatcher):
    used for runtime windowrulev2/border rules. Answers 'ok' on success.
    Only the hyprlang manager has keywords; see border_rule()."""
    out = _run("keyword", name, *values)
    if out != "ok":
        raise HyprctlError(f"keyword {name} {' '.join(values)}: {out}")


# The matcher spelling changed across Hyprland versions (0.42+ dropped the
# colon: `tag NAME`, older is `tag:NAME`) and the field was renamed from the
# deprecated `windowrulev2 bordercolor` to `windowrule border_color` with a
# single 6-char color, so we try the current form first and fall back.
_BORDER_RULES = (
    "border_color {color}, tag {tag}",   # Hyprland 0.42+
    "border_color {color}, tag:{tag}",   # older
)


def border_rule(tag: str, color: str) -> None:
    """Install the runtime window rule that outlines a tagged window.

    A runtime rule is a config edit, and the two managers take config
    differently: hyprlang has `hyprctl keyword`, which the Lua manager
    refuses, and Lua has `hl.window_rule`, a table it registers and then
    re-applies to every open window. The rule is named on the Lua side so a
    restart reuses it instead of stacking a second copy. Session-scoped
    either way: a config reload drops it."""
    if provider() == LUA:
        eval_lua(
            f"hl.window_rule({{ name = {lua_str(tag)}, match = {{ tag = {lua_str(tag)} }}, "
            f"border_color = {lua_str(color)} }})"
        )
        return
    for rule in _BORDER_RULES:
        try:
            keyword("windowrule", rule.format(color=color, tag=tag))
            return  # first accepted form wins
        except HyprctlError:
            continue
    raise HyprctlError(f"no windowrule spelling this Hyprland accepts for tag {tag}")


def notify(message: str, ms: int = 4000, icon: int = -1, color: str = "0") -> None:
    """Show a Hyprland on-screen notification. Best-effort: a notify failure
    must never break the action that triggered it."""
    with contextlib.suppress(HyprctlError):
        _run("notify", str(icon), str(ms), color, message)


def cursor_pos() -> tuple[int, int]:
    pos = query("cursorpos")
    return int(pos["x"]), int(pos["y"])


def logical_rect(m: dict[str, Any]) -> tuple[int, int, int, int]:
    """A monitor's rect in global logical coordinates (the one space
    everything else in hypruse uses). hyprctl reports width/height as
    physical mode pixels, so the logical footprint is size/scale, with
    the axes swapped by 90/270-degree transforms (odd transform values).
    This is the single source of truth for monitor geometry."""
    scale = float(m.get("scale", 1.0)) or 1.0
    w, h = m["width"] / scale, m["height"] / scale
    if int(m.get("transform", 0)) % 2:
        w, h = h, w
    return int(m["x"]), int(m["y"]), round(w), round(h)


def contains(rect: tuple[int, int, int, int], x: float, y: float) -> bool:
    rx, ry, rw, rh = rect
    return rx <= x < rx + rw and ry <= y < ry + rh


def monitor_at(monitors: list[dict[str, Any]], x: float, y: float) -> dict[str, Any] | None:
    """The monitor whose logical rect contains (x, y), or None if the
    point is off every monitor."""
    return next((m for m in monitors if contains(logical_rect(m), x, y)), None)


def _window(c: dict[str, Any]) -> dict[str, Any]:
    """Trim a hyprctl client to what a model needs to reason and act."""
    win: dict[str, Any] = {
        "address": c["address"],
        "workspace": c.get("workspace", {}).get("id"),
        "class": c.get("class", ""),
        "title": c.get("title", ""),
        "at": c.get("at"),
        "size": c.get("size"),
        "floating": c.get("floating", False),
        "pid": c.get("pid"),
    }
    # int enum since Hyprland 0.42 (0 none / 1 maximized / 2 fullscreen), bool before
    if c.get("fullscreen"):
        win["fullscreen"] = True
    if c.get("hidden"):
        win["hidden"] = True
    return win


def _monitor(m: dict[str, Any]) -> dict[str, Any]:
    """Trim a hyprctl monitor to a model view, geometry in the same global
    logical space as window `at`/`size` (see logical_rect: hyprctl's raw
    width/height are physical mode pixels)."""
    x, y, w, h = logical_rect(m)
    out: dict[str, Any] = {
        "name": m["name"],
        "geometry": [x, y, w, h],
        "scale": m.get("scale", 1.0),
        "focused": m.get("focused", False),
        "active_workspace": m.get("activeWorkspace", {}).get("id"),
    }
    if int(m.get("transform", 0)):
        out["transform"] = int(m["transform"])
    return out


# layer-shell surfaces are not windows: launchers, bars, and notification
# daemons live here, invisible to `clients`. Namespaces are app-chosen
# strings, so classification is a prefix heuristic that degrades to
# 'unknown' rather than mislabeling.

# stacking order, lowest first; also the ordering key for resolving which
# of several overlapping surfaces actually receives input
LAYER_LEVELS = ("background", "bottom", "top", "overlay")

# NOTE on `lock`: a MODERN lock screen (hyprlock, swaylock >= 1.7) is an
# ext-session-lock-v1 client, not a layer-shell client, so it never
# appears here at all and this kind cannot match it. Detecting a locked
# session is trust.session_locked()'s job. The kind is kept because older
# lockers did draw with layer-shell, and because a surface that names
# itself 'lockscreen' should not be mistaken for an ordinary overlay.
_LAYER_KINDS = (
    ("launcher", ("wofi", "rofi", "fuzzel", "tofi", "anyrun", "walker", "launcher")),
    ("bar", ("waybar", "hyprpanel", "ags-", "bar")),
    ("notifications", ("mako", "dunst", "swaync", "notification")),
    ("lock", ("hyprlock", "swaylock", "lockscreen")),
    ("osk", ("wvkbd", "squeekboard", "osk")),
)


def layer_kind(namespace: str) -> str:
    ns = namespace.lower()
    for kind, prefixes in _LAYER_KINDS:
        if any(ns.startswith(p) for p in prefixes):
            return kind
    return "unknown"


# layer kinds that take the seat over from the windows beneath them.
# These do NOT all grab the keyboard: a launcher (and a legacy layer-shell
# lock screen) does, while an on-screen keyboard SENDS keys rather than
# eating them. What they share is that each one receives, or swallows, the
# POINTER input aimed at whatever its surface covers, and each is a seat
# takeover a running `sequence` must notice. Bars and notification popups
# are surfaces too, but not a takeover.
FOCUS_STEALING_KINDS = frozenset({"launcher", "lock", "osk"})

# the subset that actually holds a keyboard grab, so synthetic keys reach
# the layer no matter which window was focused
KEYBOARD_GRABBING_KINDS = frozenset({"launcher", "lock"})


def parse_layers(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten `hyprctl layers -j` (monitor -> level -> surfaces) into a
    model view. The background level (wallpaper daemons) is dropped as
    noise; geometry is already global logical, the same space as window
    `at`/`size`.

    A surface listed here is one Hyprland TRACKS, which is weaker than
    visible and weaker even than mapped: the compositor appends a layer
    surface to the monitor's list when the client creates it and drops it
    only when the client destroys it, so one that never mapped, or that
    unmapped and stayed alive, is reported exactly like a live launcher.
    The dump carries no visibility flag, so nothing downstream may read a
    namespace's presence as 'that overlay is up'; only a frame answers
    that."""
    out: list[dict[str, Any]] = []
    for monitor, entry in (raw or {}).items():
        for level_id, surfaces in (entry.get("levels") or {}).items():
            level = int(level_id)
            if level == 0 or not surfaces:
                continue
            for s in surfaces:
                ns = s.get("namespace", "")
                out.append(
                    {
                        "namespace": ns,
                        "kind": layer_kind(ns),
                        "level": LAYER_LEVELS[level] if level < 4 else str(level),
                        "monitor": monitor,
                        "geometry": [s.get("x"), s.get("y"), s.get("w"), s.get("h")],
                    }
                )
    return out


def snapshot_from(
    monitors: list[dict[str, Any]],
    workspaces: list[dict[str, Any]],
    clients: list[dict[str, Any]],
    active_window: dict[str, Any] | None,
    cursor: tuple[int, int] | None,
    layers: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pure assembly of the desktop state, separated from IPC for testability."""
    visible = {m.get("activeWorkspace", {}).get("id") for m in monitors}
    snap = {
        "monitors": [_monitor(m) for m in monitors],
        "workspaces": [
            {
                "id": w["id"],
                "name": w.get("name", ""),
                "monitor": w.get("monitor", ""),
                "windows": w.get("windows", 0),
                "visible": w["id"] in visible,
            }
            for w in sorted(workspaces, key=lambda w: w["id"])
        ],
        "windows": [_window(c) for c in clients if c.get("mapped", True)],
        "active_window": (active_window or {}).get("address"),
        "cursor": list(cursor) if cursor else None,
    }
    surfaces = parse_layers(layers or {})
    if surfaces:  # token-lean: absent when there is nothing but wallpaper
        snap["layers"] = surfaces
    return snap


def snapshot() -> dict[str, Any]:
    """Compact, token-lean view of the whole desktop, from one batched
    hyprctl call (~4x faster than separate queries)."""
    monitors, workspaces, clients, active, cursor, layers = batch_query(
        ["monitors", "workspaces", "clients", "activewindow", "cursorpos", "layers"]
    )
    cur = (int(cursor["x"]), int(cursor["y"])) if cursor else None
    return snapshot_from(monitors, workspaces, clients, active or None, cur, layers)


# X11 modifier bits as Hyprland reports them in `binds` modmask
_MOD_BITS = (
    (64, "SUPER"),
    (4, "CTRL"),
    (1, "SHIFT"),
    (8, "ALT"),
    (2, "CAPS"),
    (16, "MOD2"),
    (32, "MOD3"),
    (128, "MOD5"),
)


def modmask_to_names(mask: int) -> list[str]:
    return [name for bit, name in _MOD_BITS if mask & bit]


# A Lua config binds a closure rather than a named dispatcher, and Hyprland
# reports every one of them as the pseudo-dispatcher `__lua` with a Lua
# registry index for an argument. That index means nothing outside the
# compositor and there is no IPC route that calls the closure, so parse_binds
# reports the fact instead of the number: the combo and the description still
# say what the owner's workflow IS, which is most of what `binds` is for.
_LUA_HANDLER = "__lua"
LUA_BIND = "lua"

# A bind on a device that is not the keyboard. `mouse` is the hyprlang
# manager's own flag and a Lua config never sets it, so the key name has to
# be read too. Prefixes, not bare words: `mouse_up`/`mouse_down` are the
# scroll binds, and those DO carry a real dispatcher, so they stay listed
# and use_bind still runs them.
_UNPRESSABLE_KEYS = ("mouse:", "switch:")


def parse_binds(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Trim hyprctl's bind records to what an agent can actually use.

    Pointer-button and lid/switch binds are dropped (nothing here can
    reproduce them); keycode-only binds keep a code: marker so they are at
    least visible; a Lua closure's action reads `lua` and carries no arg.
    """
    out: list[dict[str, Any]] = []
    for b in raw:
        if b.get("mouse"):
            continue
        key = b.get("key") or ""
        if not key and b.get("keycode"):
            key = f"code:{b['keycode']}"
        if not key or key.startswith(_UNPRESSABLE_KEYS):
            continue
        combo = "+".join([*modmask_to_names(int(b.get("modmask", 0))), key])
        action = b.get("dispatcher", "")
        entry: dict[str, Any] = {"combo": combo}
        if action == _LUA_HANDLER:
            entry["action"] = LUA_BIND
        else:
            entry["action"] = action
            entry["arg"] = b.get("arg", "")
        if b.get("description"):
            entry["description"] = b["description"]
        if b.get("submap"):
            entry["submap"] = b["submap"]
        out.append(entry)
    return out


def binds() -> list[dict[str, Any]]:
    return parse_binds(query("binds"))


def _norm_combo(combo: str) -> str:
    return combo.upper().replace(" ", "")


def find_bind(combo: str) -> dict[str, Any] | None:
    target = _norm_combo(combo)
    for b in binds():
        if _norm_combo(b["combo"]) == target:
            return b
    return None

#!/usr/bin/env python3
"""ws_supervise.py — lightweight supervisor for the cell-side ws_daemon.

Why it exists (2026-10-04): ws_daemon.py hot-looped (CPU-bound spin,
~7x cell load, 2245ms bridge round-trips) with no watcher. The daemon
only starts on demand (exec.py singleflight); nothing restarts a sick one.
This supervisor closes that gap.

What it does, every 30s (cheap /proc reads only):
  1. Daemon process missing -> start it directly (same nohup invocation
     exec.py uses) and verify the socket answers.
  2. Socket not answering -> the daemon is wedged: SIGTERM the exact PID
     (the daemon drains in-flight clients on SIGTERM), wait for exit,
     then start a fresh one and verify the socket.
  3. CPU anomaly -> sample /proc/<pid>/stat utime+stime over a 5s window;
     if usage > 80% of one core AND the socket is unresponsive, treat as
     a hot-loop: SIGTERM, wait, restart, verify.

What it never does:
  - Never SIGKILLs (SIGTERM only; the daemon's graceful shutdown drains).
  - Never touches any other process (exact-PID discipline from the state
    file + /proc comm verification).
  - Never restarts a healthy daemon.

Logs to ~/.cache/awrawr-ws-supervise.log with UTC + America/Denver stamps.
Singleflight via flock on ~/.cache/awrawr-ws-supervise.lock.
"""
import fcntl
import json
import os
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta

CACHE = os.path.expanduser("~/.cache")
STATE_PATH = os.path.join(CACHE, "awrawr-ws-bridge.state")
SOCK_PATH = os.path.join(CACHE, "awrawr-ws-bridge.sock")
LOG_PATH = os.path.join(CACHE, "awrawr-ws-supervise.log")
LOCK_PATH = os.path.join(CACHE, "awrawr-ws-supervise.lock")
DAEMON = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "ws_daemon.py")
DENVER = timezone(timedelta(hours=-6))  # MDT; MST (-7) handled by date note

CHECK_INTERVAL = 30
CPU_WINDOW = 5.0
CPU_THRESHOLD = 0.80  # fraction of one core over the window
TERM_WAIT = 15
START_WAIT = 60


def ts():
    now = datetime.now(timezone.utc)
    dv = now.astimezone(DENVER)
    return now.strftime("%Y-%m-%d %H:%M:%S UTC") + " / " + \
        dv.strftime("%Y-%m-%d %H:%M:%S Denver")


def log(*a):
    line = "[%s] %s\n" % (ts(), " ".join(str(x) for x in a))
    try:
        with open(LOG_PATH, "a") as f:
            f.write(line)
    except OSError:
        pass


def read_state():
    try:
        with open(STATE_PATH) as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def pid_is_daemon(pid):
    """Exact identity: /proc/<pid>/comm must be python3 and the cmdline
    must reference ws_daemon.py (never substring-match anything else)."""
    try:
        with open("/proc/%d/comm" % pid) as f:
            comm = f.read().strip()
        with open("/proc/%d/cmdline" % pid, "rb") as f:
            argv = f.read().split(b"\0")
        return comm == "python3" and any(
            b"ws_daemon.py" in a for a in argv)
    except OSError:
        return False


def socket_answers(path=SOCK_PATH, timeout=3):
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(timeout)
        try:
            s.connect(path)
            return True
        finally:
            s.close()
    except OSError:
        return False


def proc_times(pid):
    """(utime, stime) in jiffies from /proc/<pid>/stat."""
    try:
        with open("/proc/%d/stat" % pid) as f:
            parts = f.read().rsplit(")", 1)[1].split()
        return int(parts[11]), int(parts[12])
    except (OSError, IndexError, ValueError):
        return None


def cpu_fraction(pid, window=CPU_WINDOW):
    a = proc_times(pid)
    if a is None:
        return None
    time.sleep(window)
    b = proc_times(pid)
    if b is None:
        return None
    jiff = os.sysconf("SC_CLK_TCK")
    return ((b[0] + b[1]) - (a[0] + a[1])) / (jiff * window)


def start_daemon():
    log("starting ws_daemon")
    # Same detached invocation exec.py uses for on-demand starts.
    subprocess.Popen(
        [sys.executable, DAEMON],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        cwd=os.path.expanduser("~"))
    deadline = time.time() + START_WAIT
    while time.time() < deadline:
        if socket_answers():
            st = read_state()
            log("daemon up, socket answering (pid=%s)" % st.get("pid"))
            return True
        time.sleep(2)
    log("WARNING: daemon started but socket never answered")
    return False


def stop_daemon(pid):
    log("SIGTERM daemon pid=%d" % pid)
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        log("pid %d already gone" % pid)
        return True
    deadline = time.time() + TERM_WAIT
    while time.time() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            log("pid %d exited cleanly" % pid)
            return True
        time.sleep(0.5)
    log("WARNING: pid %d did not exit after SIGTERM "
        "(leaving it; no SIGKILL per policy)" % pid)
    return False


def supervise_once():
    st = read_state()
    pid = st.get("pid")
    alive = isinstance(pid, int) and pid_is_daemon(pid)
    sock = socket_answers()

    if not alive:
        log("no live daemon (state pid=%s)" % pid)
        start_daemon()
        return

    if not sock:
        log("daemon pid=%d alive but socket dead: wedged, restarting" % pid)
        if stop_daemon(pid):
            start_daemon()
        return

    # Healthy path: socket answers. Only sample CPU when there is a
    # reason to suspect a spin (cheap check first: none needed — the
    # 5s sample itself is the cost, ~1 /proc read pair per 30s cycle).
    frac = cpu_fraction(pid)
    if frac is not None and frac > CPU_THRESHOLD:
        # Re-verify the socket is still answering after the sample window;
        # a busy-but-working daemon (bulk transfer) must not be killed.
        if not socket_answers():
            log("HOT-LOOP suspected: pid=%d cpu=%.0f%% of one core, "
                "socket unresponsive -> restarting" % (pid, frac * 100))
            if stop_daemon(pid):
                start_daemon()
        else:
            log("pid=%d cpu=%.0f%% but socket healthy: leaving alone"
                % (pid, frac * 100))


def main():
    os.makedirs(CACHE, exist_ok=True)
    lockf = open(LOCK_PATH, "w")
    try:
        fcntl.flock(lockf, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("another supervisor holds the lock; exiting")
        return
    log("supervisor started (pid=%d)" % os.getpid())
    while True:
        try:
            supervise_once()
        except Exception as e:  # never die on a check failure
            log("check failed: %r" % e)
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    main()

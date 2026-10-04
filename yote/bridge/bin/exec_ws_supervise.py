#!/usr/bin/env python3
"""exec_ws_supervise.py — yote-side supervisor for the exec-ws bridge server.

Why it exists (2026-10-04): the cell-side ws_daemon supervisor watches the
cell half of the bridge, but the yote half — awrawr_ws_exec.py on :25204 —
has wedged before on the yote side (217 threads, unresponsive, per 2026-10-03
verification) with nothing watching it. The cell cannot supervise yote (no
/proc access, no kill path from the cell), so the supervision lives here, on
yote, next to the process it guards.

What it does, every 30s (cheap /proc reads + one TCP connect):
  1. Server process missing -> start it (same invocation the pitchfork toml
     uses) and verify TCP connect on :25204.
  2. TCP connect fails -> the server is wedged: run the hot-restart
     sequence (below) and verify.
  3. Thread count anomaly -> if Threads > 150 (the wedge ran 217) AND TCP
     is unresponsive, treat as wedged: hot-restart.

Hot-restart sequence (the restart invariant):
  a. Start a CANDIDATE on WS_EXEC_PORT=25205 (alternate port).
  b. Prove the candidate: TCP connect to 127.0.0.1:25205 must succeed.
     If it does not, ABANDON: the old server is left untouched.
  c. Verify the old PID: /proc/<pid>/comm + cmdline must identify
     awrawr_ws_exec.py. Never signal a PID that fails verification.
  d. SIGTERM the exact old PID. Wait up to 15s for exit and for :25204
     to come free.
  e. Start the new server on :25204 (WS_EXEC_PORT=25204). Prove it with
     a TCP connect.
  f. SIGTERM the 25205 candidate (cleanup).
  A failed candidate leaves the old process untouched (step b gates
  everything after it).

What it never does:
  - Never SIGKILLs (SIGTERM only; the server drains in-flight clients).
  - Never touches any other process (exact-PID discipline + /proc
    cmdline verification before every signal).
  - Never restarts a healthy server.

The cell ws_daemon auto-reconnects with backoff when the yote server
restarts ("bridge disconnected, reconnecting"), so a yote-side restart
is transparent to the cell half.

Logs to ~/.cache/exec-ws-supervise.log with UTC + America/Denver stamps.
Singleflight via flock on ~/.cache/exec-ws-supervise.lock.
"""
import fcntl
import os
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta

CACHE = os.path.expanduser("~/.cache")
LOG_PATH = os.path.join(CACHE, "exec-ws-supervise.log")
LOCK_PATH = os.path.join(CACHE, "exec-ws-supervise.lock")
PID_PATH = os.path.join(CACHE, "exec-ws-server.pid")

# The server script. Prefer the ranch-tracked copy; fall back to the
# estate bridge copy (the live pitchfork toml still names the estate path).
CANDIDATES = [
    "/home/toxic/estate/ranch/yote/bridge/bin/awrawr_ws_exec.py",
    "/home/toxic/estate/bridge/awrawr_ws_exec.py",
]
PORT = 25204
CANDIDATE_PORT = 25205
DENVER = timezone(timedelta(hours=-6))  # MDT; MST (-7) noted in log

CHECK_INTERVAL = 30
THREAD_THRESHOLD = 150  # the wedge ran 217 threads
TERM_WAIT = 15
START_WAIT = 30
CONNECT_TIMEOUT = 5


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


def server_script():
    for p in CANDIDATES:
        if os.path.isfile(p):
            return p
    return None


def tcp_answers(port=PORT, timeout=CONNECT_TIMEOUT):
    """The exec-ws server is raw TCP (manual WS framing); a successful
    TCP connect proves the listener is alive."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        try:
            s.connect(("127.0.0.1", port))
            return True
        finally:
            s.close()
    except OSError:
        return False


def pid_is_server(pid):
    """Exact identity: cmdline must reference awrawr_ws_exec.py."""
    try:
        with open("/proc/%d/cmdline" % pid, "rb") as f:
            argv = f.read().split(b"\0")
        return any(b"awrawr_ws_exec.py" in a for a in argv)
    except OSError:
        return False


def find_server_pid():
    """Locate the live server PID via the pid file, else via ss."""
    try:
        with open(PID_PATH) as f:
            pid = int(f.read().strip())
        if pid_is_server(pid):
            return pid
    except (OSError, ValueError):
        pass
    # Fall back to ss: find the listener on PORT and verify identity.
    try:
        out = subprocess.check_output(
            ["ss", "-tlnp"], stderr=subprocess.DEVNULL,
            text=True, timeout=5)
    except Exception:
        return None
    import re
    for line in out.splitlines():
        if (":%d " % PORT) not in line:
            continue
        m = re.search(r"pid=(\d+)", line)
        if m and pid_is_server(int(m.group(1))):
            return int(m.group(1))
    return None


def thread_count(pid):
    try:
        with open("/proc/%d/status" % pid) as f:
            for line in f:
                if line.startswith("Threads:"):
                    return int(line.split()[1])
    except (OSError, ValueError, IndexError):
        pass
    return None


def start_server(port):
    script = server_script()
    if not script:
        log("ERROR: no server script found")
        return None
    env = dict(os.environ)
    env["WS_EXEC_PORT"] = str(port)
    log("starting candidate server on :%d (%s)" % (port, script))
    proc = subprocess.Popen(
        [sys.executable, script],
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        cwd=os.path.expanduser("~"))
    deadline = time.time() + START_WAIT
    while time.time() < deadline:
        if tcp_answers(port):
            log("server answering on :%d (pid=%d)" % (port, proc.pid))
            if port == PORT:
                try:
                    with open(PID_PATH, "w") as f:
                        f.write(str(proc.pid))
                except OSError:
                    pass
            return proc.pid
        if proc.poll() is not None:
            log("WARNING: candidate on :%d exited early (rc=%d)"
                % (port, proc.returncode))
            return None
        time.sleep(1)
    log("WARNING: server on :%d never answered" % port)
    # Don't leave a deaf candidate lying around.
    try:
        if pid_is_server(proc.pid):
            os.kill(proc.pid, signal.SIGTERM)
    except (ProcessLookupError, OSError):
        pass
    return None


def stop_pid(pid):
    """SIGTERM the exact verified PID. Never SIGKILL."""
    if not pid_is_server(pid):
        log("refusing to signal pid=%d: identity check failed" % pid)
        return False
    log("SIGTERM server pid=%d" % pid)
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


def port_free(port):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2)
        try:
            s.connect(("127.0.0.1", port))
            return False
        except OSError:
            return True
        finally:
            s.close()
    except OSError:
        return True


def hot_restart(old_pid):
    """Restart invariant: candidate first, prove it, then (and only then)
    terminate the exact verified old PID. A failed candidate leaves the
    old process untouched."""
    log("hot-restart: old pid=%d" % old_pid)
    # (a,b) Candidate on the alternate port; abandon if it never answers.
    cand_pid = start_server(CANDIDATE_PORT)
    if cand_pid is None:
        log("hot-restart ABANDONED: candidate failed; old pid=%d untouched"
            % old_pid)
        return False
    # (c) Re-verify the old PID before signaling (it may have changed).
    if not pid_is_server(old_pid):
        log("hot-restart ABANDONED: old pid=%d failed re-verification; "
            "cleaning up candidate" % old_pid)
        stop_pid(cand_pid)
        return False
    # (d) SIGTERM the old, wait for the port to free.
    if not stop_pid(old_pid):
        log("hot-restart ABANDONED: old pid=%d would not exit; "
            "cleaning up candidate" % old_pid)
        stop_pid(cand_pid)
        return False
    deadline = time.time() + TERM_WAIT
    while time.time() < deadline and not port_free(PORT):
        time.sleep(0.5)
    if not port_free(PORT):
        log("hot-restart ABANDONED: :%d never freed; candidate cleaned up"
            % PORT)
        stop_pid(cand_pid)
        return False
    # (e) Start the new server on the real port and prove it.
    new_pid = start_server(PORT)
    if new_pid is None:
        log("CRITICAL: old server stopped but new server on :%d failed "
            "to start (candidate on :%d was proven; manual recovery needed)"
            % (PORT, CANDIDATE_PORT))
        # Leave the proven candidate running as the emergency fallback
        # rather than killing the only working server.
        return False
    # (f) Cleanup: the alternate-port candidate has served its purpose.
    stop_pid(cand_pid)
    log("hot-restart complete: old=%d new=%d" % (old_pid, new_pid))
    return True


def supervise_once():
    pid = find_server_pid()
    if pid is None:
        log("no live server found; starting on :%d" % PORT)
        start_server(PORT)
        return

    if not tcp_answers():
        log("server pid=%d not answering TCP: wedged, hot-restarting" % pid)
        hot_restart(pid)
        return

    nthreads = thread_count(pid)
    if nthreads is not None and nthreads > THREAD_THRESHOLD:
        # Busy-but-working is fine; only restart if TCP also degrades.
        # Re-probe TCP after the thread sample to avoid racing a transient.
        if not tcp_answers():
            log("WEDGE suspected: pid=%d threads=%d, TCP unresponsive -> "
                "hot-restarting" % (pid, nthreads))
            hot_restart(pid)
        else:
            log("pid=%d threads=%d but TCP healthy: leaving alone"
                % (pid, nthreads))


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

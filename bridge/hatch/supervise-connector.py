#!/usr/bin/env python3
"""Supervisor wrapper for the yote-connector daemon.

Why this exists: the connector died silently 4x in one night (2026-09-21
~23:51, ~01:1x, ~04:28, ~04:31 MDT) with no traceback and no error in its
log. A bare log cannot distinguish "killed from outside" from "crashed
inside". This supervisor wait()s on the child and records HOW it died:

  - killed by signal N  -> external killer (SIGKILL=9: OOM or kill -9;
                          SIGTERM=15: someone/something asked it to stop)
  - exited with code N  -> the connector process itself ended (internal)

SELF-HEALING (2026-10-01): the supervisor now RESPAWNS the child with
exponential backoff (5s -> 60s cap, reset after the child survives 300s).
Rationale: the previous design exited after one death and depended on the
5-minute progress-watchdog for restarts -- but on 2026-09-30 the watchdog
scheduler itself died silently at 22:52 UTC and the connector then sat
dead for hours with nobody restarting it. Depending on an external
restarter is a single point of failure; the supervisor is the process
closest to the child and must own the respawn.

No-shadow guarantees (so a stale supervisor can never fight a fresh one):
  - before every (re)spawn, the supervisor probes 127.0.0.1:18301. If the
    port is bound AND serving (connect probe succeeds), it logs and exits --
    someone else owns the slot.
  - if the port is bound but NOT serving, the holder is wedged (holds the
    bind, refuses connects -- observed 2026-10-03: backlog full, EADDRINUSE
    death spiral). reclaim_port() kills it with exact-PID discipline
    (verified connector.py + connector cwd) before respawning. A holder
    that is not our connector is never touched.
  - start-detached.py refuses to launch when the port is bound.
  - SIGTERM to the supervisor is honored promptly: it stops the child
    (if still ours) and exits without respawning. The deploy path
    (deploy-yote-connector / stop_connector_exact) SIGTERMs supervisor +
    child, so deploys never race a respawn.

MUTUAL WATCH (2026-10-01): every 10 minutes the supervisor best-effort
runs `watchdog-scheduler ensure` (idempotent). The scheduler's
progress-watchdog is the second layer: its restart_local_connector()
relaunches THIS supervisor if the supervisor itself is killed. Each side
keeps the other alive; a simultaneous kill of both is the residual risk
and is reported, not silently absorbed.

Launch (log-preserving, detached) -- use the dedicated launcher:
  python3 /home/hatch/workspace/yote-connector/start-detached.py --wait 8
The old `cd DIR && setsid nohup ... &` shell pattern is RETIRED: the `&`
bound the whole `cd && ...` chain, leaving the daemon in a subshell tied
to the launching exec session (reaped between watchdog runs). The launcher
uses Popen(start_new_session=True) with no shell backgrounding, guards
against EADDRINUSE, and verifies /health plus PPID 1 / own SID.

The connector child still writes its own connector.pid (see connector.py
main()), so watchdog pid checks keep working against the child process.
"""

import datetime
import os
import signal
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SUP_LOG = os.path.join(HERE, "supervisor.log")
CHILD = os.path.join(HERE, "connector.py")
HOST, PORT = "127.0.0.1", 18301
SCHEDULER = os.path.join(os.path.expanduser("~"), "workspace", "bin",
                         "watchdog-scheduler")
ENSURE_INTERVAL = 600      # mutual-watch tick: scheduler ensure, seconds
BACKOFF_START = 5
BACKOFF_MAX = 60
BACKOFF_RESET_AFTER = 300  # child surviving this long resets the backoff

SIGNAMES = {9: "SIGKILL", 15: "SIGTERM", 1: "SIGHUP", 2: "SIGINT"}

_shutdown = False


def slog(msg):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = "[supervisor %s] %s\n" % (ts, msg)
    try:
        with open(SUP_LOG, "a") as f:
            f.write(line)
    except OSError:
        sys.stderr.write(line)  # file unwritable: stderr only


def _on_sigterm(signum, frame):
    global _shutdown
    _shutdown = True


def port_serving():
    """True if something is actually listening on HOST:PORT.

    Connect-based, not bind-based: a bind probe without SO_REUSE_ADDRESS
    reports "bound" for a port lingering in TIME_WAIT after a SIGKILLed
    child, even though a real server (SO_REUSE_ADDRESS) binds it fine.
    That false positive made the supervisor exit instead of respawning
    (observed 2026-10-01). A connect succeeds only when a live listener
    answers.
    """
    s = socket.socket()
    s.settimeout(2)
    try:
        s.connect((HOST, PORT))
        return True
    except OSError:
        return False
    finally:
        s.close()


def _port_inode(port):
    """Socket inode bound to 127.0.0.1:port in LISTEN state, via /proc/net/tcp."""
    try:
        with open("/proc/net/tcp") as f:
            lines = f.readlines()[1:]
    except OSError:
        return None
    want = "0100007F:%04X" % port  # 127.0.0.1:port, hex
    for line in lines:
        parts = line.split()
        if len(parts) > 9 and parts[1] == want and parts[3] == "0A":
            return parts[9]
    return None


def _holder_pids(inode):
    """PIDs holding the socket inode (via /proc/<pid>/fd)."""
    pids = []
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        fd_dir = "/proc/%s/fd" % pid
        try:
            fds = os.listdir(fd_dir)
        except OSError:
            continue
        for fd in fds:
            try:
                if os.readlink(os.path.join(fd_dir, fd)) == "socket:[%s]" % inode:
                    pids.append(int(pid))
                    break
            except OSError:
                continue
    return pids


def _is_our_connector(pid):
    """Exact-PID discipline: cmdline must be our connector.py AND cwd the
    connector dir. Anything else is never touched, no matter what."""
    try:
        with open("/proc/%d/cmdline" % pid, "rb") as f:
            parts = f.read().decode("utf-8", "replace").split("\x00")
        if len(parts) < 2 or not parts[1].endswith("/connector.py"):
            return False
        cwd = os.readlink("/proc/%d/cwd" % pid)
        return os.path.abspath(cwd) == HERE
    except OSError:
        return False


def reclaim_port():
    """Kill a wedged holder of our port. Returns True when the port is free.

    Wedge shape (observed 2026-10-03): child holds the 18301 bind but stops
    accept()ing -- backlog fills, connects get refused, supervisor's
    connect probe says "not serving", respawn hits EADDRINUSE, child gives
    up after retries: death spiral. Reclaim breaks it: SIGTERM the verified
    holder, SIGKILL if it ignores TERM, then the port is free to bind.
    A holder that fails the exact-PID check is never signaled.
    """
    inode = _port_inode(PORT)
    if inode is None:
        return True  # not bound at all
    if port_serving():
        return False  # live owner -- not wedged, do not touch
    me = os.getpid()
    for pid in _holder_pids(inode):
        if pid == me:
            continue
        if not _is_our_connector(pid):
            slog("port %d held by foreign pid=%d (not our connector) -- "
                 "will not signal, backing off" % (PORT, pid))
            return False
        slog("wedged holder pid=%d owns port %d but is not serving -- "
             "SIGTERM" % (pid, PORT))
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            continue
        for _ in range(10):  # up to 5s for the bind to release
            time.sleep(0.5)
            if _port_inode(PORT) is None:
                break
        else:
            slog("wedged holder pid=%d ignored SIGTERM -- SIGKILL" % pid)
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                pass
            time.sleep(1)
    return _port_inode(PORT) is None


def ensure_scheduler():
    """Best-effort mutual watch: keep the watchdog scheduler alive.

    Never raises; never blocks the supervisor for long. A failure here is
    logged, not fatal -- the respawn loop must survive it.
    """
    try:
        if not (os.path.isfile(SCHEDULER) and os.access(SCHEDULER, os.X_OK)):
            return
        subprocess.run([sys.executable, SCHEDULER, "ensure"],
                       stdin=subprocess.DEVNULL,
                       stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL,
                       timeout=30)
    except Exception as e:  # noqa: BLE001 - best-effort only
        slog("scheduler ensure failed (best-effort): %r" % e)


def spawn_child():
    env = dict(os.environ)  # child inherits YOTE_CONNECTOR_PORT etc.
    return subprocess.Popen(
        [sys.executable, CHILD],
        cwd=HERE,
        env=env,
        stdin=subprocess.DEVNULL,
        start_new_session=True,  # child in its own session; we only wait()
    )


def wait_with_watch(proc, last_ensure):
    """Wait for the child; run the mutual-watch tick every ENSURE_INTERVAL.

    Returns (returncode_or_None, last_ensure). rc None means we were asked
    to shut down (SIGTERM) while the child was still alive.
    """
    while True:
        if _shutdown:
            return None, last_ensure
        try:
            rc = proc.wait(timeout=30)
            return rc, last_ensure
        except subprocess.TimeoutExpired:
            pass
        now = time.time()
        if now - last_ensure >= ENSURE_INTERVAL:
            ensure_scheduler()
            last_ensure = now


def main():
    signal.signal(signal.SIGTERM, _on_sigterm)
    backoff = BACKOFF_START
    last_ensure = 0.0
    first = True
    while True:
        if _shutdown:
            slog("received SIGTERM -- exiting without respawn")
            return 0
        if port_serving():
            # Someone else owns the slot (fresh deploy, manual start).
            # Exit rather than shadow it.
            slog("port %s:%d is serving -- another owner holds the slot, "
                 "exiting without respawn" % (HOST, PORT))
            return 0
        # Bound but not serving: wedged holder (2026-10-03 edge case).
        # Reclaim with exact-PID discipline; back off and retry if a
        # foreign process holds it.
        if _port_inode(PORT) is not None and not reclaim_port():
            slog("port %s:%d still held after reclaim -- backing off 10s"
                 % (HOST, PORT))
            deadline = time.time() + 10
            while time.time() < deadline:
                if _shutdown:
                    slog("received SIGTERM during reclaim backoff -- exiting")
                    return 0
                time.sleep(0.5)
            continue
        proc = spawn_child()
        slog("child started pid=%d cmd=%s" % (proc.pid, CHILD))
        started = time.time()
        # Mutual-watch tick also runs while the child is healthy.
        if first or time.time() - last_ensure >= ENSURE_INTERVAL:
            ensure_scheduler()
            last_ensure = time.time()
            first = False
        rc, last_ensure = wait_with_watch(proc, last_ensure)
        if rc is None:  # SIGTERM arrived while waiting
            slog("received SIGTERM -- stopping child pid=%d and exiting" % proc.pid)
            try:
                proc.terminate()
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    proc.kill()
            except Exception:
                pass
            return 0
        lived = time.time() - started
        if rc < 0:
            signum = -rc
            slog("child pid=%d KILLED by signal %d (%s) -- external killer, "
                 "not an internal crash" % (proc.pid, signum,
                                            SIGNAMES.get(signum, "?")))
        else:
            slog("child pid=%d exited with status %d" % (proc.pid, rc))
        if rc == 0:
            slog("child exited cleanly (status 0) -- intentional stop, "
                 "not respawning")
            return 0
        # Abnormal death: respawn with backoff.
        if lived >= BACKOFF_RESET_AFTER:
            backoff = BACKOFF_START
        else:
            backoff = min(backoff * 2, BACKOFF_MAX)
        slog("respawning child in %ds (lived %.0fs)" % (backoff, lived))
        deadline = time.time() + backoff
        while time.time() < deadline:
            if _shutdown:
                slog("received SIGTERM during backoff -- exiting")
                return 0
            time.sleep(0.5)


if __name__ == "__main__":
    sys.exit(main())

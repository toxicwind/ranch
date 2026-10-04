#!/usr/bin/env python3
"""Independent death-watcher for the yote-connector supervisor+child.

Why this exists: when the supervisor itself is SIGTERMed (e.g. by an
over-broad `pkill -f '[c]onnector.py'`, which matches the supervisor too
-- proven 2026-10-03), nobody records how the child died. The supervisor's
whole job is classifying deaths; a dead supervisor classifies nothing.

This watcher is a SEPARATE process with no shared fate: it polls the
supervisor and child PIDs every 10s and appends every transition to
death-watch.log (append-only, never truncated). It NEVER kills anything.

It also heals the supervisor layer: if no supervisor is running and the
port is not serving, it runs start-detached.py (which refuses if the port
is bound -- no races, no duplicates). Child-level healing stays the
supervisor's job (5s respawn); supervisor-level healing is this watcher's
job (10s poll). The watchdog-scheduler ensures THIS watcher is running
(t_death_watch task); the supervisor's mutual-watch tick ensures the
scheduler is running. Every layer watches another layer; no layer watches
itself.

Launch (detached, PPID 1, own SID):
    cd ~/workspace/yote-connector && setsid nohup python3 death-watch.py \
        >>death-watch.log 2>&1 < /dev/null &
Or via the scheduler's t_death_watch ensure task (preferred).
"""

import datetime
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DW_LOG = os.path.join(HERE, "death-watch.log")
DW_PID = os.path.join(HERE, "death-watch.pid")
CHILD_PID_FILE = os.path.join(HERE, "connector.pid")
SUPERVISOR = os.path.join(HERE, "supervise-connector.py")
LAUNCHER = os.path.join(HERE, "start-detached.py")
HOST, PORT = "127.0.0.1", 18301
HEALTH_URL = "http://%s:%d/health" % (HOST, PORT)
POLL_SECS = 10
HEARTBEAT_SECS = 600  # log a heartbeat line every 10 min (liveness proof)


def dlog(msg):
    # UTC to match supervisor.log (2026-10-04 fix): correlating the two
    # logs for timeline reconstruction requires a single timezone. The old
    # naive datetime.now() logged cell-local time (MDT), mixing zones.
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    line = "[death-watch %s UTC] %s\n" % (ts, msg)
    try:
        with open(DW_LOG, "a") as f:
            f.write(line)
    except OSError:
        sys.stderr.write(line)


def supervisor_pids():
    """PIDs running supervise-connector.py. [s] trick: the pattern never
    matches our own pgrep invocation. Observation only, never signals."""
    try:
        p = subprocess.run(
            ["pgrep", "-f", "[s]upervise-connector.py"],
            capture_output=True, text=True, timeout=10)
        return [int(x) for x in p.stdout.strip().split() if x.strip().isdigit()]
    except Exception:
        return []


def child_pid():
    """PID from connector.pid, verified to be our connector.py with the
    connector cwd. Returns 0 if missing, stale, or not ours."""
    try:
        with open(CHILD_PID_FILE) as f:
            pid = int(f.read().strip().split()[0])
    except (OSError, ValueError):
        return 0
    if pid <= 1:
        return 0
    try:
        with open("/proc/%d/cmdline" % pid, "rb") as f:
            parts = f.read().decode("utf-8", "replace").split("\x00")
        if len(parts) < 2 or not parts[1].endswith("/connector.py"):
            return 0
        cwd = os.readlink("/proc/%d/cwd" % pid)
        if os.path.abspath(cwd) != HERE:
            return 0
        return pid
    except OSError:
        return 0


def port_serving():
    """True if 127.0.0.1:18301 answers HTTP /health."""
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=3) as r:
            d = json.loads(r.read().decode(errors="replace"))
            return bool(d.get("ok"))
    except Exception:
        return False


def launch_supervisor():
    """Run start-detached.py (refuses if the port is bound). Returns True
    if /health reports ok afterwards."""
    try:
        r = subprocess.run(
            [sys.executable, LAUNCHER, "--wait", "10"],
            cwd=HERE, stdin=subprocess.DEVNULL,
            capture_output=True, text=True, timeout=60)
        dlog("launcher rc=%d: %s" % (r.returncode,
                                     (r.stdout or "")[-200:].replace("\n", " | ")))
        return r.returncode == 0 and port_serving()
    except Exception as e:
        dlog("launcher failed: %r" % e)
        return False


def main():
    # Claim the pidfile (single instance; a stale pid is replaced).
    try:
        with open(DW_PID, "w") as f:
            f.write(str(os.getpid()))
    except OSError:
        pass
    dlog("death-watch started pid=%d (poll %ds)" % (os.getpid(), POLL_SECS))
    last_sup = None      # last observed supervisor pid set (frozenset)
    last_child = None    # last observed child pid (int, 0 = none)
    last_beat = 0.0
    while True:
        try:
            sup = frozenset(supervisor_pids())
            child = child_pid()
            serving = port_serving()
            now = time.time()

            if sup != last_sup:
                if sup and not last_sup:
                    dlog("supervisor now alive: pid=%s" %
                         ",".join(map(str, sorted(sup))))
                elif not sup and last_sup:
                    dlog("supervisor DIED: was pid=%s (port serving=%s)" %
                         (",".join(map(str, sorted(last_sup))), serving))
                else:
                    dlog("supervisor set changed: %s -> %s" %
                         (sorted(last_sup or []), sorted(sup)))
                last_sup = sup

            if child != last_child:
                if child and not last_child:
                    dlog("child now alive: pid=%d" % child)
                elif not child and last_child:
                    dlog("child DIED: was pid=%d (supervisor=%s port serving=%s)"
                         % (last_child,
                            ",".join(map(str, sorted(sup))) if sup else "none",
                            serving))
                else:
                    dlog("child pid changed: %s -> %s" % (last_child, child))
                last_child = child

            # Heal the supervisor layer only: no supervisor + port not
            # serving = nobody home. If the port IS serving, someone else
            # owns the slot -- do not touch.
            if not sup and not serving:
                dlog("no supervisor and port not serving -- launching")
                if launch_supervisor():
                    dlog("supervisor relaunched, /health ok")
                else:
                    dlog("relaunch did not yield /health ok; will retry")

            if now - last_beat >= HEARTBEAT_SECS:
                dlog("heartbeat: supervisor=%s child=%s port_serving=%s" %
                     (",".join(map(str, sorted(sup))) if sup else "none",
                      child if child else "none", serving))
                last_beat = now
        except Exception as e:  # never die on a poll error
            dlog("poll error (surviving): %r" % e)
        time.sleep(POLL_SECS)


if __name__ == "__main__":
    sys.exit(main())

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
  - an exclusive PID-file lock (supervisor.pid): only one supervisor runs.
    A redundant starter exits IMMEDIATELY on lock failure, before touching
    the port (2026-10-03: two supervisors fought for 60s, murdering healthy
    children at 16s via reclaim before bowing out).
  - before every (re)spawn, the supervisor probes 127.0.0.1:18301. If the
    port is bound AND serving (connect probe succeeds), it logs and exits --
    someone else owns the slot.
  - if the port is bound but NOT serving, the holder is wedged (holds the
    bind, refuses connects -- observed 2026-10-03: backlog full, EADDRINUSE
    death spiral). reclaim_port() kills it with exact-PID discipline
    (verified connector.py + connector cwd) before respawning. A holder
    that is not our connector is never touched.
  - STARTUP_GRACE (60s): a holder younger than 60s is never reclaimed --
    healthy children need 30-60s to establish lanes (2026-10-03: the
    detector murdered slow-starting children 2754/4351/5000 at 16s).
  - reclaim kills are tracked: the death handler logs "reclaimed as wedged
    holder (our own SIGTERM)", never "external killer", for PIDs we killed
    ourselves (2026-10-03: the mislabel sent the killer-hunt down a phantom
    trail).
All timestamps are UTC (2026-10-03: the log mixed UTC and MDT from different
supervisor instances, making timeline reconstruction error-prone).
  - start-detached.py refuses to launch when the port is bound.
  - SIGTERM to the supervisor is honored promptly: it stops the child
    (if still ours) and exits without respawning. The deploy path
    (deploy-yote-connector / stop_connector_exact) SIGTERMs supervisor +
    child, so deploys never race a respawn.

MUTUAL WATCH (2026-10-01, extended 2026-10-03): every 10 minutes the
supervisor best-effort runs `watchdog-scheduler ensure` (idempotent) and
ensures the independent death-watcher (death-watch.py) is running. The
death-watcher is a separate process that logs supervisor deaths to an
append-only log (the supervisor cannot log its own SIGTERM) and relaunches
a missing supervisor within 10s. The scheduler's progress-watchdog is the
third layer: its restart_local_connector() ensures a SUPERVISOR is running
via the guarded launcher -- it NEVER pkills (pkill -f '[c]onnector.py'
matches the supervisor too, causing silent co-death; fixed 2026-10-03).
Each side keeps another alive; no layer watches itself.

HARDENING (2026-10-04, pattern-borrowed from k8s/Erlang/supervisord):
  - Wedge watchdog watches THREE signals, not one: HTTP reachability,
    /health latency (>10s), and child thread count (>120; healthy=19,
    wedged=217 observed). k8s liveness pattern: failureThreshold=3
    consecutive bad 30s ticks on any signal -> exact-PID SIGTERM +
    respawn. The 2026-10-03 wedge answered /health while piling threads
    and 120s+ exec latency; reachability alone could not see it.
  - Kill attribution is time-bounded (600s TTL): Linux recycles PIDs, so
    a bare PID set could misattribute an unrelated later death. Only a
    death inside the TTL of our own kill is logged as self-inflicted.
  - Crash budget: consecutive deaths inside STARTUP_GRACE count toward a
    budget (5 in 10min, Erlang/OTP intensity-in-period). Past it, the
    backoff cap extends 60s -> 300s and the log says so loudly, instead
    of hot-churning a child that cannot start (supervisord startsecs
    gate: a child surviving past grace resets the budget).
  - STARTUP_GRACE=60s kept: k8s production values for slow starters
    (JVM-class) are 30-120s initial delay; the connector needs 30-60s
    to establish WS/HTTPS lanes.

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
SUP_PIDFILE = os.path.join(HERE, "supervisor.pid")
STARTUP_GRACE = 60  # seconds: never reclaim a holder younger than this
                    # (2026-10-03: healthy children need 30-60s to establish
                    # lanes; the wedge detector was murdering them at 16s)
SERVING_MISS_LIMIT = 3  # consecutive 30s wedge-signal checks before the
                        # watchdog SIGTERMs a wedged child (90s). k8s
                        # liveness pattern: failureThreshold=3.
WEDGE_THREAD_LIMIT = 120  # child threads above this count as a wedge signal.
                          # Healthy child measured at 19 threads (2026-10-04);
                          # wedged child observed at 217 (2026-10-03).
                          # 120 ~= 6x healthy baseline, ~55% of observed wedge.
WEDGE_LATENCY_LIMIT = 10.0  # seconds: /health slower than this is a wedge
                            # signal even when it answers (2026-10-03: exec
                            # calls took 120s+ while /health still responded).
CRASH_BUDGET = 5       # max consecutive deaths inside STARTUP_GRACE...
CRASH_WINDOW = 600     # ...within this window (Erlang/OTP "intensity in
                       # period"; hawserw crash budget). Past the budget the
                       # backoff cap extends -- the loop is real, stop
                       # hot-churning and make it visible.
CRASH_BACKOFF_MAX = 300  # extended backoff cap once the crash budget blows
KILL_ATTRIBUTION_TTL = 600  # seconds: a self-kill record expires after this.
                            # Linux recycles PIDs; attributing a death to our
                            # own kill must be time-bounded or an unrelated
                            # process inheriting the PID gets mislabeled.

SIGNAMES = {9: "SIGKILL", 15: "SIGTERM", 1: "SIGHUP", 2: "SIGINT"}

_shutdown = False
# PIDs this supervisor SIGTERMed itself (reclaim_port or the wedge
# watchdog), mapped to the kill epoch. The death handler consults this
# before labeling a death "external killer" -- a self-inflicted kill is
# not an outside actor. (2026-10-03 fix: the log was full of "external
# killer" lines that were actually our own reclaim, sending the hunt down
# a phantom trail.)
# PID-REUSE GUARD (2026-10-04): a bare PID set misattributes -- Linux
# recycles PIDs, so an unrelated process could inherit a PID we killed
# long ago; if IT is then SIGTERMed externally we would wrongly claim the
# kill. Records expire after KILL_ATTRIBUTION_TTL; only a death inside the
# TTL of our kill is attributed to us.
_self_killed = {}  # pid -> kill epoch (time.time())


def _record_self_kill(pid):
    """Record that WE killed pid (exact-PID SIGTERM/SIGKILL)."""
    now = time.time()
    _self_killed[pid] = now
    cutoff = now - KILL_ATTRIBUTION_TTL
    for p in [p for p, t in _self_killed.items() if t < cutoff]:
        del _self_killed[p]


def _was_self_killed(pid):
    """True if we killed pid within KILL_ATTRIBUTION_TTL. Consumes the
    record (a PID is only ever attributed once)."""
    t = _self_killed.pop(pid, None)
    return t is not None and (time.time() - t) <= KILL_ATTRIBUTION_TTL


def slog(msg):
    # UTC always (2026-10-03 fix): the log previously mixed UTC and MDT
    # (different supervisor instances had different TZ), making timeline
    # reconstruction error-prone. All timestamps are now UTC.
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    line = "[supervisor %s UTC] %s\n" % (ts, msg)
    try:
        with open(SUP_LOG, "a") as f:
            f.write(line)
    except OSError:
        sys.stderr.write(line)  # file unwritable: stderr only


def _on_sigterm(signum, frame):
    global _shutdown
    _shutdown = True


def port_serving():
    """True if the holder on HOST:PORT actually serves HTTP.

    HTTP-based, not just TCP: a TCP connect succeeds from the kernel
    backlog even when the Python process is hung and never accept()s
    (observed 2026-10-03: TCP ok, HTTP /health timeout, EADDRINUSE death
    spiral). A holder that accepts TCP but doesn't answer HTTP is wedged
    and must be reclaimed.
    """
    import http.client
    try:
        conn = http.client.HTTPConnection(HOST, PORT, timeout=3)
        conn.request("GET", "/livez")
        resp = conn.getresponse()
        # Any HTTP response (even 404/500) proves the process is alive
        # and accept()ing. Timeout/exception means wedged.
        return 100 <= resp.status < 600
    except Exception:
        return False


def port_serving_timed():
    """(serving, latency_seconds): timed version of port_serving().

    Probes /livez (cheap liveness: process-local state only), NOT /health.
    /health runs a real authenticated yote exec through the WS lane; under
    lane degradation or yote load it takes seconds and returns 503, which
    this 3s-timeout probe reads as "not-serving" and SIGTERMs a healthy
    child (2026-10-05 flapping: ~15 false-positive wedge kills in 2h).
    Liveness (/livez) answers in ms; a wedged process is still caught by
    the thread-count signal (/proc) and by /livez itself going slow.
    The wedge watchdog treats slow answers as a wedge signal, not health.
    """
    import http.client
    start = time.monotonic()
    try:
        conn = http.client.HTTPConnection(HOST, PORT, timeout=3)
        conn.request("GET", "/livez")
        resp = conn.getresponse()
        ok = 100 <= resp.status < 600
    except Exception:
        ok = False
    return ok, time.monotonic() - start


def _thread_count(pid):
    """Live thread count of pid via /proc/pid/task. 0 if unreadable."""
    try:
        return len(os.listdir("/proc/%d/task" % pid))
    except OSError:
        return 0


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


def acquire_supervisor_lock():
    """Ensure only one supervisor runs. Uses an exclusive PID file lock.

    Returns True if we hold the lock (proceed). Returns False if another
    supervisor is alive (caller must exit IMMEDIATELY without touching the
    port -- 2026-10-03: redundant starters were murdering healthy children
    via reclaim_port() before bowing out).

    Stale PID files (PID not alive, or PID is not supervise-connector.py)
    are replaced.
    """
    import fcntl
    try:
        fh = open(SUP_PIDFILE, "a+")
    except OSError:
        return True  # can't write pidfile; proceed (best effort)
    try:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        # Another process holds the lock -- is it alive and ours?
        try:
            fh.seek(0)
            other_pid = int(fh.read().strip().split()[0])
        except (ValueError, OSError):
            other_pid = 0
        if other_pid > 1:
            try:
                with open("/proc/%d/cmdline" % other_pid, "rb") as f:
                    cmdline = f.read().decode("utf-8", "replace")
                if "supervise-connector.py" in cmdline:
                    # Live supervisor holds the slot -- bow out NOW.
                    return False
            except OSError:
                pass  # PID gone; stale lock, fall through to take it
        # Stale lock: try blocking acquire (holder is dead).
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        except OSError:
            return False
    # We hold the lock: write our PID.
    try:
        fh.seek(0)
        fh.truncate()
        fh.write(str(os.getpid()))
        fh.flush()
    except OSError:
        pass
    # Keep fh open for the process lifetime (lock released on exit).
    global _lock_fh
    _lock_fh = fh
    return True


_lock_fh = None


def _proc_start_age(pid):
    """Seconds since PID started, via /proc/pid/stat starttime. Returns
    None if the PID is gone or unreadable."""
    try:
        with open("/proc/%d/stat" % pid) as f:
            parts = f.read().rsplit(")", 1)[1].split()
        starttime_ticks = int(parts[19])  # field 22, 0-indexed after comm
        with open("/proc/stat") as f:
            for line in f:
                if line.startswith("btime "):
                    btime = int(line.split()[1])
                    break
            else:
                return None
        clk_tck = os.sysconf(os.sysconf_names["SC_CLK_TCK"])
        start_epoch = btime + starttime_ticks / clk_tck
        return time.time() - start_epoch
    except (OSError, ValueError, IndexError):
        return None


def reclaim_port():
    """Kill a wedged holder of our port. Returns True when the port is free.

    Wedge shape (observed 2026-10-03): child holds the 18301 bind but stops
    accept()ing -- backlog fills, connects get refused, supervisor's
    connect probe says "not serving", respawn hits EADDRINUSE, child gives
    up after retries: death spiral. Reclaim breaks it: SIGTERM the verified
    holder, SIGKILL if it ignores TERM, then the port is free to bind.
    A holder that fails the exact-PID check is never signaled.

    2026-10-03 fixes:
    - STARTUP_GRACE: a holder younger than 60s is never reclaimed (healthy
      children need 30-60s to establish lanes; we were murdering them at 16s).
    - Every SIGTERMed PID is recorded via _record_self_kill() so the death
      handler does not mislabel our own reclaim as "external killer".
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
        # STARTUP_GRACE: never murder a young holder. A healthy child needs
        # 30-60s to bind, initialize, and start serving; the wedge probe
        # ("bound but not serving") fires during that window. Killing here
        # created the 2026-10-03 16s murder loop (2754/4351/5000).
        age = _proc_start_age(pid)
        if age is not None and age < STARTUP_GRACE:
            slog("holder pid=%d is only %.0fs old (< %ds grace) -- not "
                 "wedged, still starting; backing off" % (pid, age,
                                                          STARTUP_GRACE))
            return False
        slog("wedged holder pid=%d owns port %d but is not serving -- "
             "SIGTERM" % (pid, PORT))
        _record_self_kill(pid)
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


def ensure_death_watch():
    """Best-effort mutual watch: keep the independent death-watcher alive.

    The death-watcher is the process that records supervisor deaths (the
    supervisor cannot log its own SIGTERM). If it is gone, relaunch it
    detached. Never raises; never blocks the respawn loop for long.
    """
    try:
        p = subprocess.run(["pgrep", "-f", "[d]eath-watch.py"],
                           capture_output=True, text=True, timeout=10)
        if p.stdout.strip():
            return  # already running
        dw = os.path.join(HERE, "death-watch.py")
        if not (os.path.isfile(dw) and os.access(dw, os.X_OK)):
            return
        slog("death-watcher not running -- relaunching")
        subprocess.Popen(
            [sys.executable, dw],
            cwd=HERE,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            close_fds=True,
        )
    except Exception as e:  # noqa: BLE001 - best-effort only
        slog("death-watch ensure failed (best-effort): %r" % e)


def spawn_child():
    env = dict(os.environ)  # child inherits YOTE_CONNECTOR_PORT etc.
    return subprocess.Popen(
        [sys.executable, CHILD],
        cwd=HERE,
        env=env,
        stdin=subprocess.DEVNULL,
        start_new_session=True,  # child in its own session; we only wait()
    )


def wait_with_watch(proc, last_ensure, spawn_time):
    """Wait for the child; run the mutual-watch tick every ENSURE_INTERVAL.

    Also runs a serving watchdog: if the child is alive but the port stops
    serving HTTP for SERVING_MISS_LIMIT consecutive 30s checks (after the
    STARTUP_GRACE), the child is wedged -- SIGTERM it and return the
    special rc -99 so the caller respawns (2026-10-03: child 5711 was bound
    but not accepting TCP for 8+ minutes with no reclaim firing; the wedge
    detector was startup-only).

    Returns (returncode_or_None, last_ensure). rc None means we were asked
    to shut down (SIGTERM) while the child was still alive. rc -99 means
    the serving watchdog fired.
    """
    miss_count = 0
    while True:
        if _shutdown:
            return None, last_ensure
        try:
            rc = proc.wait(timeout=30)
            return rc, last_ensure
        except subprocess.TimeoutExpired:
            pass
        now = time.time()
        # Wedge watchdog (skip during startup grace). k8s liveness pattern:
        # failureThreshold=SERVING_MISS_LIMIT consecutive bad ticks, any
        # signal tripping counts (2026-10-04: the old check only looked at
        # HTTP reachability; the 2026-10-03 wedge answered /health while
        # piling 217 threads and 120s+ exec latency).
        if now - spawn_time >= STARTUP_GRACE:
            serving, latency = port_serving_timed()
            threads = _thread_count(proc.pid)
            bad = []
            if not serving:
                bad.append("not-serving")
            elif latency > WEDGE_LATENCY_LIMIT:
                bad.append("health-latency=%.1fs" % latency)
            if threads > WEDGE_THREAD_LIMIT:
                bad.append("threads=%d" % threads)
            if not bad:
                if miss_count:
                    slog("child pid=%d wedge signals cleared after %d bad "
                         "checks (latency=%.2fs threads=%d)"
                         % (proc.pid, miss_count, latency, threads))
                miss_count = 0
            else:
                miss_count += 1
                slog("child pid=%d wedge signals (%d/%d): %s"
                     % (proc.pid, miss_count, SERVING_MISS_LIMIT,
                        ", ".join(bad)))
                if miss_count >= SERVING_MISS_LIMIT:
                    slog("child pid=%d WEDGED (%s for %ds) -- SIGTERM for "
                         "respawn" % (proc.pid, ", ".join(bad),
                                      miss_count * 30))
                    _record_self_kill(proc.pid)
                    try:
                        proc.terminate()
                        try:
                            proc.wait(timeout=8)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                    except Exception:
                        pass
                    return -99, last_ensure
        if now - last_ensure >= ENSURE_INTERVAL:
            ensure_scheduler()
            ensure_death_watch()
            last_ensure = now


def main():
    signal.signal(signal.SIGTERM, _on_sigterm)
    # Single-supervisor lock FIRST, before touching the port. A redundant
    # starter must bow out here -- not after it has already murdered a
    # healthy child via reclaim_port() (2026-10-03 split-brain: two
    # supervisors, one UTC one MDT, fought over the port for 60s).
    if not acquire_supervisor_lock():
        # Use stderr, not the shared log: we are not the supervisor.
        sys.stderr.write("supervise-connector: another supervisor holds the "
                         "lock -- exiting without touching the port\n")
        return 0
    slog("supervisor starting pid=%d (lock acquired)" % os.getpid())
    backoff = BACKOFF_START
    last_ensure = 0.0
    first = True
    startup_deaths = 0       # consecutive deaths inside STARTUP_GRACE
    crash_window_start = time.time()
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
            ensure_death_watch()
            last_ensure = time.time()
            first = False
        rc, last_ensure = wait_with_watch(proc, last_ensure, started)
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
        if rc == -99:
            # Wedge watchdog fired: child was alive but tripped wedge
            # signals (not serving / slow / thread pileup). Already
            # SIGTERMed above with exact-PID discipline; the kill record
            # is consumed here so it cannot misattribute a later death.
            # Treat as abnormal death for backoff.
            _self_killed.pop(proc.pid, None)
            slog("child pid=%d wedged (watchdog) -- respawning (lived %.0fs)"
                 % (proc.pid, lived))
        elif rc < 0:
            signum = -rc
            if _was_self_killed(proc.pid):
                # We killed this PID ourselves (reclaim_port or the wedge
                # watchdog). Not an outside actor -- do not cry
                # "external killer".
                slog("child pid=%d killed by our own %s (reclaim/wedge "
                     "watchdog), not an external kill"
                     % (proc.pid, SIGNAMES.get(signum,
                                               "signal %d" % signum)))
            else:
                slog("child pid=%d KILLED by signal %d (%s) -- external killer, "
                     "not an internal crash" % (proc.pid, signum,
                                                SIGNAMES.get(signum, "?")))
        else:
            slog("child pid=%d exited with status %d" % (proc.pid, rc))
        if rc == 0:
            slog("child exited cleanly (status 0) -- intentional stop, "
                 "not respawning")
            return 0
        # Crash budget (Erlang/OTP "intensity in period"; hawserw crash
        # budget): consecutive deaths inside STARTUP_GRACE mean the child
        # cannot start at all -- a real bug, not a flake. Count them; past
        # the budget, extend the backoff cap and say so loudly instead of
        # hot-churning the respawn loop. A child that survives past grace
        # resets the budget (supervisord startsecs gate).
        now = time.time()
        if lived < STARTUP_GRACE:
            if now - crash_window_start > CRASH_WINDOW:
                startup_deaths = 0
                crash_window_start = now
            startup_deaths += 1
        else:
            startup_deaths = 0
            crash_window_start = now
        # Abnormal death: respawn with backoff.
        cap = CRASH_BACKOFF_MAX if startup_deaths >= CRASH_BUDGET else BACKOFF_MAX
        if startup_deaths >= CRASH_BUDGET:
            slog("CRASH BUDGET EXCEEDED: %d consecutive startup deaths "
                 "within %ds -- extended backoff, needs human eyes"
                 % (startup_deaths, CRASH_WINDOW))
        if lived >= BACKOFF_RESET_AFTER:
            backoff = BACKOFF_START
        else:
            backoff = min(backoff * 2, cap)
        slog("respawning child in %ds (lived %.0fs)" % (backoff, lived))
        deadline = time.time() + backoff
        while time.time() < deadline:
            if _shutdown:
                slog("received SIGTERM during backoff -- exiting")
                return 0
            time.sleep(0.5)


if __name__ == "__main__":
    sys.exit(main())

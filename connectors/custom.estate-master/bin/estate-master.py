#!/usr/bin/env python3
"""estate-master: one CLI for the six estate routes.

Routes:
  yote       cell -> yote bridge (yote-conn exec, hostname-gated)
  thresher   thresher management API :25127 on yote (secretsmith SSOT key)
  squawk     fleet read/post (cell squawk CLI)
  gatehouse  MCP tool discovery (cell gatehouse CLI)
  oracle     intake posting (yote oracle market)
  pitchfork  service status (yote pitchfork list)

Hard rules:
  - Never print, log, or persist credential values. The thresher key is
    fetched on yote by the yote-side helper and never crosses to the cell.
  - Never mint/rotate credentials, never --reset, never touch hatch
    client safeguards, never bypass stop/pause/audit.
  - Hostname gate: refuse to run yote-side work unless hostname is
    awrawr-pc. A flap failure is retried (bridge flaps are transient);
    three consecutive failures is reported as a flap, not a verdict.

Usage:
  estate-master.py yote <cmd...>
  estate-master.py thresher-status
  estate-master.py thresher-servers [--errors-only]
  estate-master.py squawk-read [--n N] [--channel CH]
  estate-master.py squawk-send <channel> <text>
  estate-master.py gatehouse-status
  estate-master.py gatehouse-tools <query>
  estate-master.py oracle-intake --from NAME --text TEXT
  estate-master.py pitchfork [--filter SUBSTR]
"""

import json
import os
import subprocess
import sys

CELL_BIN = os.path.expanduser("~/workspace/bin")
YOTE_CONN = os.path.join(CELL_BIN, "yote-conn")
SQUAWK = os.path.join(CELL_BIN, "squawk")
GATEHOUSE = os.path.join(CELL_BIN, "gatehouse")
EXPECTED_HOST = "awrawr-pc"
MAX_YOTE_ATTEMPTS = 3


def run(argv, check=False):
    return subprocess.run(argv, capture_output=True, text=True, timeout=120)


def yote_exec(cmd):
    """Run cmd on yote with hostname gate + flap retry.

    Single round-trip per attempt: the exec prints HOST:<hostname> first,
    then runs the command. The gate refuses unless the host is awrawr-pc
    (a flap fallback would serve a different host or fail outright).
    Returns (ok, stdout-without-gate-line, detail).
    """
    last_err = ""
    for attempt in range(1, MAX_YOTE_ATTEMPTS + 1):
        gated = "echo \"HOST:$(hostname)\"; %s" % cmd
        r = run([YOTE_CONN, "exec", gated])
        out = r.stdout or ""
        lines = out.splitlines()
        host = None
        if lines and lines[0].startswith("HOST:"):
            host = lines[0][5:].strip()
            body = "\n".join(lines[1:])
            if body:
                body += "\n"
        else:
            body = out
        if host != EXPECTED_HOST:
            last_err = "hostname gate: got %r, want %r (attempt %d)" % (
                host, EXPECTED_HOST, attempt)
            continue
        if r.returncode != 0:
            last_err = "yote exec rc=%d: %s (attempt %d)" % (
                r.returncode, (body or r.stderr or "").strip()[:200], attempt)
            continue
        return True, body, ""
    return False, "", last_err or "bridge flap: %d attempts failed" % MAX_YOTE_ATTEMPTS


def cmd_yote(args):
    if not args:
        print("usage: estate-master.py yote <cmd...>", file=sys.stderr)
        return 2
    ok, out, err = yote_exec(" ".join(args))
    if not ok:
        print("YOTE FAIL: %s" % err, file=sys.stderr)
        return 1
    print(out, end="")
    return 0


def cmd_thresher_status(args):
    # Yote-side helper does the authed call; only counts cross to the cell.
    ok, out, err = yote_exec("estate-thresher-status")
    if not ok:
        print("THRESHER FAIL: %s" % err, file=sys.stderr)
        return 1
    print(out, end="")
    return 0


def cmd_thresher_servers(args):
    flag = "--errors-only" if "--errors-only" in args else ""
    ok, out, err = yote_exec("estate-thresher-status %s" % flag)
    if not ok:
        print("THRESHER FAIL: %s" % err, file=sys.stderr)
        return 1
    print(out, end="")
    return 0


def cmd_squawk_read(args):
    n = "10"
    channel = "fleet"
    i = 0
    while i < len(args):
        if args[i] == "--n" and i + 1 < len(args):
            n = args[i + 1]
            i += 2
        elif args[i] == "--channel" and i + 1 < len(args):
            channel = args[i + 1]
            i += 2
        else:
            i += 1
    r = run([SQUAWK, "read", channel, "--n", n])
    print(r.stdout, end="")
    if r.stderr:
        print(r.stderr, end="", file=sys.stderr)
    return r.returncode


def cmd_squawk_send(args):
    if len(args) < 2:
        print("usage: estate-master.py squawk-send <channel> <text>",
              file=sys.stderr)
        return 2
    r = run([SQUAWK, "send", args[0], " ".join(args[1:])])
    print(r.stdout, end="")
    if r.stderr:
        print(r.stderr, end="", file=sys.stderr)
    return r.returncode


def cmd_gatehouse_status(args):
    r = run([GATEHOUSE, "status"])
    print(r.stdout, end="")
    if r.stderr:
        print(r.stderr, end="", file=sys.stderr)
    return r.returncode


def cmd_gatehouse_tools(args):
    if not args:
        print("usage: estate-master.py gatehouse-tools <query>", file=sys.stderr)
        return 2
    r = run([GATEHOUSE, "tools", " ".join(args)])
    print(r.stdout, end="")
    if r.stderr:
        print(r.stderr, end="", file=sys.stderr)
    return r.returncode


def cmd_oracle_intake(args):
    frm = None
    text = None
    i = 0
    while i < len(args):
        if args[i] == "--from" and i + 1 < len(args):
            frm = args[i + 1]
            i += 2
        elif args[i] == "--text" and i + 1 < len(args):
            text = args[i + 1]
            i += 2
        else:
            i += 1
    if not frm or not text:
        print("usage: estate-master.py oracle-intake --from NAME --text TEXT",
              file=sys.stderr)
        return 2
    import shlex
    inner = ("cd /home/toxic/estate/ranch/squawk/oracle && "
             "ORACLE_INTAKE=1 python3 bin/post_intake.py --from %s --text %s"
             % (shlex.quote(frm), shlex.quote(text)))
    ok, out, err = yote_exec(inner)
    if not ok:
        print("ORACLE FAIL: %s" % err, file=sys.stderr)
        return 1
    print(out, end="")
    return 0


def cmd_pitchfork(args):
    filt = None
    i = 0
    while i < len(args):
        if args[i] == "--filter" and i + 1 < len(args):
            filt = args[i + 1]
            i += 2
        else:
            i += 1
    ok, out, err = yote_exec("pitchfork list")
    if not ok:
        print("PITCHFORK FAIL: %s" % err, file=sys.stderr)
        return 1
    for line in out.splitlines():
        if filt is None or filt in line:
            print(line)
    return 0


COMMANDS = {
    "yote": cmd_yote,
    "thresher-status": cmd_thresher_status,
    "thresher-servers": cmd_thresher_servers,
    "squawk-read": cmd_squawk_read,
    "squawk-send": cmd_squawk_send,
    "gatehouse-status": cmd_gatehouse_status,
    "gatehouse-tools": cmd_gatehouse_tools,
    "oracle-intake": cmd_oracle_intake,
    "pitchfork": cmd_pitchfork,
}


def main(argv):
    if len(argv) < 2 or argv[1] not in COMMANDS:
        print(__doc__, file=sys.stderr)
        print("commands: %s" % " ".join(sorted(COMMANDS)), file=sys.stderr)
        return 2
    return COMMANDS[argv[1]](argv[2:])


if __name__ == "__main__":
    sys.exit(main(sys.argv))

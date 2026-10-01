#!/usr/bin/env python3
"""UserPromptSubmit hook: peek this agent's agent-chat inbox for unread messages.

Non-blocking Claude Code hook. Prints the plain-text unread notice. Stays quiet
when unconfigured (no identity warning): an unconfigured prompt hook must never
obstruct the session. Always exits 0. Python stdlib only.
"""

from __future__ import annotations

import sys

import session_inbox


def main() -> None:
    notice = session_inbox.collect_notice(quiet_no_identity=True)
    if notice:
        print(notice)


if __name__ == "__main__":
    try:
        main()
    except (Exception, SystemExit):
        pass
    sys.exit(0)

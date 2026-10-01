#!/usr/bin/env python3
"""Stop hook: peek this agent's agent-chat inbox for unread messages.

Non-blocking Claude Code hook. Emits the unread notice as JSON using Claude's
visible `systemMessage` field so the warning surfaces in the transcript.
Stays quiet when unconfigured (no identity warning): an unconfigured stop hook
must never obstruct the session. Always exits 0. Python stdlib only.
"""

from __future__ import annotations

import json
import sys

import session_inbox


def main() -> None:
    notice = session_inbox.collect_notice(quiet_no_identity=True)
    if notice:
        print(json.dumps({"systemMessage": notice}))


if __name__ == "__main__":
    try:
        main()
    except (Exception, SystemExit):
        pass
    sys.exit(0)

#!/usr/bin/env python3
"""Unit test for _cap_out in awrawr_mcp.py — extracts the helper via AST
(no server boot, no imports of the module) and checks:
 1. under-cap output passes through untouched
 2. empty output renders the (no output) marker
 3. over-cap output is truncated in-band AND persisted byte-exact
Run: python3 test_capout.py <path-to-awrawr_mcp.py>
"""
import ast
import os
import sys
import tempfile
import time

src = open(sys.argv[1]).read()
tree = ast.parse(src)
helper = None
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name == "_cap_out":
        helper = ast.get_source_segment(src, node)
assert helper, "_cap_out not found"

ns = {"os": os, "time": time, "_cap_out_counter": [0], "OUT_CAP": 20000}
exec(helper, ns)
cap = ns["_cap_out"]

# 1. under-cap passthrough
assert cap("[exit=0] ", "hello") == "[exit=0] hello"
# 2. empty marker
assert cap("[exit=0] ", "") == "[exit=0] (no output)"
# 3. over-cap persistence, byte-exact
with tempfile.TemporaryDirectory() as d:
    os.environ["AWR_MCP_OUTPUT_DIR"] = d
    big = "x" * 25000 + "TAIL-MARKER"
    out = cap("[exit=0] ", big)
    assert out.startswith("[exit=0] " + "x" * 20000)
    assert "TRUNCATED 25011 chars total, full output saved to " in out
    saved = out.rsplit("saved to ", 1)[1].rstrip("]").strip()
    # note ends with path; strip trailing bracket text if any
    saved = saved.split("\n")[0].strip()
    with open(saved) as f:
        assert f.read() == big, "persisted output is not byte-exact"
    # prune: an 8-day-old file is removed on the next over-cap call
    old = os.path.join(d, "out-old.txt")
    with open(old, "w") as f:
        f.write("old")
    past = time.time() - 8 * 24 * 3600
    os.utime(old, (past, past))
    cap("[exit=0] ", "y" * 21000)
    assert not os.path.exists(old), "7-day prune failed"
print("capout tests: 3/3 PASS (passthrough, empty marker, byte-exact persistence + prune)")

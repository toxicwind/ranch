#!/usr/bin/env python3
"""Roundup preflight tests — the missing test that lets sweeps fail SILENTLY.

The 2026-10-14 herd sweep reported "[sweep] done" while every single benchmark
failed with `guidellm: No such file or directory` because:
  1. the script invoked bare `guidellm` (not on PATH, venv not activated),
  2. run_one failures were logged but never propagated,
  3. the summary counted missing .json files as "completed: 0, failed: 0",
  4. the script exited 0 regardless.

These tests assert the toolchain exists and that a smoke sweep produces at
least one REAL benchmark result. Run:  python3 -m pytest tests/ -v
Live network tests are skipped unless ROUNDUP_LIVE=1.
"""

import json
import os
import shutil
import subprocess
import urllib.request
from pathlib import Path

import pytest

ROUNDUP = Path(__file__).resolve().parent.parent
SWEEPS = ROUNDUP / "sweeps"

GUIDELLM_CANDIDATES = [
    Path.home() / ".venv-guidellm" / "bin" / "guidellm",
    ROUNDUP / "guidellm" / ".venv" / "bin" / "guidellm",
]
HERD = "http://127.0.0.1:25100"
CUTTINGGATE = "http://127.0.0.1:25200"


def _find_guidellm() -> Path | None:
    for p in GUIDELLM_CANDIDATES:
        if p.is_file() and os.access(p, os.X_OK):
            return p
    return shutil.which("guidellm") and Path(shutil.which("guidellm"))


def _alive(url: str, timeout: float = 3.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout):
            return True
    except Exception:
        return False


def test_fork_checkout_present():
    """The vendored guidellm fork must exist (scripts historically pointed at
    roundup/fork and ~/.venv-guidellm — both dead paths)."""
    assert (ROUNDUP / "guidellm" / "pyproject.toml").exists() or (
        ROUNDUP / "guidellm" / "setup.py"
    ).exists(), f"fork missing at {ROUNDUP / 'guidellm'}"


def test_guidellm_binary_resolvable():
    """guidellm must be executable somewhere the sweeps can find it."""
    g = _find_guidellm()
    assert g is not None, (
        "guidellm not resolvable — checked "
        + ", ".join(str(p) for p in GUIDELLM_CANDIDATES)
        + " and PATH. Install: python3 -m venv ~/.venv-guidellm && "
        + "~/.venv-guidellm/bin/pip install -e roundup/guidellm"
    )


def test_herd_sweep_uses_resolvable_guidellm():
    """The sweep script must reference a GUIDELLM variable whose default
    resolves — not a bare `guidellm` PATH call (the silent-failure bug)."""
    src = (SWEEPS / "roundup_herd_sweep.sh").read_text()
    assert "GUIDELLM=" in src, "sweep must define GUIDELLM explicitly"
    assert "guidellm run" not in src.replace("$GUIDELLM", ""), (
        "sweep still calls bare `guidellm` somewhere — that is the bug"
    )


def test_herd_sweep_propagates_failures():
    """Summary must exit non-zero when zero benchmarks were produced."""
    src = (SWEEPS / "roundup_herd_sweep.sh").read_text()
    assert "exit 1" in src.split("# summary")[-1] or (
        "FAILED" in src and "exit 1" in src
    ), "sweep must exit 1 when no real benchmark results were produced"


def test_live_endpoints_or_skip():
    """At least one inference endpoint should be alive in a healthy estate."""
    if not (_alive(f"{HERD}/v1/models") or _alive(f"{CUTTINGGATE}/v1/models")):
        pytest.skip("no inference endpoints live (herd :25100 / cuttinggate :25200)")


@pytest.mark.skipif(os.environ.get("ROUNDUP_LIVE") != "1", reason="live smoke")
def test_live_smoke_sweep_produces_results(tmp_path):
    """Meta-test: run the sweep for real with 1 model, 1 request; fail if the
    sweep reports success but writes zero benchmark jsons."""
    sweep = SWEEPS / "roundup_herd_sweep.sh"
    env = dict(os.environ, PATH=f"{Path.home() / '.venv-guidellm' / 'bin'}:{os.environ['PATH']}")
    r = subprocess.run(
        [str(sweep), "--outdir", str(tmp_path), "--max-models", "1", "--requests", "1", "--timeout", "60"],
        capture_output=True, text=True, timeout=300, env=env,
    )
    assert r.returncode == 0, f"sweep failed: {r.stdout[-500:]} {r.stderr[-500:]}"
    results = [f for f in tmp_path.glob("*.json")]
    assert results, "sweep exited 0 but produced ZERO benchmark json files (the silent-failure bug)"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))

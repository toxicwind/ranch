"""Wait-for-stable capture: a post-action screenshot must not land
mid-animation, and content that never settles must still return."""

from hypruse import screenshot


def _feed(monkeypatch, frames):
    """capture() returns the next frame each call; records call count."""
    calls = {"n": 0}

    def fake_capture(
        window="", region="", scale=0.0, max_bytes=None, max_edge=None, lossless=False
    ):
        # Cycle instead of saturating: a saturated fake returns the
        # same frame forever, which a fast loop (interval=0) misreads
        # as "settled". Cycling keeps never-settling content unsettled.
        i = calls["n"] % len(frames)
        calls["n"] += 1
        return frames[i], {"format": "png", "frame": i}

    monkeypatch.setattr(screenshot, "capture", fake_capture)
    return calls


def test_returns_once_two_frames_match(monkeypatch):
    calls = _feed(monkeypatch, [b"a", b"b", b"b", b"c"])
    data, meta = screenshot.capture_stable(interval=0, timeout=5)
    assert data == b"b"
    assert meta["stable"] is True
    assert calls["n"] == 3  # a, b, b: stopped at the first match


def test_identical_from_the_start_is_two_captures(monkeypatch):
    calls = _feed(monkeypatch, [b"same", b"same"])
    data, meta = screenshot.capture_stable(interval=0, timeout=5)
    assert (data, meta["stable"]) == (b"same", True)
    assert calls["n"] == 2


class _InfiniteFrames:
    """A feed that never repeats: every capture yields a distinct frame,
    so the content genuinely never settles. (A finite list gets exhausted
    on fast hardware — interval=0 burns 1000 frames in <50ms — the clamped
    feed then repeats and the capture correctly reports stable=True.)"""

    def __len__(self):
        return 10**18

    def __getitem__(self, i):
        return str(i).encode()


def test_never_settles_times_out_with_last_frame(monkeypatch):
    frames = _InfiniteFrames()
    calls = _feed(monkeypatch, frames)
    data, meta = screenshot.capture_stable(interval=0, timeout=0.05)
    assert meta["stable"] is False
    assert calls["n"] > 2  # kept capturing until the timeout hit
    assert data == frames[int(meta["frame"])]

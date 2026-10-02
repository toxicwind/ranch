"""Hidden acceptance tests for token-bucket. Debaters never see this file."""
import math, threading, time
import pytest
import token_bucket
from token_bucket import TokenBucket

@pytest.fixture
def fake_clock(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(token_bucket.time, "monotonic", lambda: now[0])
    if hasattr(token_bucket, "monotonic"):
        monkeypatch.setattr(token_bucket, "monotonic", lambda: now[0])
    return now

def test_starts_full_and_consumes(fake_clock):
    b = TokenBucket(10, 1)
    assert b.allow(10) is True
    assert b.allow(1) is False

def test_partial_consume(fake_clock):
    b = TokenBucket(10, 1)
    assert b.allow(4) is True
    assert b.allow(6) is True
    assert b.allow(1) is False

def test_refill_over_time(fake_clock):
    now = fake_clock
    b = TokenBucket(10, 2)          # 2 tokens/sec
    assert b.allow(10) is True
    now[0] += 2.5                   # +5 tokens
    assert b.allow(5) is True
    assert b.allow(1) is False
    now[0] += 100                   # capped at capacity
    assert b.allow(10) is True
    assert b.allow() is False

def test_fractional_tokens(fake_clock):
    now = fake_clock
    b = TokenBucket(5, 0.5)
    assert b.allow(5) is True
    now[0] += 3                     # +1.5 tokens
    assert b.allow(1.5) is True
    assert b.allow(0.1) is False

def test_wait_time(fake_clock):
    now = fake_clock
    b = TokenBucket(10, 2)
    assert b.allow(10) is True
    assert b.wait_time(4) == pytest.approx(2.0)
    assert b.wait_time() == pytest.approx(0.5)
    assert b.wait_time(11) == math.inf
    now[0] += 0.5
    assert b.wait_time() == pytest.approx(0.0)

def test_invalid_args():
    with pytest.raises(ValueError): TokenBucket(0, 1)
    with pytest.raises(ValueError): TokenBucket(10, 0)
    with pytest.raises(ValueError): TokenBucket(-1, -1)
    b = TokenBucket(10, 1)
    with pytest.raises(ValueError): b.allow(0)
    with pytest.raises(ValueError): b.allow(-2)
    with pytest.raises(ValueError): b.wait_time(0)

def test_thread_safety():
    # 50 threads x allow(1) on capacity 10, no refill: exactly 10 must succeed, never more.
    b = TokenBucket(10, 0.0001)
    results = []
    def worker():
        results.append(b.allow(1))
    threads = [threading.Thread(target=worker) for _ in range(50)]
    for t in threads: t.start()
    for t in threads: t.join()
    assert sum(results) == 10, f"over/under-granted: {sum(results)} of 50"

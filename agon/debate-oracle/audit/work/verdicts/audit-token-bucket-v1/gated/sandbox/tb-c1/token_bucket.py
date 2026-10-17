"""Correct: monotonic clock, lock, starts full."""
import math
import threading
import time


class TokenBucket:
    def __init__(self, capacity: float, refill_rate: float):
        if capacity <= 0 or refill_rate <= 0:
            raise ValueError("capacity and refill_rate must be > 0")
        self._cap = float(capacity)
        self._rate = float(refill_rate)
        self._tokens = float(capacity)
        self._ts = time.monotonic()
        self._lock = threading.Lock()

    def _refill(self):
        now = time.monotonic()
        dt = now - self._ts
        if dt > 0:
            self._tokens = min(self._cap, self._tokens + dt * self._rate)
            self._ts = now

    def allow(self, n: float = 1) -> bool:
        if n <= 0:
            raise ValueError("n must be > 0")
        with self._lock:
            self._refill()
            if self._tokens >= n:
                self._tokens -= n
                return True
            return False

    def wait_time(self, n: float = 1) -> float:
        if n <= 0:
            raise ValueError("n must be > 0")
        if n > self._cap:
            return math.inf
        with self._lock:
            self._refill()
            if self._tokens >= n:
                return 0.0
            return (n - self._tokens) / self._rate

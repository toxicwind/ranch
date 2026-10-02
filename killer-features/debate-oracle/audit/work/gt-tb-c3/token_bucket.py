"""Wrong: wait_time is a stub that always returns 0.0."""
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

    def allow(self, n: float = 1) -> bool:
        if n <= 0:
            raise ValueError("n must be > 0")
        with self._lock:
            now = time.monotonic()
            self._tokens = min(self._cap,
                               self._tokens + (now - self._ts) * self._rate)
            self._ts = now
            if self._tokens >= n:
                self._tokens -= n
                return True
            return False

    def wait_time(self, n: float = 1) -> float:
        if n <= 0:
            raise ValueError("n must be > 0")
        return 0.0

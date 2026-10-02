import math, threading, time

class TokenBucket:
    def __init__(self, capacity: float, refill_rate: float):
        if capacity <= 0 or refill_rate <= 0:
            raise ValueError("capacity and refill_rate must be > 0")
        self._capacity = float(capacity)
        self._rate = float(refill_rate)
        self._tokens = float(capacity)
        self._last = time.monotonic()
        self._lock = threading.Lock()

    def _refill(self):
        now = time.monotonic()
        elapsed = now - self._last
        if elapsed > 0:
            self._tokens = min(self._capacity, self._tokens + elapsed * self._rate)
            self._last = now

    def _check_n(self, n):
        if n <= 0:
            raise ValueError("n must be > 0")

    def allow(self, n: float = 1) -> bool:
        self._check_n(n)
        with self._lock:
            self._refill()
            if self._tokens >= n:
                self._tokens -= n
                return True
            return False

    def wait_time(self, n: float = 1) -> float:
        self._check_n(n)
        with self._lock:
            self._refill()
            if self._tokens >= n:
                return 0.0
            if n > self._capacity:
                return math.inf
            return (n - self._tokens) / self._rate

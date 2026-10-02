# Task: token-bucket

Implement a **thread-safe token bucket rate limiter** in a single file named `token_bucket.py`.

## API

```python
class TokenBucket:
    def __init__(self, capacity: float, refill_rate: float): ...
    def allow(self, n: float = 1) -> bool: ...
    def wait_time(self, n: float = 1) -> float: ...
```

## Behavior

- `capacity` is the maximum number of tokens the bucket holds; `refill_rate` is tokens
  added per second. Both must be > 0, otherwise raise `ValueError`.
- The bucket starts **full**.
- `allow(n)`: if at least `n` tokens are currently available, consume `n` tokens and
  return `True`; otherwise consume nothing and return `False`. `n <= 0` raises `ValueError`.
- Tokens refill continuously with wall-clock time: after `t` seconds,
  `min(capacity, tokens + t * refill_rate)` tokens are available. Use `time.monotonic()`.
- `wait_time(n)`: return `0.0` if `n` tokens are available right now; otherwise return
  the number of seconds until `n` tokens will be available: `(n - available) / refill_rate`.
  If `n > capacity` the request can never be satisfied — return `math.inf`.
  `n <= 0` raises `ValueError`.
- Must be safe to call from multiple threads concurrently (no lost updates / over-granting).

Only the Python standard library may be used.

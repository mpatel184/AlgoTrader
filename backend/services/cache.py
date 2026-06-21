"""Tiny thread-safe TTL cache (H5).

The bot scheduler re-fetches market data per bot on every tick. A shared,
time-boxed cache collapses identical fetches (same symbol/interval) across bots
and endpoints within the TTL window, cutting redundant provider calls and
staying under rate limits.

Deliberately minimal — a process-local dict with a lock. Only successful
(non-empty) values should be cached by callers, so transient errors retry.
"""
import threading
import time
from typing import Any, Callable, Optional

_store: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def get(key: str, ttl: float) -> Optional[Any]:
    with _lock:
        entry = _store.get(key)
        if entry and (time.time() - entry[0]) < ttl:
            return entry[1]
    return None


def set(key: str, value: Any) -> None:
    with _lock:
        _store[key] = (time.time(), value)


def get_or_fetch(key: str, ttl: float, fetch: Callable[[], Any],
                 cache_if: Callable[[Any], bool] = bool) -> Any:
    """Return a cached value or compute, cache (when `cache_if` passes), and return it."""
    hit = get(key, ttl)
    if hit is not None:
        return hit
    value = fetch()
    if cache_if(value):
        set(key, value)
    return value


def clear() -> None:
    with _lock:
        _store.clear()

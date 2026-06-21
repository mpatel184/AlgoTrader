"""Tests for the shared TTL cache (H5)."""
import time

from services import cache


def setup_function():
    cache.clear()


def test_get_or_fetch_caches_within_ttl():
    calls = {"n": 0}

    def fetch():
        calls["n"] += 1
        return [1, 2, 3]

    a = cache.get_or_fetch("k", ttl=60, fetch=fetch)
    b = cache.get_or_fetch("k", ttl=60, fetch=fetch)
    assert a == b == [1, 2, 3]
    assert calls["n"] == 1            # second call served from cache


def test_ttl_expiry_refetches():
    calls = {"n": 0}

    def fetch():
        calls["n"] += 1
        return calls["n"]

    assert cache.get_or_fetch("k", ttl=0.05, fetch=fetch) == 1
    time.sleep(0.06)
    assert cache.get_or_fetch("k", ttl=0.05, fetch=fetch) == 2


def test_empty_results_not_cached_by_default():
    calls = {"n": 0}

    def fetch():
        calls["n"] += 1
        return []                     # falsy -> not cached, so errors retry

    cache.get_or_fetch("k", ttl=60, fetch=fetch)
    cache.get_or_fetch("k", ttl=60, fetch=fetch)
    assert calls["n"] == 2


def test_indian_history_uses_cache(monkeypatch):
    """Second call for the same symbol/period/interval must not hit the provider."""
    import services.indian_market as im
    cache.clear()
    calls = {"n": 0}

    import pandas as pd

    class _FakeTicker:
        def __init__(self, sym):
            pass

        def history(self, period, interval):
            calls["n"] += 1
            df = pd.DataFrame({
                "Date": pd.to_datetime(["2024-01-01", "2024-01-02"]),
                "Open": [100.0, 101.0], "High": [102.0, 103.0],
                "Low": [99.0, 100.0], "Close": [101.0, 102.0], "Volume": [1000, 1100],
            })
            return df.set_index("Date")   # indian_market does df.reset_index() -> 'Date' column

    monkeypatch.setattr(im.yf, "Ticker", _FakeTicker)
    first = im.get_historical_data("RELIANCE.NS", "6mo", "1d")
    second = im.get_historical_data("RELIANCE.NS", "6mo", "1d")
    assert first == second and len(first) == 2
    assert calls["n"] == 1            # cached

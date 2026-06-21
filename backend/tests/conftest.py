"""Shared test fixtures.

These tests pin the *current* behavior of the engines (characterization tests)
so that later refactors surface any unintended behavioral change. They use
deterministic synthetic OHLCV data — no network, no real DB — so the golden
values are stable across machines.
"""
import math
import os
import sys

import pytest

# Make `import services...` / `import database` work regardless of cwd.
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _synthetic_candles(n: int = 400, seed: float = 100.0) -> list:
    """Deterministic OHLCV series with trend + cycles + bounded noise.

    No RNG: a mix of sine waves gives reproducible swings that exercise both
    long and short signals across every strategy. Daily-style date strings.
    """
    candles = []
    price = seed
    for i in range(n):
        # Smooth drift up, a slow cycle, and a faster ripple — fully deterministic.
        drift = i * 0.15
        cycle = 12.0 * math.sin(i / 25.0)
        ripple = 3.0 * math.sin(i / 6.0)
        close = seed + drift + cycle + ripple
        open_ = close - ripple * 0.5
        high = max(open_, close) + 1.5 + abs(math.sin(i / 3.0))
        low = min(open_, close) - 1.5 - abs(math.cos(i / 4.0))
        volume = 1_000_000 + int(200_000 * (1 + math.sin(i / 5.0)))
        # ISO date strings, one trading day apart starting 2022-01-01.
        year = 2022 + (i // 250)
        day_of_year = i % 250
        month = 1 + (day_of_year // 21)
        day = 1 + (day_of_year % 21)
        candles.append({
            "time": f"{year}-{month:02d}-{day:02d}",
            "open": round(open_, 2),
            "high": round(high, 2),
            "low": round(low, 2),
            "close": round(close, 2),
            "volume": volume,
        })
        price = close
    return candles


@pytest.fixture(scope="session")
def candles():
    """A 400-bar deterministic candle series (enough for EMA200 warmup)."""
    return _synthetic_candles(400)


@pytest.fixture(scope="session")
def short_candles():
    """A 60-bar series — above the 50-candle backtest minimum, below EMA200 warmup."""
    return _synthetic_candles(60)


@pytest.fixture()
def temp_db(tmp_path, monkeypatch):
    """An isolated, freshly-initialized SQLite DB for tests that hit the ledger.

    Redirects database.get_db() via TRADING_DB_PATH and runs create_tables() so
    the schema + seeded default user/portfolios exist. Yields the db path.
    """
    db_file = tmp_path / "test_trading.db"
    monkeypatch.setenv("TRADING_DB_PATH", str(db_file))
    import database
    database.create_tables()
    return str(db_file)


class _PriceFeed:
    """Controllable stand-in for the live market price (C3). Tests set .value to
    the price the server should fill at, since the server no longer trusts the
    client-sent price."""
    def __init__(self, value: float = 100.0):
        self.value = value

    def set(self, value: float):
        self.value = value


@pytest.fixture()
def price_feed(monkeypatch):
    """Patch the server-side price resolver so order tests are deterministic and
    never hit the network."""
    import services.pricing as pricing
    feed = _PriceFeed()
    monkeypatch.setattr(pricing, "get_live_price", lambda symbol, market: feed.value)
    return feed


@pytest.fixture()
def client(temp_db, monkeypatch):
    """A FastAPI TestClient bound to a fresh temp DB, with AUTH_REQUIRED off
    (preserves the current no-login behavior). Reloads main so startup runs
    against the temp path."""
    import importlib
    from fastapi.testclient import TestClient
    monkeypatch.setenv("AUTH_REQUIRED", "false")
    import main
    importlib.reload(main)
    with TestClient(main.app) as c:
        yield c

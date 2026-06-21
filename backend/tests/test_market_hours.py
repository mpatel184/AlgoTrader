"""Tests for the market-hours gate (H3b)."""
from datetime import datetime, timedelta, timezone

from services.market_hours import IST, is_market_open


def _ist(year, month, day, hour, minute):
    return datetime(year, month, day, hour, minute, tzinfo=IST)


def test_crypto_always_open():
    assert is_market_open("crypto", _ist(2024, 1, 6, 3, 0))   # Saturday 3am
    assert is_market_open("crypto", _ist(2024, 1, 1, 23, 0))


def test_indian_open_during_session_weekday():
    # 2024-01-08 is a Monday; 11:00 IST is mid-session.
    assert is_market_open("indian", _ist(2024, 1, 8, 11, 0))


def test_indian_closed_before_and_after_session():
    assert not is_market_open("indian", _ist(2024, 1, 8, 9, 0))    # before 09:15
    assert not is_market_open("indian", _ist(2024, 1, 8, 16, 0))   # after 15:30


def test_indian_closed_on_weekend():
    assert not is_market_open("indian", _ist(2024, 1, 6, 11, 0))   # Saturday
    assert not is_market_open("indian", _ist(2024, 1, 7, 11, 0))   # Sunday


def test_session_boundaries_inclusive():
    assert is_market_open("indian", _ist(2024, 1, 8, 9, 15))       # open bell
    assert is_market_open("indian", _ist(2024, 1, 8, 15, 30))      # close bell


def test_bot_skips_when_market_closed(temp_db, monkeypatch):
    """With the gate on and the market closed, the bot tick is a no-op."""
    from services import bot_engine
    monkeypatch.setenv("BOT_RESPECT_MARKET_HOURS", "true")
    # Force "closed" regardless of when the test runs.
    monkeypatch.setattr(bot_engine.market_hours, "is_market_open", lambda market: False)

    conn = bot_engine.get_db()
    conn.execute("""INSERT INTO bots (portfolio_id, name, symbol, market, strategy, quantity,
                                      sl_pct, rr_ratio, interval_seconds, status)
                    VALUES (1, 'T', 'RELIANCE.NS', 'indian', 'ema_crossover', 10,
                            0.02, 2.0, 60, 'running')""")
    bot_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    res = bot_engine.run_bot_once(bot_id)
    assert res["status"] == "Market closed"

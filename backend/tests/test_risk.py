"""Tests for the pre-trade risk layer (H3)."""
from datetime import datetime

import pytest

import database
from services import risk


def _buy(client, price_feed, symbol, qty, price=100.0, pid=1):
    price_feed.set(price)
    return client.post("/api/trading/buy", json={
        "portfolio_id": pid, "symbol": symbol, "market": "indian",
        "quantity": qty, "price": price})


def test_order_within_limits_allowed(client, price_feed):
    assert _buy(client, price_feed, "RELIANCE.NS", 10).status_code == 200


def test_concentration_cap_blocks_oversized_order(client, price_feed):
    # Default cap is 25% of equity (500,000) = 125,000; 200,000 notional is over.
    r = _buy(client, price_feed, "RELIANCE.NS", 2000, price=100.0)  # 200,000
    assert r.status_code == 400
    assert "Risk check failed" in r.json()["detail"]


def test_max_open_positions_enforced(client, price_feed, monkeypatch):
    monkeypatch.setenv("RISK_MAX_OPEN_POSITIONS", "2")
    assert _buy(client, price_feed, "RELIANCE.NS", 10).status_code == 200
    assert _buy(client, price_feed, "TCS.NS", 10).status_code == 200
    r = _buy(client, price_feed, "INFY.NS", 10)   # 3rd distinct symbol
    assert r.status_code == 400
    assert "Max open positions" in r.json()["detail"]


def test_adding_to_existing_position_not_blocked_by_count(client, price_feed, monkeypatch):
    monkeypatch.setenv("RISK_MAX_OPEN_POSITIONS", "1")
    assert _buy(client, price_feed, "RELIANCE.NS", 10).status_code == 200
    # Averaging into the SAME symbol doesn't add a position, so it's allowed.
    assert _buy(client, price_feed, "RELIANCE.NS", 5).status_code == 200


def test_daily_loss_kill_switch_blocks_buys(temp_db):
    """A realized loss today beyond the limit halts new entries."""
    conn = database.get_db()
    equity = conn.execute("SELECT current_balance FROM portfolios WHERE id = 1").fetchone()[0]
    # Record a closed SELL with a loss > 5% of equity, dated today.
    today = datetime.now().isoformat()
    conn.execute(
        """INSERT INTO trades (portfolio_id, symbol, market, trade_type, quantity, price,
                               total_value, pnl, status, closed_at)
           VALUES (1, 'X.NS', 'indian', 'SELL', 1, 1, 1, ?, 'closed', ?)""",
        (-0.06 * equity, today))
    conn.commit()

    with pytest.raises(risk.RiskViolation) as exc:
        risk.check_buy(conn, 1, "RELIANCE.NS", 1000)
    assert "Daily loss limit" in exc.value.reason
    conn.close()


def test_disabled_limits_are_noop(temp_db, monkeypatch):
    monkeypatch.setenv("RISK_MAX_POSITION_PCT", "1")     # >= 1 disables concentration
    monkeypatch.setenv("RISK_MAX_OPEN_POSITIONS", "0")   # 0 disables count
    monkeypatch.setenv("RISK_MAX_DAILY_LOSS_PCT", "0")   # 0 disables kill-switch
    conn = database.get_db()
    # A huge notional passes when concentration is disabled.
    risk.check_buy(conn, 1, "RELIANCE.NS", 10_000_000)
    conn.close()

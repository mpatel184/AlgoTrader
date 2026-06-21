"""End-to-end test for the bot execution path through the shared core (H2).

Drives bot_engine.run_bot_once with stubbed market data (no network) to verify
auto-buy and auto-sell mutate the ledger correctly and tag trades source='bot'.
This path was previously untested.
"""
import database


def _make_bot(symbol="RELIANCE.NS", qty=10, sl_pct=0.02, rr=2.0):
    conn = database.get_db()
    c = conn.cursor()
    c.execute("""INSERT INTO bots (portfolio_id, name, symbol, market, strategy, quantity,
                                   sl_pct, rr_ratio, interval_seconds, status)
                 VALUES (1, 'T', ?, 'indian', 'ema_crossover', ?, ?, ?, 60, 'running')""",
              (symbol, qty, sl_pct, rr))
    bot_id = c.lastrowid
    conn.commit()
    conn.close()
    return bot_id


def test_bot_auto_buy_then_take_profit(temp_db, monkeypatch):
    from services import bot_engine

    # Test execution logic independent of wall-clock market hours (H3b).
    monkeypatch.setenv("BOT_RESPECT_MARKET_HOURS", "false")
    bot_id = _make_bot(qty=10)

    # 1) BUY signal at price 100 -> opens a position via the shared core.
    monkeypatch.setattr(bot_engine, "_fetch_candles_and_price",
                        lambda symbol, market: ([{"close": 100}], 100.0))
    monkeypatch.setattr(bot_engine, "run_strategy",
                        lambda candles, strategy: {"signal": "BUY", "price": 100.0,
                                                   "stop_loss": 98.0, "target": 104.0})
    res = bot_engine.run_bot_once(bot_id)
    assert res["action"] == "BUY"

    conn = database.get_db()
    pf = conn.execute("SELECT current_balance FROM portfolios WHERE id = 1").fetchone()
    pos = conn.execute("SELECT * FROM positions WHERE portfolio_id = 1").fetchall()
    conn.close()
    assert len(pos) == 1
    assert pf["current_balance"] == 500000 - 10 * 100  # cash deducted

    # 2) Price jumps to the take-profit -> auto-sell closes the position.
    monkeypatch.setattr(bot_engine, "_fetch_candles_and_price",
                        lambda symbol, market: ([{"close": 104}], 104.0))
    monkeypatch.setattr(bot_engine, "run_strategy",
                        lambda candles, strategy: {"signal": "HOLD", "price": 104.0})
    res = bot_engine.run_bot_once(bot_id)
    assert res["action"] == "SELL (TP)"

    conn = database.get_db()
    pos = conn.execute("SELECT * FROM positions WHERE portfolio_id = 1").fetchall()
    sell = conn.execute(
        "SELECT * FROM trades WHERE trade_type='SELL' AND source='bot'").fetchone()
    pf = conn.execute("SELECT current_balance FROM portfolios WHERE id = 1").fetchone()
    conn.close()
    assert pos == []                                   # closed
    assert sell is not None and sell["bot_id"] == bot_id
    assert sell["pnl"] == (104.0 - 100.0) * 10         # 40 realized
    assert pf["current_balance"] == 500000 - 1000 + 1040

"""Tests for Indian symbol input validation (M8)."""
from services.indian_market import is_valid_symbol


def test_valid_symbols():
    for s in ("RELIANCE.NS", "M&M.NS", "^NSEI", "^NSEBANK", "NIFTY_FIN_SERVICE.NS", "TCS.NS"):
        assert is_valid_symbol(s), s


def test_invalid_symbols():
    for s in ("", "rel iance", "DROP TABLE", "a" * 30, "abc;rm", "http://x", None):
        assert not is_valid_symbol(s), s


def test_backtest_rejects_invalid_symbol(client):
    r = client.post("/api/backtest/run", json={
        "symbol": "not a symbol", "market": "indian", "strategy": "ema_crossover"})
    assert r.status_code == 400
    assert "Invalid symbol" in r.json()["detail"]


def test_candles_reject_invalid_symbol(client):
    r = client.get("/api/market/indian/candles", params={"symbol": "bad symbol!"})
    assert r.status_code == 400

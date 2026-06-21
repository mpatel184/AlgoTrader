"""Characterization tests for the manual paper-trading ledger (Phase 2 safety net).

Pins the CURRENT buy/sell behavior — balance math, lot averaging, position
lifecycle, and the realized-P&L recorded on the SELL row — before the execution
core extraction (H2) and lot-accounting fix (C4). Some current behavior is known
to be wrong (e.g. the close stamps P&L onto every open BUY row for the symbol);
where relevant that is documented so the C4 fix updates these deliberately.

Pricing is currently client-supplied (C3 will make it server-authoritative);
these tests pass explicit prices to characterize the math, not to endorse it.
"""


def _buy(client, price_feed, pid, symbol, qty, price, **kw):
    """Set the server-side fill price, then place a buy. The client `price` in the
    body is ignored by the server (C3); price_feed controls the actual fill."""
    price_feed.set(price)
    body = {"portfolio_id": pid, "symbol": symbol, "market": "indian",
            "quantity": qty, "price": price, **kw}
    return client.post("/api/trading/buy", json=body)


def _sell(client, price_feed, pos_id, price):
    price_feed.set(price)
    return client.post("/api/trading/sell", json={"position_id": pos_id})


def test_buy_deducts_balance_and_opens_position(client, price_feed):
    r = _buy(client, price_feed, 1, "RELIANCE.NS", 10, 100.0)
    assert r.status_code == 200
    assert r.json()["cost"] == 1000.0
    assert r.json()["balance"] == 500000 - 1000
    assert r.json()["price"] == 100.0           # server-reported fill price

    pf = client.get("/api/trading/portfolio/1").json()
    assert pf["current_balance"] == 499000
    assert len(pf["positions"]) == 1
    pos = pf["positions"][0]
    assert pos["quantity"] == 10 and pos["avg_price"] == 100.0


def test_second_buy_averages_price(client, price_feed):
    _buy(client, price_feed, 1, "RELIANCE.NS", 10, 100.0)
    _buy(client, price_feed, 1, "RELIANCE.NS", 10, 120.0)
    pf = client.get("/api/trading/portfolio/1").json()
    assert len(pf["positions"]) == 1
    pos = pf["positions"][0]
    assert pos["quantity"] == 20
    assert pos["avg_price"] == 110.0           # (10*100 + 10*120) / 20
    assert pf["current_balance"] == 500000 - 1000 - 1200


def test_sell_realizes_pnl_and_credits_balance(client, price_feed):
    _buy(client, price_feed, 1, "RELIANCE.NS", 10, 100.0)
    _buy(client, price_feed, 1, "RELIANCE.NS", 10, 120.0)   # avg 110, qty 20
    pf = client.get("/api/trading/portfolio/1").json()
    pos_id = pf["positions"][0]["id"]

    r = _sell(client, price_feed, pos_id, 130.0)
    assert r.status_code == 200
    assert r.json()["pnl"] == (130.0 - 110.0) * 20      # 400
    assert r.json()["proceeds"] == 130.0 * 20           # 2600

    pf = client.get("/api/trading/portfolio/1").json()
    assert pf["positions"] == []                         # position closed
    assert pf["current_balance"] == 500000 - 1000 - 1200 + 2600  # 500400


def test_insufficient_balance_rejected(client, price_feed):
    r = _buy(client, price_feed, 1, "RELIANCE.NS", 10_000, 1_000.0)  # 10,000,000 > 500,000
    assert r.status_code == 400


def test_sell_records_closed_trade_row(client, price_feed):
    _buy(client, price_feed, 1, "TCS.NS", 5, 200.0)
    pf = client.get("/api/trading/portfolio/1").json()
    pos_id = pf["positions"][0]["id"]
    _sell(client, price_feed, pos_id, 250.0)

    trades = client.get("/api/trading/trades/1").json()
    sells = [t for t in trades if t["trade_type"] == "SELL"]
    assert len(sells) == 1
    assert sells[0]["status"] == "closed"
    assert sells[0]["pnl"] == (250.0 - 200.0) * 5       # 250


def test_close_does_not_double_count_pnl(client, price_feed):
    """C4 regression: realized P&L lives only on the SELL row. Entry (BUY) rows
    carry 0, so portfolio total_pnl is not double-counted."""
    _buy(client, price_feed, 1, "TCS.NS", 10, 100.0)
    pf = client.get("/api/trading/portfolio/1").json()
    pos_id = pf["positions"][0]["id"]
    _sell(client, price_feed, pos_id, 130.0)

    pf = client.get("/api/trading/portfolio/1").json()
    realized = (130.0 - 100.0) * 10                      # 300
    assert pf["total_pnl"] == realized                   # not 600

    trades = client.get("/api/trading/trades/1").json()
    buy = next(t for t in trades if t["trade_type"] == "BUY")
    sell = next(t for t in trades if t["trade_type"] == "SELL")
    assert buy["status"] == "closed" and (buy["pnl"] or 0) == 0
    assert sell["pnl"] == realized


def test_buy_links_position_id(client, price_feed):
    _buy(client, price_feed, 1, "TCS.NS", 5, 200.0)
    pf = client.get("/api/trading/portfolio/1").json()
    pos_id = pf["positions"][0]["id"]
    trades = client.get("/api/trading/trades/1").json()
    buy = next(t for t in trades if t["trade_type"] == "BUY")
    assert buy["position_id"] == pos_id


def test_buy_rejected_when_no_live_price(client, price_feed, monkeypatch):
    """C3: if the server can't price the fill, the order is refused (503),
    not filled at a client-supplied price."""
    import services.pricing as pricing
    monkeypatch.setattr(pricing, "get_live_price", lambda symbol, market: None)
    r = client.post("/api/trading/buy", json={
        "portfolio_id": 1, "symbol": "RELIANCE.NS", "market": "indian",
        "quantity": 1, "price": 100.0})
    assert r.status_code == 503

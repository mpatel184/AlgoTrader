from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_db, write_transaction
from services import indian_market, crypto_market, execution, pricing, risk
from services.events import publish_portfolio_update
from auth import get_current_user, owns_portfolio

router = APIRouter()


def _require_portfolio_owner(c, portfolio_id: int, user_id: int):
    """404 if the portfolio doesn't exist or isn't owned by the acting user.
    404 (not 403) avoids leaking existence of other users' portfolios."""
    if not owns_portfolio(c, portfolio_id, user_id):
        raise HTTPException(status_code=404, detail="Portfolio not found")


class BuyOrder(BaseModel):
    portfolio_id: int
    symbol: str
    market: str
    quantity: float
    price: Optional[float] = None  # accepted for compatibility but IGNORED (C3); server prices fills
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    strategy: Optional[str] = None


class SellOrder(BaseModel):
    position_id: int
    price: Optional[float] = None  # accepted for compatibility but IGNORED (C3); server prices fills


@router.get("/portfolios")
def get_portfolios(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM portfolios WHERE user_id = ?", (current_user["id"],))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


@router.get("/portfolio/{portfolio_id}")
def get_portfolio(portfolio_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM portfolios WHERE id = ? AND user_id = ?",
              (portfolio_id, current_user["id"]))
    p = c.fetchone()
    if not p:
        conn.close()
        raise HTTPException(status_code=404, detail="Portfolio not found")

    c.execute("SELECT * FROM positions WHERE portfolio_id = ?", (portfolio_id,))
    positions = [dict(r) for r in c.fetchall()]

    c.execute("SELECT * FROM trades WHERE portfolio_id = ? ORDER BY created_at DESC LIMIT 50", (portfolio_id,))
    trades = [dict(r) for r in c.fetchall()]

    c.execute("SELECT * FROM portfolio_history WHERE portfolio_id = ? ORDER BY timestamp DESC LIMIT 180", (portfolio_id,))
    history = [dict(r) for r in c.fetchall()]
    history.reverse()

    conn.close()

    total_pnl = sum(t.get("pnl", 0) or 0 for t in trades)
    portfolio = dict(p)
    portfolio["positions"] = positions
    portfolio["trades"] = trades
    portfolio["history"] = history
    portfolio["total_pnl"] = round(total_pnl, 2)
    return portfolio


@router.post("/buy")
def buy_order(order: BuyOrder, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT * FROM portfolios WHERE id = ? AND user_id = ?",
              (order.portfolio_id, current_user["id"]))
    portfolio = c.fetchone()
    if not portfolio:
        conn.close()
        raise HTTPException(status_code=404, detail="Portfolio not found")

    # C3: the server prices the fill from the live quote — the client's price is ignored.
    fill_price = pricing.get_live_price(order.symbol, order.market)
    if fill_price is None:
        conn.close()
        raise HTTPException(status_code=503, detail=f"No live market price for {order.symbol}")

    # H3: pre-trade risk checks (concentration, max positions, daily-loss halt).
    try:
        risk.check_buy(conn, order.portfolio_id, order.symbol, order.quantity * fill_price)
    except risk.RiskViolation as e:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Risk check failed: {e.reason}")

    try:
        with write_transaction(conn):
            result = execution.execute_buy(
                conn, portfolio_id=order.portfolio_id, symbol=order.symbol, market=order.market,
                quantity=order.quantity, price=fill_price, stop_loss=order.stop_loss,
                take_profit=order.take_profit, strategy=order.strategy,
            )
    except execution.InsufficientFunds as e:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Insufficient balance. Need ₹{e.need:.2f}, have ₹{e.have:.2f}")

    conn.close()
    publish_portfolio_update(order.portfolio_id, action="buy", symbol=order.symbol)
    return {"message": f"Bought {order.quantity} {order.symbol} @ {fill_price}",
            "cost": result["cost"], "balance": result["balance"], "price": fill_price}


@router.post("/sell")
def sell_order(order: SellOrder, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT * FROM positions WHERE id = ?", (order.position_id,))
    position = c.fetchone()
    if not position:
        conn.close()
        raise HTTPException(status_code=404, detail="Position not found")

    if not owns_portfolio(c, position["portfolio_id"], current_user["id"]):
        conn.close()
        raise HTTPException(status_code=404, detail="Position not found")

    # C3: server prices the exit from the live quote; client price is ignored.
    fill_price = pricing.get_live_price(position["symbol"], position["market"])
    if fill_price is None:
        conn.close()
        raise HTTPException(status_code=503, detail=f"No live market price for {position['symbol']}")

    with write_transaction(conn):
        result = execution.execute_sell(
            conn, position=position, price=fill_price, strategy=position["strategy"],
        )

    conn.close()
    publish_portfolio_update(position["portfolio_id"], action="sell", symbol=position["symbol"])
    return {"message": f"Sold {position['quantity']} {position['symbol']} @ {fill_price}",
            "pnl": result["pnl"], "proceeds": result["proceeds"], "price": fill_price}


@router.get("/positions/{portfolio_id}")
def get_positions(portfolio_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    _require_portfolio_owner(c, portfolio_id, current_user["id"])
    c.execute("SELECT * FROM positions WHERE portfolio_id = ? ORDER BY opened_at DESC", (portfolio_id,))
    positions = [dict(r) for r in c.fetchall()]
    conn.close()
    return positions


@router.get("/trades/{portfolio_id}")
def get_trades(portfolio_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    _require_portfolio_owner(c, portfolio_id, current_user["id"])
    c.execute("SELECT * FROM trades WHERE portfolio_id = ? ORDER BY created_at DESC LIMIT 100", (portfolio_id,))
    trades = [dict(r) for r in c.fetchall()]
    conn.close()
    return trades


@router.post("/portfolio/reset/{portfolio_id}")
def reset_portfolio(portfolio_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM portfolios WHERE id = ? AND user_id = ?",
              (portfolio_id, current_user["id"]))
    p = c.fetchone()
    if not p:
        conn.close()
        raise HTTPException(status_code=404, detail="Portfolio not found")
    initial = p["initial_balance"]
    c.execute("UPDATE portfolios SET current_balance = ? WHERE id = ?", (initial, portfolio_id))
    c.execute("DELETE FROM positions WHERE portfolio_id = ?", (portfolio_id,))
    c.execute("DELETE FROM trades WHERE portfolio_id = ?", (portfolio_id,))
    c.execute("DELETE FROM portfolio_history WHERE portfolio_id = ?", (portfolio_id,))
    c.execute("INSERT INTO portfolio_history (portfolio_id, value) VALUES (?, ?)", (portfolio_id, initial))
    conn.commit()
    conn.close()
    return {"message": "Portfolio reset successfully", "balance": initial}

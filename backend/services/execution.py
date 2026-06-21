"""Shared paper-execution core (H2).

Single source of truth for ledger mutations — balance, positions, trades,
portfolio_history — used by both manual trading (routers/trading.py) and the
auto-trading bots (services/bot_engine.py). Previously each re-implemented this
with subtly different rules.

Design:
  - Functions operate on an already-open connection and DO NOT commit/close —
    the caller owns the transaction boundary (so a single order is atomic and,
    later, multiple steps can be wrapped together).
  - Caller-specific concerns (HTTP responses, bot_logs) stay with the caller.
  - Behavior is preserved exactly from the pre-refactor implementations,
    including the known lot-close quirk that stamps P&L onto every open BUY row
    for a symbol — that is fixed separately in C4 so the change is reviewable.
"""
from datetime import datetime


class ExecutionError(Exception):
    """Base class for execution failures."""


class PortfolioNotFound(ExecutionError):
    pass


class InsufficientFunds(ExecutionError):
    def __init__(self, need: float, have: float):
        self.need = need
        self.have = have
        super().__init__(f"Insufficient balance. Need {need:.2f}, have {have:.2f}")


def execute_buy(conn, *, portfolio_id, symbol, market, quantity, price,
                stop_loss=None, take_profit=None, strategy=None,
                source="manual", bot_id=None) -> dict:
    """Open or add to a long position; deduct cash; record the trade + history.

    Raises PortfolioNotFound / InsufficientFunds. Returns {cost, balance}.
    """
    c = conn.cursor()
    c.execute("SELECT * FROM portfolios WHERE id = ?", (portfolio_id,))
    portfolio = c.fetchone()
    if not portfolio:
        raise PortfolioNotFound(f"Portfolio {portfolio_id} not found")

    total_cost = quantity * price
    if portfolio["current_balance"] < total_cost:
        raise InsufficientFunds(need=total_cost, have=portfolio["current_balance"])

    # Upsert the position (averaging in if one already exists for the symbol).
    c.execute("SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?",
              (portfolio_id, symbol))
    existing = c.fetchone()
    if existing:
        position_id = existing["id"]
        new_qty = existing["quantity"] + quantity
        new_avg = (existing["avg_price"] * existing["quantity"] + price * quantity) / new_qty
        c.execute("""UPDATE positions SET quantity = ?, avg_price = ?, current_price = ?,
                     stop_loss = ?, take_profit = ? WHERE id = ?""",
                  (new_qty, new_avg, price, stop_loss, take_profit, position_id))
    else:
        c.execute("""INSERT INTO positions (portfolio_id, symbol, market, quantity, avg_price,
                                            current_price, stop_loss, take_profit, strategy)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                  (portfolio_id, symbol, market, quantity, price, price,
                   stop_loss, take_profit, strategy))
        position_id = c.lastrowid

    # Link the entry trade to its position (C4) so the matching close can find it.
    c.execute("""INSERT INTO trades (portfolio_id, symbol, market, trade_type, quantity, price,
                                     total_value, strategy, source, bot_id, position_id)
                 VALUES (?, ?, ?, 'BUY', ?, ?, ?, ?, ?, ?, ?)""",
              (portfolio_id, symbol, market, quantity, price, total_cost, strategy,
               source, bot_id, position_id))

    new_balance = portfolio["current_balance"] - total_cost
    c.execute("UPDATE portfolios SET current_balance = ? WHERE id = ?", (new_balance, portfolio_id))
    c.execute("INSERT INTO portfolio_history (portfolio_id, value) VALUES (?, ?)",
              (portfolio_id, new_balance))
    return {"cost": total_cost, "balance": new_balance}


def execute_sell(conn, *, position, price, strategy=None,
                 source="manual", bot_id=None) -> dict:
    """Close a position at `price`; realize P&L; credit cash; record the trade + history.

    `position` is a row/dict with id, portfolio_id, symbol, market, quantity, avg_price.
    Returns {pnl, proceeds, balance}.
    """
    c = conn.cursor()
    portfolio_id = position["portfolio_id"]
    position_id = position["id"]
    qty = position["quantity"]
    pnl = (price - position["avg_price"]) * qty
    proceeds = price * qty
    now = datetime.now().isoformat()

    # C4: close only the entry lots belonging to THIS position. Entries carry no
    # realized P&L (pnl stays 0) — realized P&L lives solely on the SELL row, so
    # summing trade P&L no longer double-counts.
    c.execute("""UPDATE trades SET status = 'closed', close_price = ?, closed_at = ?
                 WHERE position_id = ? AND trade_type = 'BUY' AND status = 'open'""",
              (price, now, position_id))

    c.execute("""INSERT INTO trades (portfolio_id, symbol, market, trade_type, quantity, price,
                                     total_value, pnl, status, strategy, source, bot_id,
                                     position_id, closed_at)
                 VALUES (?, ?, ?, 'SELL', ?, ?, ?, ?, 'closed', ?, ?, ?, ?, ?)""",
              (portfolio_id, position["symbol"], position["market"], qty, price, proceeds, pnl,
               strategy, source, bot_id, position_id, now))

    c.execute("DELETE FROM positions WHERE id = ?", (position["id"],))

    c.execute("SELECT current_balance FROM portfolios WHERE id = ?", (portfolio_id,))
    new_balance = c.fetchone()["current_balance"] + proceeds
    c.execute("UPDATE portfolios SET current_balance = ? WHERE id = ?", (new_balance, portfolio_id))
    c.execute("INSERT INTO portfolio_history (portfolio_id, value) VALUES (?, ?)",
              (portfolio_id, new_balance))
    return {"pnl": pnl, "proceeds": proceeds, "balance": new_balance}

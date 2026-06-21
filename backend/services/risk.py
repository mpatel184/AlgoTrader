"""Pre-trade risk management (H3).

Vets every BUY before it reaches the execution core, for both manual orders and
auto-trading bots. This is the layer that separates a trading platform from a
toy: it caps concentration, limits open positions, and halts new entries after a
bad day (kill-switch).

Limits are read from the environment at call time (so they're configurable and
testable), with sensible defaults. Set a limit to a disabling value (position
pct >= 1, or 0 for counts/loss) to turn that check off.

  RISK_MAX_POSITION_PCT   max single-order notional as a fraction of portfolio
                          equity (default 0.25 = 25%)
  RISK_MAX_OPEN_POSITIONS max distinct open positions per portfolio (default 10)
  RISK_MAX_DAILY_LOSS_PCT halt new buys once realized losses today reach this
                          fraction of equity (default 0.05 = 5%)
"""
import os
from datetime import datetime


class RiskViolation(Exception):
    """Raised when an order would breach a risk limit. `reason` is user-facing."""
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def _f(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _portfolio_equity(conn, portfolio_id: int) -> float:
    """Cash + cost basis of open positions (a live-price-free equity proxy)."""
    row = conn.execute("SELECT current_balance FROM portfolios WHERE id = ?",
                       (portfolio_id,)).fetchone()
    balance = row["current_balance"] if row else 0.0
    pos = conn.execute(
        "SELECT COALESCE(SUM(quantity * avg_price), 0) AS v FROM positions WHERE portfolio_id = ?",
        (portfolio_id,)).fetchone()
    return balance + (pos["v"] if pos else 0.0)


def check_buy(conn, portfolio_id: int, symbol: str, notional: float) -> None:
    """Raise RiskViolation if this buy would breach a limit. No-op otherwise."""
    max_position_pct = _f("RISK_MAX_POSITION_PCT", 0.25)
    max_open_positions = int(_f("RISK_MAX_OPEN_POSITIONS", 10))
    max_daily_loss_pct = _f("RISK_MAX_DAILY_LOSS_PCT", 0.05)

    equity = _portfolio_equity(conn, portfolio_id)

    # 1) Concentration: cap single-order size vs portfolio equity.
    if 0 < max_position_pct < 1 and equity > 0 and notional > max_position_pct * equity:
        raise RiskViolation(
            f"Order notional {notional:.2f} exceeds {max_position_pct:.0%} of "
            f"portfolio equity ({equity:.2f}). Reduce size.")

    # 2) Breadth: cap number of distinct open positions (new symbols only).
    if max_open_positions > 0:
        existing = conn.execute(
            "SELECT 1 FROM positions WHERE portfolio_id = ? AND symbol = ?",
            (portfolio_id, symbol)).fetchone()
        if not existing:
            count = conn.execute(
                "SELECT COUNT(*) AS c FROM positions WHERE portfolio_id = ?",
                (portfolio_id,)).fetchone()["c"]
            if count >= max_open_positions:
                raise RiskViolation(
                    f"Max open positions reached ({max_open_positions}).")

    # 3) Daily-loss kill-switch: halt new buys after a bad day.
    if 0 < max_daily_loss_pct < 1 and equity > 0:
        today = datetime.now().date().isoformat()
        realized = conn.execute(
            """SELECT COALESCE(SUM(pnl), 0) AS p FROM trades
               WHERE portfolio_id = ? AND trade_type = 'SELL'
                 AND substr(COALESCE(closed_at, ''), 1, 10) = ?""",
            (portfolio_id, today)).fetchone()["p"]
        if realized <= -max_daily_loss_pct * equity:
            raise RiskViolation(
                f"Daily loss limit hit (realized {realized:.2f} today). "
                "New entries halted until tomorrow.")

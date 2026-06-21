"""Auto-trading bot engine (paper trading).

Each bot is bound to a portfolio + symbol + strategy. On every tick the engine:
  1. reads the strategy configured on the bot,
  2. computes the latest signal from live candles,
  3. if FLAT and signal == BUY  -> opens a position (auto-buy) with SL/TP,
  4. if IN A POSITION           -> auto-sells when price hits stop-loss or
                                   take-profit, or when the strategy flips to SELL.

All execution is simulated against the same paper-trading tables used by the
manual trading UI, so bot trades show up alongside manual trades.
"""
import asyncio
import logging
import os
from datetime import datetime

from database import get_db, write_transaction
from services import indian_market, crypto_market, execution, risk, market_hours
from services.events import publish_portfolio_update
from services.strategy_engine import run_strategy

logger = logging.getLogger(__name__)

TICK_SECONDS = 15  # how often the scheduler wakes; per-bot interval is honored below
_scheduler_started = False


def _respect_market_hours() -> bool:
    return os.getenv("BOT_RESPECT_MARKET_HOURS", "true").strip().lower() in ("1", "true", "yes")


# ─── Market data helpers ─────────────────────────────────────────────────────

def _fetch_candles_and_price(symbol: str, market: str):
    """Return (candles, live_price). live_price falls back to last candle close."""
    if market == "crypto":
        coin_id = crypto_market.symbol_to_id(symbol)
        if not coin_id:
            return [], None
        candles = crypto_market.get_historical_data(coin_id, 180)
        quote = crypto_market.get_price(coin_id)
        price = quote.get("price") if quote else None
    else:  # indian (stocks and indices)
        candles = indian_market.get_historical_data(symbol, "6mo", "1d")
        quote = indian_market.get_quote(symbol)
        price = quote.get("price") if quote else None
    if price is None and candles:
        price = candles[-1]["close"]
    return candles, price


# ─── Paper execution (operate on an open connection, never raise to caller) ──

def _log(c, bot_id, action, message, price=None, pnl=None):
    c.execute(
        "INSERT INTO bot_logs (bot_id, action, message, price, pnl) VALUES (?, ?, ?, ?, ?)",
        (bot_id, action, message, price, pnl),
    )


def _execute_buy(c, bot, price, stop_loss, take_profit):
    """Bot buy: delegates ledger accounting to the shared execution core, keeps
    the bot-specific logging here. Returns True on fill, False if skipped."""
    qty = bot["quantity"]
    try:
        risk.check_buy(c.connection, bot["portfolio_id"], bot["symbol"], qty * price)
    except risk.RiskViolation as e:
        _log(c, bot["id"], "SKIP", f"Risk check failed: {e.reason}", price)
        return False
    try:
        execution.execute_buy(
            c.connection, portfolio_id=bot["portfolio_id"], symbol=bot["symbol"],
            market=bot["market"], quantity=qty, price=price, stop_loss=stop_loss,
            take_profit=take_profit, strategy=bot["strategy"], source="bot", bot_id=bot["id"],
        )
    except execution.PortfolioNotFound:
        _log(c, bot["id"], "ERROR", "Portfolio not found")
        return False
    except execution.InsufficientFunds as e:
        _log(c, bot["id"], "SKIP",
             f"Insufficient balance for {qty} {bot['symbol']} (need {e.need:.2f})", price)
        return False

    _log(c, bot["id"], "BUY",
         f"Auto-bought {qty} {bot['symbol']} @ {price} (SL {stop_loss}, TP {take_profit})", price)
    return True


def _execute_sell(c, bot, position, price, reason):
    """Bot sell: delegates ledger accounting to the shared execution core."""
    result = execution.execute_sell(
        c.connection, position=position, price=price, strategy=bot["strategy"],
        source="bot", bot_id=bot["id"],
    )
    pnl = result["pnl"]
    qty = position["quantity"]
    _log(c, bot["id"], "SELL",
         f"Auto-sold {qty} {position['symbol']} @ {price} - {reason} (P&L {pnl:.2f})", price, pnl)
    return pnl


# ─── Single-bot tick ─────────────────────────────────────────────────────────

def run_bot_once(bot_id: int) -> dict:
    """Run one decision cycle for a bot. Returns a small status dict."""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM bots WHERE id = ?", (bot_id,))
    bot = c.fetchone()
    if not bot:
        conn.close()
        return {"error": "bot not found"}
    bot = dict(bot)

    try:
        # H3b: don't act on stale prices when the market is closed (the providers
        # still return the last close). Crypto is 24/7; gate can be disabled.
        if _respect_market_hours() and not market_hours.is_market_open(bot["market"]):
            msg = "Market closed"
            c.execute("UPDATE bots SET last_run = ?, message = ? WHERE id = ?",
                      (datetime.now().isoformat(), msg, bot_id))
            conn.commit()
            conn.close()
            return {"status": msg}

        candles, price = _fetch_candles_and_price(bot["symbol"], bot["market"])
        if not candles or price is None:
            msg = "No market data"
            c.execute("UPDATE bots SET last_run = ?, message = ? WHERE id = ?",
                      (datetime.now().isoformat(), msg, bot_id))
            conn.commit()
            conn.close()
            return {"status": msg}

        result = run_strategy(candles, bot["strategy"])
        signal = result.get("signal", "HOLD")

        # Atomic decision-and-write: read position + execute + bookkeeping under
        # the write lock so balance updates can't race a manual order (C5).
        action = "HOLD"
        with write_transaction(conn):
            c.execute("SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?",
                      (bot["portfolio_id"], bot["symbol"]))
            position = c.fetchone()

            if position:
                position = dict(position)
                sl = position.get("stop_loss")
                tp = position.get("take_profit")
                if sl is not None and price <= sl:
                    _execute_sell(c, bot, position, price, "stop-loss hit")
                    action = "SELL (SL)"
                elif tp is not None and price >= tp:
                    _execute_sell(c, bot, position, price, "take-profit hit")
                    action = "SELL (TP)"
                elif signal == "SELL":
                    _execute_sell(c, bot, position, price, "strategy SELL signal")
                    action = "SELL (signal)"
            else:
                if signal == "BUY":
                    # Prefer strategy-provided SL/TP; otherwise derive from bot config.
                    stop_loss = result.get("stop_loss") or round(price * (1 - bot["sl_pct"]), 4)
                    take_profit = result.get("target") or round(
                        price + (price - stop_loss) * bot["rr_ratio"], 4)
                    if _execute_buy(c, bot, price, stop_loss, take_profit):
                        action = "BUY"

            c.execute("UPDATE bots SET last_run = ?, last_signal = ?, message = ? WHERE id = ?",
                      (datetime.now().isoformat(), signal,
                       f"{action} @ {price} (signal {signal})", bot_id))
        # Push a live update so the UI reflects bot trades without polling (M3).
        if action != "HOLD":
            publish_portfolio_update(bot["portfolio_id"], action="bot", bot_id=bot_id, symbol=bot["symbol"])
        return {"status": "ok", "signal": signal, "action": action, "price": price}
    except Exception as e:
        logger.exception("Bot %s tick failed", bot_id)
        _log(c, bot_id, "ERROR", str(e))
        c.execute("UPDATE bots SET last_run = ?, message = ? WHERE id = ?",
                  (datetime.now().isoformat(), f"error: {e}", bot_id))
        conn.commit()
        return {"error": str(e)}
    finally:
        conn.close()


# ─── Scheduler ────────────────────────────────────────────────────────────────

def _due_bot_ids() -> list:
    """Running bots whose interval has elapsed since last_run."""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, interval_seconds, last_run FROM bots WHERE status = 'running'")
    rows = c.fetchall()
    conn.close()
    now = datetime.now()
    due = []
    for r in rows:
        if not r["last_run"]:
            due.append(r["id"])
            continue
        try:
            last = datetime.fromisoformat(r["last_run"])
        except (ValueError, TypeError):
            due.append(r["id"])
            continue
        if (now - last).total_seconds() >= (r["interval_seconds"] or 60):
            due.append(r["id"])
    return due


def _tick_all():
    for bot_id in _due_bot_ids():
        run_bot_once(bot_id)


async def _scheduler_loop():
    while True:
        try:
            await asyncio.to_thread(_tick_all)
        except Exception:
            logger.exception("Scheduler tick failed")
        await asyncio.sleep(TICK_SECONDS)


def start_scheduler():
    """Launch the background scheduler once (idempotent)."""
    global _scheduler_started
    if _scheduler_started:
        return
    _scheduler_started = True
    asyncio.create_task(_scheduler_loop())

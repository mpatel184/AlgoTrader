"""Backtest engine (H1 — realism pass).

Corrections over the original naive loop, which inflated results:
  * Next-bar fills: a signal on bar i is filled at bar i+1's OPEN (the close that
    generated the signal is already gone — you can't trade it). Removes look-ahead.
  * Intrabar SL/TP: stops/targets are evaluated against each bar's HIGH/LOW, not
    just the close, so stop-outs aren't under-reported. When a bar's range spans
    both, the stop is assumed hit first (conservative).
  * Costs: configurable commission + slippage applied to every fill, so reported
    returns are NET of trading frictions.
  * Honest metrics: frequency-aware Sharpe/Sortino, Calmar, exposure, avg holding
    period, max consecutive losses.

To keep the change transparent (per the "show both" decision), the result reports
NET metrics in `summary` plus a `gross` summary (costs zeroed) and a `costs` block.
"""
import numpy as np
import pandas as pd

from services.strategy_engine import STRATEGY_MAP

# Default frictions (basis points of notional, per side).
DEFAULT_COMMISSION_BPS = 5.0   # 0.05% per side
DEFAULT_SLIPPAGE_BPS = 5.0     # 0.05% adverse per side


def _simulate(df, initial_capital, risk_per_trade, rr_ratio, sl_pct,
              commission_bps, slippage_bps):
    """Run the bar-by-bar simulation. Returns (trades, equity_curve).

    Each trade carries gross_pnl (frictionless) and pnl (net of costs); the equity
    curve is marked net. With commission_bps == slippage_bps == 0 this yields the
    gross result, which is how the `gross` summary is produced.
    """
    commission = commission_bps / 10_000.0
    slippage = slippage_bps / 10_000.0

    capital = initial_capital            # net realized cash
    position = None
    pending = None                       # signal decided on the previous bar, filled at this open
    trades = []
    equity_curve = []
    bars_in_market = 0

    n = len(df)
    for i in range(n):
        row = df.iloc[i]
        date = str(row["time"])
        open_, high, low, close = row["open"], row["high"], row["low"], row["close"]

        # 1) Fill a pending entry at THIS bar's open (decided on the previous bar).
        if position is None and pending is not None:
            side = "long" if pending == 1 else "short"
            # Slippage moves the fill against us.
            entry = open_ * (1 + slippage) if side == "long" else open_ * (1 - slippage)
            if side == "long":
                sl = entry * (1 - sl_pct)
                tp = entry + (entry - sl) * rr_ratio
            else:
                sl = entry * (1 + sl_pct)
                tp = entry - (sl - entry) * rr_ratio
            risk_per_unit = abs(entry - sl)
            qty = (capital * risk_per_trade) / risk_per_unit if risk_per_unit > 0 else 0
            # Cap so we never deploy more than available capital on a single long.
            if side == "long" and qty * entry > capital:
                qty = capital / entry
            if qty > 0:
                entry_commission = entry * qty * commission
                position = {
                    "side": side, "entry": entry, "qty": qty, "entry_date": date,
                    "stop_loss": sl, "take_profit": tp, "entry_commission": entry_commission,
                }
            pending = None

        # 2) Manage an open position against this bar's intrabar range.
        if position:
            hit_sl = (position["side"] == "long" and low <= position["stop_loss"]) or \
                     (position["side"] == "short" and high >= position["stop_loss"])
            hit_tp = (position["side"] == "long" and high >= position["take_profit"]) or \
                     (position["side"] == "short" and low <= position["take_profit"])
            exit_price = None
            reason = None
            if hit_sl:                      # conservative: assume stop before target
                exit_price, reason = position["stop_loss"], "stop_loss"
            elif hit_tp:
                exit_price, reason = position["take_profit"], "take_profit"

            if exit_price is not None:
                _close_trade(trades, position, exit_price, date, reason, commission, slippage)
                capital += trades[-1]["pnl"]
                position = None

        # 3) Decide next entry from THIS bar's signal (filled next bar's open).
        signal = int(row.get("signal", 0))
        if position is None and pending is None and signal != 0:
            pending = signal

        # 4) Mark-to-market equity (net of the entry commission already paid).
        value = capital
        if position:
            bars_in_market += 1
            unreal = (close - position["entry"]) * position["qty"]
            if position["side"] == "short":
                unreal = -unreal
            value = capital + unreal - position["entry_commission"]
        equity_curve.append({"time": date, "value": round(value, 2)})

    # Close any position still open at the end, at the last close.
    if position:
        last = df.iloc[-1]
        _close_trade(trades, position, last["close"], str(last["time"]),
                     "end_of_data", commission, slippage)
        capital += trades[-1]["pnl"]

    exposure = round(bars_in_market / n * 100, 2) if n else 0
    return trades, equity_curve, capital, exposure


def _close_trade(trades, position, raw_exit, date, reason, commission, slippage):
    """Append a completed trade with both gross and net P&L."""
    side = position["side"]
    qty = position["qty"]
    entry = position["entry"]
    # Exit slippage is adverse to the closing side.
    exit_price = raw_exit * (1 - slippage) if side == "long" else raw_exit * (1 + slippage)

    gross = (exit_price - entry) * qty
    if side == "short":
        gross = -gross
    exit_commission = exit_price * qty * commission
    net = gross - position["entry_commission"] - exit_commission

    trades.append({
        "entry_date": position["entry_date"],
        "exit_date": date,
        "side": side,
        "entry_price": round(entry, 4),
        "exit_price": round(exit_price, 4),
        "qty": round(qty, 6),
        "gross_pnl": round(gross, 2),
        "costs": round(position["entry_commission"] + exit_commission, 2),
        "pnl": round(net, 2),
        "pnl_pct": round(net / (entry * qty) * 100, 2) if entry and qty else 0,
        "exit_reason": reason,
    })


def _metrics(trades, equity_curve, initial_capital, final_capital, periods_per_year, exposure):
    n_trades = len(trades)
    wins = [t for t in trades if t["pnl"] > 0]
    losses = [t for t in trades if t["pnl"] <= 0]
    win_rate = (len(wins) / n_trades * 100) if n_trades else 0
    avg_win = float(np.mean([t["pnl"] for t in wins])) if wins else 0
    avg_loss = float(np.mean([t["pnl"] for t in losses])) if losses else 0
    gross_win = sum(t["pnl"] for t in wins)
    gross_loss = sum(t["pnl"] for t in losses)
    profit_factor = abs(gross_win / gross_loss) if gross_loss != 0 else (float("inf") if gross_win else 0)

    equity_vals = [e["value"] for e in equity_curve]
    max_dd = _max_drawdown(equity_vals)

    returns = pd.Series(equity_vals).pct_change().dropna()
    ann = np.sqrt(periods_per_year)
    sharpe = (returns.mean() / returns.std() * ann) if returns.std() > 0 else 0
    downside = returns[returns < 0]
    sortino = (returns.mean() / downside.std() * ann) if len(downside) > 1 and downside.std() > 0 else 0

    total_return = ((final_capital - initial_capital) / initial_capital) * 100
    # Calmar: annualized return / max drawdown.
    years = max(len(equity_vals) / periods_per_year, 1e-9)
    cagr = ((final_capital / initial_capital) ** (1 / years) - 1) * 100 if final_capital > 0 else -100
    calmar = (cagr / max_dd) if max_dd > 0 else 0

    max_consec_losses = _max_consecutive_losses(trades)

    return {
        "initial_capital": initial_capital,
        "final_value": round(final_capital, 2),
        "total_return": round(total_return, 2),
        "cagr": round(cagr, 2),
        "total_trades": n_trades,
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "win_rate": round(win_rate, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "profit_factor": round(profit_factor, 2) if profit_factor != float("inf") else 9999,
        "max_drawdown": round(max_dd, 2),
        "sharpe_ratio": round(float(sharpe), 2),
        "sortino_ratio": round(float(sortino), 2),
        "calmar_ratio": round(float(calmar), 2),
        "max_consecutive_losses": max_consec_losses,
        "exposure_pct": exposure,
    }


def _max_drawdown(equity_vals):
    if not equity_vals:
        return 0
    peak = equity_vals[0]
    max_dd = 0
    for v in equity_vals:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100 if peak else 0
        if dd > max_dd:
            max_dd = dd
    return max_dd


def _max_consecutive_losses(trades):
    streak = best = 0
    for t in trades:
        if t["pnl"] <= 0:
            streak += 1
            best = max(best, streak)
        else:
            streak = 0
    return best


def run_backtest(candles: list, strategy_key: str, initial_capital: float = 100000,
                 risk_per_trade: float = 0.01, rr_ratio: float = 2.0,
                 sl_pct: float = 0.02, commission_bps: float = DEFAULT_COMMISSION_BPS,
                 slippage_bps: float = DEFAULT_SLIPPAGE_BPS,
                 periods_per_year: int = 252) -> dict:
    if not candles or len(candles) < 50:
        return {"error": "Not enough data for backtesting (need 50+ candles)"}
    if strategy_key not in STRATEGY_MAP:
        return {"error": f"Unknown strategy: {strategy_key}"}

    df = pd.DataFrame(candles)
    df.columns = [c.lower() for c in df.columns]
    df = STRATEGY_MAP[strategy_key](df).reset_index(drop=True)

    # NET (with costs) — the honest result.
    trades, equity_curve, final_capital, exposure = _simulate(
        df, initial_capital, risk_per_trade, rr_ratio, sl_pct, commission_bps, slippage_bps)
    summary = _metrics(trades, equity_curve, initial_capital, final_capital, periods_per_year, exposure)

    # GROSS (frictionless) — so the impact of costs is visible ("show both").
    g_trades, g_curve, g_final, g_exposure = _simulate(
        df, initial_capital, risk_per_trade, rr_ratio, sl_pct, 0.0, 0.0)
    gross = _metrics(g_trades, g_curve, initial_capital, g_final, periods_per_year, g_exposure)

    total_costs = round(sum(t["costs"] for t in trades), 2)

    return {
        "summary": summary,
        "gross": gross,
        "costs": {
            "total_costs": total_costs,
            "commission_bps": commission_bps,
            "slippage_bps": slippage_bps,
        },
        "trades": trades,
        "equity_curve": equity_curve,
    }

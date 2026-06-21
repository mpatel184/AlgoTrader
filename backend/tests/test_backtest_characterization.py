"""Characterization tests for the backtest engine.

UPDATED for H1 (realism pass). The previous golden values reflected the naive
engine's look-ahead (entry/exit at the signal bar's close, SL/TP on close only,
zero costs), which massively inflated results — e.g. ema_crossover showed
+10.68% with a 100% win rate and Sharpe 4.51.

The corrected engine fills at the next bar's OPEN, evaluates SL/TP against
intrabar HIGH/LOW, and charges commission + slippage. The same strategy is now
-2.25% with a 33% win rate — a realistic figure. These goldens pin the new,
honest behavior.
"""
import pytest

from services.backtest_engine import run_backtest


# Captured 2026-06 against the realism-pass engine on the 400-bar fixture (NET of costs).
GOLDEN_NET = {
    "ema_crossover": {
        "final_value": 97753.48, "total_return": -2.25, "total_trades": 6,
        "winning_trades": 2, "losing_trades": 4, "win_rate": 33.33,
        "max_drawdown": 3.33, "sharpe_ratio": -0.74,
    },
    # rsi_momentum updated for H6 (Wilder RSI changes which bars fire).
    "rsi_momentum": {
        "final_value": 100573.43, "total_return": 0.57, "total_trades": 5,
        "winning_trades": 2, "losing_trades": 3, "win_rate": 40.0,
        "max_drawdown": 2.3, "sharpe_ratio": 0.19,
    },
    # crypto_ema_trend: a stateless-condition strategy that overtrades and gets
    # chopped up by costs/stops — a realistic "bad on this data" case.
    "crypto_ema_trend": {
        "final_value": 45482.92, "total_return": -54.52, "total_trades": 122,
        "winning_trades": 18, "losing_trades": 104, "win_rate": 14.75,
        "max_drawdown": 56.69, "sharpe_ratio": -5.4,
    },
}


@pytest.mark.parametrize("key", sorted(GOLDEN_NET))
def test_backtest_net_summary_unchanged(key, candles):
    summary = run_backtest(candles, key)["summary"]
    for field, expected in GOLDEN_NET[key].items():
        assert summary[field] == pytest.approx(expected, abs=1e-2), f"{key}.{field}"


def test_backtest_structure(candles):
    res = run_backtest(candles, "ema_crossover")
    assert set(res) == {"summary", "gross", "costs", "trades", "equity_curve"}
    assert len(res["equity_curve"]) == len(candles)
    # Every trade still carries the fields the frontend BacktestResults table renders.
    for t in res["trades"]:
        assert {"entry_date", "exit_date", "side", "entry_price", "exit_price",
                "qty", "pnl", "pnl_pct", "exit_reason"} <= set(t)
        assert "gross_pnl" in t and "costs" in t


def test_new_metrics_present(candles):
    s = run_backtest(candles, "ema_crossover")["summary"]
    for field in ("cagr", "sortino_ratio", "calmar_ratio",
                  "max_consecutive_losses", "exposure_pct"):
        assert field in s


def test_costs_make_net_worse_than_gross(candles):
    """H1 'show both': the gross (frictionless) result must beat the net result,
    and the gap is the reported total cost."""
    res = run_backtest(candles, "rsi_momentum")
    assert res["gross"]["final_value"] > res["summary"]["final_value"]
    assert res["costs"]["total_costs"] > 0


def test_zero_costs_makes_net_equal_gross(candles):
    res = run_backtest(candles, "ema_crossover", commission_bps=0, slippage_bps=0)
    assert res["summary"]["final_value"] == res["gross"]["final_value"]
    assert res["costs"]["total_costs"] == 0


def test_backtest_rejects_short_series(short_candles):
    assert "error" not in run_backtest(short_candles, "ema_crossover")
    assert "error" in run_backtest(short_candles[:40], "ema_crossover")


def test_backtest_unknown_strategy(candles):
    assert "error" in run_backtest(candles, "nope")


def test_equity_curve_starts_near_initial_capital(candles):
    res = run_backtest(candles, "sr_breakout", initial_capital=100000)
    # sr_breakout emits no signals on this series -> flat equity at initial capital.
    assert res["equity_curve"][0]["value"] == pytest.approx(100000, abs=1e-2)
    assert res["summary"]["total_trades"] == 0


def test_stop_exits_are_realistic(candles):
    """Stop exits fill adversely (slippage) and net P&L is below gross (costs)."""
    res = run_backtest(candles, "crypto_ema_trend")
    sl_exits = [t for t in res["trades"] if t["exit_reason"] == "stop_loss"]
    assert sl_exits  # this strategy stops out frequently on the fixture
    for t in sl_exits:
        assert t["pnl"] < t["gross_pnl"]

"""Characterization tests for the strategy engine.

These lock the CURRENT signal output of every strategy against a fixed
synthetic series. They are not assertions about what is *correct* — they pin
present behavior so refactors (e.g. Wilder RSI, the crypto_trend_rsi shift fix
in Phase 3/H6) surface as intentional, reviewable diffs rather than silent
changes.
"""
import pandas as pd
import pytest

from services.strategy_engine import STRATEGY_MAP, run_strategy


# Current signal distribution per strategy on the 400-bar fixture.
# {signal_value: count}. Captured 2026-06 against the existing implementation.
# Updated for H6 (Wilder RSI + crypto_trend_rsi double-shift fix). RSI-based
# strategies now fire on different bars; crypto_trend_rsi is correctly more
# selective (no signals on this fixture).
GOLDEN_SIGNAL_COUNTS = {
    "ema_crossover": {0: 394, 1: 3, -1: 3},
    "rsi_momentum": {0: 394, -1: 6},
    "sr_breakout": {0: 400},
    "gap_and_go": {0: 400},
    "crypto_trend_rsi": {0: 400},
    "crypto_ema_trend": {0: 81, 1: 223, -1: 96},
    "crypto_breakout": {0: 400},
    "rsi_divergence": {0: 394, -1: 5, 1: 1},
}


@pytest.mark.parametrize("key", sorted(STRATEGY_MAP))
def test_strategy_signal_counts_unchanged(key, candles):
    df = STRATEGY_MAP[key](pd.DataFrame(candles))
    counts = {int(k): int(v) for k, v in df["signal"].value_counts().items()}
    assert counts == GOLDEN_SIGNAL_COUNTS[key]


@pytest.mark.parametrize("key", sorted(STRATEGY_MAP))
def test_every_strategy_sets_signal_column(key, candles):
    df = STRATEGY_MAP[key](pd.DataFrame(candles))
    assert "signal" in df.columns
    assert set(df["signal"].unique()).issubset({-1, 0, 1})


def test_run_strategy_latest_ema_crossover(candles):
    res = run_strategy(candles, "ema_crossover")
    assert res["signal"] == "HOLD"
    assert res["price"] == pytest.approx(155.35, abs=1e-2)
    assert res["stop_loss"] is None
    assert res["target"] is None
    assert res["indicators"]["ema20"] == pytest.approx(160.2649, abs=1e-3)
    assert res["indicators"]["ema200"] == pytest.approx(147.9279, abs=1e-3)


def test_run_strategy_insufficient_data():
    res = run_strategy([{"time": "2022-01-01", "open": 1, "high": 1,
                         "low": 1, "close": 1, "volume": 1}], "ema_crossover")
    assert res["signal"] == "HOLD"
    assert "error" in res


def test_run_strategy_unknown_key(candles):
    res = run_strategy(candles, "does_not_exist")
    assert res["signal"] == "HOLD"
    assert res["error"] == "Unknown strategy"


def test_buy_signal_carries_stop_and_target():
    """When a strategy emits BUY, run_strategy must attach SL/TP (current rule:
    2% equity / 4% crypto stop, 2R target). Pins the live-trade contract bots rely on."""
    # crypto_ema_trend reliably emits a BUY as its latest signal on this series.
    res = run_strategy(_rising(), "crypto_ema_trend")
    if res["signal"] == "BUY":
        assert res["stop_loss"] is not None and res["stop_loss"] < res["price"]
        assert res["target"] is not None and res["target"] > res["price"]


def _rising():
    return [{"time": f"2022-01-{(i % 28) + 1:02d}", "open": 100 + i, "high": 102 + i,
             "low": 99 + i, "close": 101 + i, "volume": 1_000_000} for i in range(120)]

import pandas as pd
import numpy as np
from typing import Optional


def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Wilder's RSI (EMA-style smoothing, alpha = 1/period).

    The previous implementation used a simple rolling mean, which does not match
    the RSI shown by brokers / TradingView and fired signals on different bars.
    """
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def _sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period).mean()


def _support_resistance(df: pd.DataFrame, window: int = 20):
    highs = df["high"].rolling(window).max()
    lows = df["low"].rolling(window).min()
    return highs, lows


# ─── Indian Strategies ──────────────────────────────────────────────────────

def ema_crossover_strategy(df: pd.DataFrame) -> pd.DataFrame:
    """20-50-200 EMA Swing Trading"""
    df = df.copy()
    df["ema20"] = _ema(df["close"], 20)
    df["ema50"] = _ema(df["close"], 50)
    df["ema200"] = _ema(df["close"], 200)

    prev_fast = df["ema20"].shift(1)
    prev_slow = df["ema50"].shift(1)

    buy = (df["ema20"] > df["ema50"]) & (prev_fast <= prev_slow) & (df["close"] > df["ema200"])
    sell = (df["ema20"] < df["ema50"]) & (prev_fast >= prev_slow)

    df["signal"] = 0
    df.loc[buy, "signal"] = 1
    df.loc[sell, "signal"] = -1
    df["strategy"] = "EMA Crossover (20-50-200)"
    return df


def rsi_momentum_strategy(df: pd.DataFrame) -> pd.DataFrame:
    """RSI(10) Momentum Strategy"""
    df = df.copy()
    df["rsi"] = _rsi(df["close"], 10)
    df["ema20"] = _ema(df["close"], 20)
    prev_rsi = df["rsi"].shift(1)

    buy = (df["rsi"] > 30) & (prev_rsi <= 30) & (df["close"] > df["ema20"])
    sell = (df["rsi"] < 70) & (prev_rsi >= 70)

    df["signal"] = 0
    df.loc[buy, "signal"] = 1
    df.loc[sell, "signal"] = -1
    df["strategy"] = "RSI Momentum (10)"
    return df


def support_resistance_strategy(df: pd.DataFrame, window: int = 20) -> pd.DataFrame:
    """Support & Resistance Breakout"""
    df = df.copy()
    df["resistance"] = df["high"].rolling(window).max().shift(1)
    df["support"] = df["low"].rolling(window).min().shift(1)
    avg_vol = df["volume"].rolling(window).mean()

    buy = (df["close"] > df["resistance"]) & (df["volume"] > avg_vol * 1.5)
    sell = (df["close"] < df["support"]) & (df["volume"] > avg_vol * 1.5)

    df["signal"] = 0
    df.loc[buy, "signal"] = 1
    df.loc[sell, "signal"] = -1
    df["strategy"] = "S&R Breakout"
    return df


def gap_and_go_strategy(df: pd.DataFrame) -> pd.DataFrame:
    """Gap and Go (uses open vs prev close)"""
    df = df.copy()
    prev_close = df["close"].shift(1)
    gap_pct = (df["open"] - prev_close) / prev_close * 100

    buy = (gap_pct > 2) & (df["volume"] > df["volume"].rolling(10).mean() * 1.5)
    sell = (gap_pct < -2) & (df["volume"] > df["volume"].rolling(10).mean() * 1.5)

    df["signal"] = 0
    df.loc[buy, "signal"] = 1
    df.loc[sell, "signal"] = -1
    df["strategy"] = "Gap and Go"
    return df


# ─── Crypto Strategies ───────────────────────────────────────────────────────

def crypto_trend_rsi_strategy(df: pd.DataFrame) -> pd.DataFrame:
    """Trend + S/R + RSI (Best for Crypto)"""
    df = df.copy()
    df["ema200"] = _ema(df["close"], 200)
    df["ema20"] = _ema(df["close"], 20)
    df["rsi"] = _rsi(df["close"], 14)
    df["resistance"] = df["high"].rolling(20).max().shift(1)
    df["support"] = df["low"].rolling(20).min().shift(1)

    # `resistance` is already the prior 20-bar high (shifted once). The old code
    # shifted it AGAIN here, comparing against a 2-bar-stale level — a bug.
    buy = (df["close"] > df["ema200"]) & (df["close"] > df["resistance"]) & \
          (df["rsi"] > 50) & (df["rsi"] < 70)
    sell = (df["close"] < df["ema200"]) & (df["rsi"] > 70)

    df["signal"] = 0
    df.loc[buy, "signal"] = 1
    df.loc[sell, "signal"] = -1
    df["strategy"] = "Crypto Trend + RSI"
    return df


def crypto_ema_trend_strategy(df: pd.DataFrame) -> pd.DataFrame:
    """Crypto Trend-Following with EMA"""
    df = df.copy()
    df["ema20"] = _ema(df["close"], 20)
    df["ema50"] = _ema(df["close"], 50)
    df["rsi"] = _rsi(df["close"], 14)

    buy = (df["close"] > df["ema20"]) & (df["close"] > df["ema50"]) & (df["rsi"] > 50)
    sell = (df["close"] < df["ema20"]) & (df["close"] < df["ema50"]) & (df["rsi"] < 50)

    df["signal"] = 0
    df.loc[buy, "signal"] = 1
    df.loc[sell, "signal"] = -1
    df["strategy"] = "Crypto EMA Trend"
    return df


def crypto_breakout_strategy(df: pd.DataFrame) -> pd.DataFrame:
    """Crypto Breakout from Consolidation"""
    df = df.copy()
    df["resistance"] = df["high"].rolling(20).max().shift(1)
    df["support"] = df["low"].rolling(20).min().shift(1)
    avg_vol = df["volume"].rolling(20).mean()

    # Consolidation: low ATR relative to price
    atr_period = 14
    high_low = df["high"] - df["low"]
    df["atr"] = high_low.rolling(atr_period).mean()
    df["atr_pct"] = df["atr"] / df["close"] * 100

    buy = (df["close"] > df["resistance"]) & (df["atr_pct"].shift(1) < 3)
    sell = (df["close"] < df["support"])

    df["signal"] = 0
    df.loc[buy, "signal"] = 1
    df.loc[sell, "signal"] = -1
    df["strategy"] = "Crypto Breakout"
    return df


def rsi_divergence_strategy(df: pd.DataFrame, lookback: int = 5) -> pd.DataFrame:
    """RSI Divergence Strategy"""
    df = df.copy()
    df["rsi"] = _rsi(df["close"], 14)

    price_ll = df["close"] < df["close"].rolling(lookback).min().shift(1)
    rsi_hl = df["rsi"] > df["rsi"].rolling(lookback).min().shift(1)
    bullish_div = price_ll & rsi_hl & (df["rsi"] < 40)

    price_hh = df["close"] > df["close"].rolling(lookback).max().shift(1)
    rsi_lh = df["rsi"] < df["rsi"].rolling(lookback).max().shift(1)
    bearish_div = price_hh & rsi_lh & (df["rsi"] > 60)

    df["signal"] = 0
    df.loc[bullish_div, "signal"] = 1
    df.loc[bearish_div, "signal"] = -1
    df["strategy"] = "RSI Divergence"
    return df


# ─── Dispatcher ─────────────────────────────────────────────────────────────

STRATEGY_MAP = {
    "ema_crossover": ema_crossover_strategy,
    "rsi_momentum": rsi_momentum_strategy,
    "sr_breakout": support_resistance_strategy,
    "gap_and_go": gap_and_go_strategy,
    "crypto_trend_rsi": crypto_trend_rsi_strategy,
    "crypto_ema_trend": crypto_ema_trend_strategy,
    "crypto_breakout": crypto_breakout_strategy,
    "rsi_divergence": rsi_divergence_strategy,
}


def run_strategy(candles: list, strategy_key: str) -> dict:
    if not candles or len(candles) < 30:
        return {"signal": "HOLD", "indicators": {}, "error": "Not enough data"}

    df = pd.DataFrame(candles)
    df.columns = [c.lower() for c in df.columns]

    if strategy_key not in STRATEGY_MAP:
        return {"signal": "HOLD", "indicators": {}, "error": "Unknown strategy"}

    df = STRATEGY_MAP[strategy_key](df)
    latest = df.iloc[-1]

    signal_val = int(latest.get("signal", 0))
    signal = "BUY" if signal_val == 1 else ("SELL" if signal_val == -1 else "HOLD")

    indicators = {}
    for col in ["ema20", "ema50", "ema200", "rsi", "resistance", "support", "atr"]:
        if col in df.columns:
            v = df[col].iloc[-1]
            if not pd.isna(v):
                indicators[col] = round(float(v), 4)

    price = float(latest["close"])
    stop_loss = None
    target = None
    if signal == "BUY":
        sl_pct = 0.02 if "crypto" not in strategy_key else 0.04
        stop_loss = round(price * (1 - sl_pct), 4)
        target = round(price + (price - stop_loss) * 2, 4)
    elif signal == "SELL":
        sl_pct = 0.02 if "crypto" not in strategy_key else 0.04
        stop_loss = round(price * (1 + sl_pct), 4)
        target = round(price - (stop_loss - price) * 2, 4)

    return {
        "signal": signal,
        "price": price,
        "strategy": latest.get("strategy", strategy_key),
        "indicators": indicators,
        "stop_loss": stop_loss,
        "target": target,
        "candles_with_signals": df[["time", "open", "high", "low", "close", "volume", "signal"]]
            .tail(100).fillna(0).to_dict(orient="records"),
    }

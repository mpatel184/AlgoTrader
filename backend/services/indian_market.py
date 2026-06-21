import logging
import re
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional

from services import cache

# NSE/BSE tickers + indices (e.g. RELIANCE.NS, M&M.NS, ^NSEI, NIFTY_FIN_SERVICE.NS).
# A format check (not a whitelist — the universe is open-ended) to keep arbitrary
# strings from reaching yfinance (M8).
_SYMBOL_RE = re.compile(r"^[A-Z0-9._&^-]{1,25}$")


def is_valid_symbol(symbol: str) -> bool:
    return bool(symbol and _SYMBOL_RE.match(symbol))

logger = logging.getLogger(__name__)

# yfinance has no caching; bots refetch per tick. Short TTLs dedupe identical
# fetches across bots/endpoints (H5) while keeping data reasonably fresh.
_HISTORY_TTL = 300  # daily candles barely change within 5 min
_QUOTE_TTL = 20     # live price; bots tick >= their interval (default 60s)

NIFTY50 = [
    "RELIANCE.NS","TCS.NS","HDFCBANK.NS","INFY.NS","ICICIBANK.NS",
    "HINDUNILVR.NS","SBIN.NS","BHARTIARTL.NS","ITC.NS","KOTAKBANK.NS",
    "LT.NS","AXISBANK.NS","ASIANPAINT.NS","MARUTI.NS","NESTLEIND.NS",
    "WIPRO.NS","ULTRACEMCO.NS","TITAN.NS","BAJFINANCE.NS","TECHM.NS",
    "SUNPHARMA.NS","ONGC.NS","POWERGRID.NS","NTPC.NS","BAJAJFINSV.NS",
    "HCLTECH.NS","JSWSTEEL.NS","TATAMOTORS.NS","TATASTEEL.NS","M&M.NS",
]

# Indian indices (yfinance symbols verified to return data)
INDICES = [
    {"symbol": "^NSEI", "name": "Nifty 50"},
    {"symbol": "^NSEBANK", "name": "Bank Nifty"},
    {"symbol": "^BSESN", "name": "Sensex"},
    {"symbol": "^CNXIT", "name": "Nifty IT"},
    {"symbol": "^NSEMDCP50", "name": "Nifty Midcap 50"},
    {"symbol": "NIFTY_FIN_SERVICE.NS", "name": "Fin Nifty"},
]

INDEX_NAMES = {i["symbol"]: i["name"] for i in INDICES}

SYMBOL_NAMES = {
    "RELIANCE.NS": "Reliance Industries",
    "TCS.NS": "Tata Consultancy Services",
    "HDFCBANK.NS": "HDFC Bank",
    "INFY.NS": "Infosys",
    "ICICIBANK.NS": "ICICI Bank",
    "SBIN.NS": "State Bank of India",
    "WIPRO.NS": "Wipro",
    "AXISBANK.NS": "Axis Bank",
    "BAJFINANCE.NS": "Bajaj Finance",
    "MARUTI.NS": "Maruti Suzuki",
    "LT.NS": "Larsen & Toubro",
    "TATAMOTORS.NS": "Tata Motors",
    "SUNPHARMA.NS": "Sun Pharma",
    "HINDUNILVR.NS": "Hindustan Unilever",
    "ITC.NS": "ITC",
    "KOTAKBANK.NS": "Kotak Mahindra Bank",
    "BHARTIARTL.NS": "Bharti Airtel",
    "ASIANPAINT.NS": "Asian Paints",
    "NESTLEIND.NS": "Nestle India",
    "TITAN.NS": "Titan Company",
}

SYMBOL_NAMES.update(INDEX_NAMES)


def _safe_int(v) -> int:
    """Indices frequently report NaN volume."""
    try:
        if pd.isna(v):
            return 0
        return int(v)
    except (ValueError, TypeError):
        return 0


def get_historical_data(symbol: str, period: str = "6mo", interval: str = "1d") -> list:
    cache_key = f"in:hist:{symbol}:{period}:{interval}"
    cached = cache.get(cache_key, _HISTORY_TTL)
    if cached is not None:
        return cached
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval)
        if df.empty:
            return []
        df = df.reset_index()
        result = []
        for _, row in df.iterrows():
            dt = row["Date"]
            if hasattr(dt, "date"):
                time_val = dt.strftime("%Y-%m-%d") if interval in ["1d", "1wk", "1mo"] else int(dt.timestamp())
            else:
                time_val = str(dt)[:10]
            result.append({
                "time": time_val,
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": _safe_int(row["Volume"]),
            })
        cache.set(cache_key, result)
        return result
    except Exception as e:
        logger.warning("Error fetching history for %s: %s", symbol, e)
        return []


def get_quote(symbol: str) -> dict:
    cache_key = f"in:quote:{symbol}"
    cached = cache.get(cache_key, _QUOTE_TTL)
    if cached is not None:
        return cached
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        hist = ticker.history(period="2d")
        if hist.empty:
            return {}
        latest = hist.iloc[-1]
        prev_close = hist.iloc[-2]["Close"] if len(hist) > 1 else latest["Close"]
        price = float(latest["Close"])
        change = price - float(prev_close)
        change_pct = (change / float(prev_close)) * 100
        quote = {
            "symbol": symbol,
            "name": SYMBOL_NAMES.get(symbol, symbol.replace(".NS", "").replace("^", "")),
            "price": round(price, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "volume": _safe_int(latest["Volume"]),
            "high": round(float(latest["High"]), 2),
            "low": round(float(latest["Low"]), 2),
            "open": round(float(latest["Open"]), 2),
        }
        cache.set(cache_key, quote)
        return quote
    except Exception as e:
        logger.warning("Error getting quote for %s: %s", symbol, e)
        return {}


def get_watchlist_quotes() -> list:
    symbols = NIFTY50[:15]
    results = []
    for sym in symbols:
        q = get_quote(sym)
        if q:
            results.append(q)
    return results


def get_index_quotes() -> list:
    results = []
    for idx in INDICES:
        q = get_quote(idx["symbol"])
        if q:
            q["is_index"] = True
            results.append(q)
    return results


def search_symbols(query: str) -> list:
    query = query.upper()
    matches = []
    for idx in INDICES:
        if query in idx["symbol"].upper() or query in idx["name"].upper():
            matches.append({"symbol": idx["symbol"], "name": idx["name"], "market": "indian", "is_index": True})
    for sym in NIFTY50:
        name = SYMBOL_NAMES.get(sym, "")
        if query in sym or query in name.upper():
            matches.append({"symbol": sym, "name": name, "market": "indian"})
    return matches[:15]

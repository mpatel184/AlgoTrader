"""Best-effort NSE index option chain.

NSE's public option-chain JSON endpoint requires a browser-like session
(cookies obtained from the homepage first) and frequently rate-limits or
blocks data-center / non-residential IPs. This module therefore:
  - warms a cookie session against nseindia.com,
  - caches successful responses for a few minutes,
  - fails gracefully (returns an "available": False payload) instead of raising,
so the rest of the app keeps working when NSE blocks the request.

It tends to work from a normal home/office IP and fail from cloud hosts.
"""
import time
import requests
from typing import Optional

# Index symbols NSE exposes an option chain for
OPTION_INDICES = [
    {"symbol": "NIFTY", "name": "Nifty 50"},
    {"symbol": "BANKNIFTY", "name": "Bank Nifty"},
    {"symbol": "FINNIFTY", "name": "Fin Nifty"},
    {"symbol": "MIDCPNIFTY", "name": "Nifty Midcap Select"},
]
_VALID = {i["symbol"] for i in OPTION_INDICES}

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/option-chain",
}

_CACHE: dict = {}
_CACHE_TTL = 180  # seconds
_session: Optional[requests.Session] = None
_session_ts: float = 0.0


def _get_session() -> requests.Session:
    """Return a cookie-warmed session, refreshing it every few minutes."""
    global _session, _session_ts
    if _session is None or (time.time() - _session_ts) > 300:
        s = requests.Session()
        s.headers.update(_HEADERS)
        # Warm cookies: hit homepage then the option-chain page.
        s.get("https://www.nseindia.com", timeout=8)
        s.get("https://www.nseindia.com/option-chain", timeout=8)
        _session = s
        _session_ts = time.time()
    return _session


def _build_chain(raw: dict, max_strikes: int = 12) -> dict:
    records = raw.get("records", {})
    filtered = raw.get("filtered", {})
    underlying = records.get("underlyingValue", 0)
    expiries = records.get("expiryDates", [])
    rows = filtered.get("data") or records.get("data", [])

    parsed = []
    for item in rows:
        strike = item.get("strikePrice")
        ce = item.get("CE") or {}
        pe = item.get("PE") or {}
        parsed.append({
            "strike": strike,
            "ce_ltp": ce.get("lastPrice", 0),
            "ce_oi": ce.get("openInterest", 0),
            "ce_chg_oi": ce.get("changeinOpenInterest", 0),
            "ce_iv": ce.get("impliedVolatility", 0),
            "ce_volume": ce.get("totalTradedVolume", 0),
            "pe_ltp": pe.get("lastPrice", 0),
            "pe_oi": pe.get("openInterest", 0),
            "pe_chg_oi": pe.get("changeinOpenInterest", 0),
            "pe_iv": pe.get("impliedVolatility", 0),
            "pe_volume": pe.get("totalTradedVolume", 0),
        })

    # Keep strikes nearest to the spot price (ATM ± max_strikes)
    if underlying and parsed:
        parsed.sort(key=lambda r: abs((r["strike"] or 0) - underlying))
        atm = sorted(parsed[: max_strikes * 2 + 1], key=lambda r: r["strike"] or 0)
    else:
        atm = sorted(parsed, key=lambda r: r["strike"] or 0)

    total_ce_oi = sum(r["ce_oi"] for r in atm)
    total_pe_oi = sum(r["pe_oi"] for r in atm)
    pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi else 0

    return {
        "available": True,
        "underlying_value": underlying,
        "expiry": expiries[0] if expiries else None,
        "expiries": expiries[:8],
        "pcr": pcr,
        "strikes": atm,
    }


def get_option_chain(symbol: str = "NIFTY") -> dict:
    symbol = symbol.upper()
    if symbol not in _VALID:
        return {"available": False, "error": f"Unsupported index '{symbol}'",
                "supported": sorted(_VALID)}

    cached = _CACHE.get(symbol)
    if cached and (time.time() - cached[0]) < _CACHE_TTL:
        return cached[1]

    try:
        s = _get_session()
        url = f"https://www.nseindia.com/api/option-chain-indices?symbol={symbol}"
        resp = s.get(url, timeout=10)
        resp.raise_for_status()
        chain = _build_chain(resp.json())
        _CACHE[symbol] = (time.time(), chain)
        return chain
    except Exception as e:
        # Serve stale cache if we have it; otherwise a clear unavailable payload.
        if cached:
            stale = dict(cached[1])
            stale["stale"] = True
            return stale
        return {
            "available": False,
            "error": f"NSE option-chain unavailable ({type(e).__name__}). "
                     "NSE blocks many non-residential IPs; try from a home network.",
        }


def list_option_indices() -> list:
    return OPTION_INDICES

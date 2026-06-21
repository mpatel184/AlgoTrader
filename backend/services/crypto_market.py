import logging
import time
import requests
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

BASE_URL = "https://api.coingecko.com/api/v3"

# Simple in-memory TTL cache to stay under CoinGecko's free-tier rate limit.
_CACHE: dict = {}


def _cache_get(key: str, ttl: float):
    entry = _CACHE.get(key)
    if entry and (time.time() - entry[0]) < ttl:
        return entry[1]
    return None


def _cache_set(key: str, value):
    _CACHE[key] = (time.time(), value)


def _get_json(url: str, params: dict, timeout: int):
    resp = requests.get(url, params=params, timeout=timeout)
    resp.raise_for_status()
    return resp.json()

CRYPTO_LIST = [
    {"id": "bitcoin", "symbol": "BTC/USDT", "name": "Bitcoin"},
    {"id": "ethereum", "symbol": "ETH/USDT", "name": "Ethereum"},
    {"id": "solana", "symbol": "SOL/USDT", "name": "Solana"},
    {"id": "binancecoin", "symbol": "BNB/USDT", "name": "BNB"},
    {"id": "ripple", "symbol": "XRP/USDT", "name": "XRP"},
    {"id": "cardano", "symbol": "ADA/USDT", "name": "Cardano"},
    {"id": "avalanche-2", "symbol": "AVAX/USDT", "name": "Avalanche"},
    {"id": "polkadot", "symbol": "DOT/USDT", "name": "Polkadot"},
    {"id": "chainlink", "symbol": "LINK/USDT", "name": "Chainlink"},
    {"id": "matic-network", "symbol": "MATIC/USDT", "name": "Polygon"},
]

SYMBOL_TO_ID = {c["symbol"]: c["id"] for c in CRYPTO_LIST}
ID_TO_SYMBOL = {c["id"]: c["symbol"] for c in CRYPTO_LIST}
ID_TO_NAME = {c["id"]: c["name"] for c in CRYPTO_LIST}


def get_historical_data(coin_id: str, days: int = 180) -> list:
    cache_key = f"ohlc:{coin_id}:{days}"
    fresh = _cache_get(cache_key, ttl=900)  # 15 min — daily candles barely change
    if fresh is not None:
        return fresh
    try:
        url = f"{BASE_URL}/coins/{coin_id}/ohlc"
        params = {"vs_currency": "usd", "days": str(days)}
        raw = _get_json(url, params, timeout=15)
        result = []
        for item in raw:
            ts = item[0] // 1000
            dt = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
            result.append({
                "time": dt,
                "open": round(item[1], 4),
                "high": round(item[2], 4),
                "low": round(item[3], 4),
                "close": round(item[4], 4),
                "volume": 0,
            })
        # dedupe dates, keep last
        seen = {}
        for r in result:
            seen[r["time"]] = r
        out = sorted(seen.values(), key=lambda x: x["time"])
        _cache_set(cache_key, out)
        return out
    except Exception as e:
        logger.warning("CoinGecko OHLC error for %s: %s", coin_id, e)
        cached = _cache_get(cache_key, ttl=float("inf"))
        return cached if cached is not None else []


def get_price(coin_id: str) -> dict:
    cache_key = f"price:{coin_id}"
    fresh = _cache_get(cache_key, ttl=30)
    if fresh is not None:
        return fresh
    try:
        url = f"{BASE_URL}/coins/{coin_id}"
        params = {"localization": "false", "tickers": "false", "community_data": "false", "developer_data": "false"}
        data = _get_json(url, params, timeout=10)
        mkt = data.get("market_data", {})
        price = mkt.get("current_price", {}).get("usd", 0)
        change_24h = mkt.get("price_change_percentage_24h", 0)
        volume = mkt.get("total_volume", {}).get("usd", 0)
        high_24h = mkt.get("high_24h", {}).get("usd", 0)
        low_24h = mkt.get("low_24h", {}).get("usd", 0)
        out = {
            "symbol": ID_TO_SYMBOL.get(coin_id, coin_id),
            "name": ID_TO_NAME.get(coin_id, coin_id),
            "price": round(price, 4),
            "change": round(price * change_24h / 100, 4),
            "change_pct": round(change_24h or 0, 2),
            "volume": volume,
            "high": round(high_24h, 4),
            "low": round(low_24h, 4),
            "open": round(price - price * change_24h / 100, 4),
        }
        _cache_set(cache_key, out)
        return out
    except Exception as e:
        logger.warning("Error fetching price for %s: %s", coin_id, e)
        cached = _cache_get(cache_key, ttl=float("inf"))
        return cached if cached is not None else {}


def get_watchlist_quotes() -> list:
    cache_key = "watchlist"
    fresh = _cache_get(cache_key, ttl=30)
    if fresh is not None:
        return fresh
    try:
        ids = ",".join([c["id"] for c in CRYPTO_LIST[:10]])
        url = f"{BASE_URL}/simple/price"
        params = {
            "ids": ids,
            "vs_currencies": "usd",
            "include_24hr_change": "true",
            "include_24hr_vol": "true",
            "include_high_24h": "true",
            "include_low_24h": "true",
        }
        data = _get_json(url, params, timeout=15)
        results = []
        for coin in CRYPTO_LIST[:10]:
            cid = coin["id"]
            if cid in data:
                d = data[cid]
                price = d.get("usd", 0)
                change_pct = d.get("usd_24h_change", 0) or 0
                results.append({
                    "symbol": coin["symbol"],
                    "name": coin["name"],
                    "price": round(price, 4),
                    "change": round(price * change_pct / 100, 4),
                    "change_pct": round(change_pct, 2),
                    "volume": d.get("usd_24h_vol", 0),
                    "high": d.get("usd_24h_high", price),
                    "low": d.get("usd_24h_low", price),
                    "open": round(price / (1 + change_pct / 100), 4) if change_pct else price,
                })
        _cache_set(cache_key, results)
        return results
    except Exception as e:
        logger.warning("Error fetching crypto watchlist: %s", e)
        cached = _cache_get(cache_key, ttl=float("inf"))
        return cached if cached is not None else []


def symbol_to_id(symbol: str) -> Optional[str]:
    return SYMBOL_TO_ID.get(symbol)

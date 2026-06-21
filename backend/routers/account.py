import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_db
from security import encrypt

logger = logging.getLogger(__name__)

router = APIRouter()


class BrokerAccountCreate(BaseModel):
    broker: str
    market: str
    api_key: str
    api_secret: str
    client_id: Optional[str] = None


@router.get("/brokers")
def list_brokers():
    return {
        "indian": [
            {"id": "zerodha", "name": "Zerodha Kite", "logo": "Z", "color": "#387ed1",
             "features": ["Nifty 50", "F&O", "Commodities"], "setup_url": "https://kite.trade/docs/connect/v3/"},
            {"id": "angel", "name": "Angel One SmartAPI", "logo": "A", "color": "#e63b2e",
             "features": ["Stocks", "Options", "Futures"], "setup_url": "https://smartapi.angelbroking.com/"},
            {"id": "upstox", "name": "Upstox", "logo": "U", "color": "#5367ff",
             "features": ["NSE", "BSE", "F&O"], "setup_url": "https://upstox.com/developer/api-documentation/"},
            {"id": "fyers", "name": "Fyers", "logo": "F", "color": "#1a1a2e",
             "features": ["Stocks", "Options", "Algo"], "setup_url": "https://myapi.fyers.in/"},
        ],
        "crypto": [
            {"id": "binance", "name": "Binance", "logo": "B", "color": "#f0b90b",
             "features": ["Spot", "Futures", "Margin"], "setup_url": "https://www.binance.com/en/support/faq/api"},
            {"id": "wazirx", "name": "WazirX", "logo": "W", "color": "#3375bb",
             "features": ["INR Pairs", "Spot"], "setup_url": "https://docs.wazirx.com/"},
            {"id": "coindcx", "name": "CoinDCX", "logo": "C", "color": "#1a6fe6",
             "features": ["Spot", "Futures", "Staking"], "setup_url": "https://coindcx.com/trade/api"},
        ],
    }


@router.get("/connected")
def get_connected_accounts():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, broker, market, client_id, is_active, created_at FROM broker_accounts")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


@router.post("/connect")
def connect_broker(req: BrokerAccountCreate):
    conn = get_db()
    c = conn.cursor()
    # Encrypt secrets at rest; never expose them in responses (see /connected).
    c.execute("""INSERT INTO broker_accounts (broker, market, api_key, api_secret, client_id, is_active)
                 VALUES (?, ?, ?, ?, ?, 1)""",
              (req.broker, req.market, encrypt(req.api_key), encrypt(req.api_secret), req.client_id))
    account_id = c.lastrowid
    conn.commit()
    conn.close()
    return {"message": f"{req.broker} connected successfully", "id": account_id}


@router.delete("/disconnect/{account_id}")
def disconnect_broker(account_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM broker_accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    return {"message": "Account disconnected"}


@router.get("/signals/{strategy_key}")
def get_live_signals(strategy_key: str, market: str = "indian"):
    """Returns current strategy signals for popular symbols"""
    from services.strategy_engine import run_strategy
    from services import indian_market, crypto_market

    if market == "indian":
        symbols = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
                   "SBIN.NS", "WIPRO.NS", "BAJFINANCE.NS", "AXISBANK.NS", "MARUTI.NS"]
    else:
        from services.crypto_market import CRYPTO_LIST
        symbols = [c["symbol"] for c in CRYPTO_LIST[:8]]

    results = []
    for sym in symbols:
        try:
            if market == "indian":
                candles = indian_market.get_historical_data(sym, "1y", "1d")
            else:
                coin_id = crypto_market.symbol_to_id(sym)
                candles = crypto_market.get_historical_data(coin_id, 365) if coin_id else []

            if candles:
                sig = run_strategy(candles, strategy_key)
                if sig.get("signal") != "HOLD":
                    results.append({
                        "symbol": sym,
                        "signal": sig["signal"],
                        "price": sig["price"],
                        "stop_loss": sig["stop_loss"],
                        "target": sig["target"],
                        "strategy": sig.get("strategy", strategy_key),
                        "indicators": sig.get("indicators", {}),
                    })
        except Exception as e:
            logger.warning("Signal error for %s: %s", sym, e)

    return results

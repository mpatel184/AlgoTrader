from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services import indian_market, crypto_market
from services.backtest_engine import run_backtest

router = APIRouter()


class BacktestRequest(BaseModel):
    symbol: str
    market: str
    strategy: str
    period: str = "1y"
    initial_capital: float = 100000
    risk_per_trade: float = 0.01
    rr_ratio: float = 2.0
    sl_pct: float = 0.02


@router.post("/run")
def backtest_run(req: BacktestRequest):
    if req.market == "indian":
        if not indian_market.is_valid_symbol(req.symbol):
            raise HTTPException(status_code=400, detail=f"Invalid symbol: {req.symbol}")
        candles = indian_market.get_historical_data(req.symbol, req.period, "1d")
    elif req.market == "crypto":
        days_map = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730}
        days = days_map.get(req.period, 365)
        coin_id = crypto_market.symbol_to_id(req.symbol)
        if not coin_id:
            raise HTTPException(status_code=404, detail=f"Unknown crypto: {req.symbol}")
        candles = crypto_market.get_historical_data(coin_id, days)
    else:
        raise HTTPException(status_code=400, detail="market must be 'indian' or 'crypto'")

    if not candles:
        # Upstream data unavailable (e.g. provider rate-limit or an unknown
        # symbol returning empty) — 503, not 404, so it isn't mistaken for a
        # missing route and reads as retryable.
        raise HTTPException(
            status_code=503,
            detail=f"No price data available for {req.symbol}. The market data "
                   "provider may be rate-limiting or the symbol is unavailable; try again.")

    result = run_backtest(
        candles=candles,
        strategy_key=req.strategy,
        initial_capital=req.initial_capital,
        risk_per_trade=req.risk_per_trade,
        rr_ratio=req.rr_ratio,
        sl_pct=req.sl_pct,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.get("/strategies")
def list_strategies():
    return [
        {"key": "ema_crossover", "name": "EMA Crossover (20-50-200)", "market": "indian", "timeframe": "Daily",
         "description": "20 EMA crosses 50 EMA with 200 EMA trend filter", "success_rate": "65-70%"},
        {"key": "rsi_momentum", "name": "RSI Momentum (10)", "market": "indian", "timeframe": "Daily/4H",
         "description": "RSI crosses 30/70 levels with EMA confirmation", "success_rate": "60-65%"},
        {"key": "sr_breakout", "name": "S&R Breakout", "market": "indian", "timeframe": "Daily",
         "description": "Price breaks support/resistance with volume confirmation", "success_rate": "55-65%"},
        {"key": "gap_and_go", "name": "Gap and Go", "market": "indian", "timeframe": "Daily",
         "description": "Gap-up/gap-down with high volume momentum", "success_rate": "60-65%"},
        {"key": "crypto_trend_rsi", "name": "Crypto Trend + RSI", "market": "crypto", "timeframe": "4H/Daily",
         "description": "200 EMA trend + S/R zones + RSI confirmation", "success_rate": "60-70%"},
        {"key": "crypto_ema_trend", "name": "Crypto EMA Trend", "market": "crypto", "timeframe": "4H/Daily",
         "description": "20+50 EMA trend following with RSI filter", "success_rate": "60-65%"},
        {"key": "crypto_breakout", "name": "Crypto Breakout", "market": "crypto", "timeframe": "4H",
         "description": "Breakout from consolidation with volume spike", "success_rate": "55-60%"},
        {"key": "rsi_divergence", "name": "RSI Divergence", "market": "both", "timeframe": "1H/4H",
         "description": "Bullish/bearish divergence between price and RSI", "success_rate": "55-65%"},
    ]

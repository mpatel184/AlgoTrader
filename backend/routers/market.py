from fastapi import APIRouter, HTTPException, Query
from services import indian_market, crypto_market, options_chain

router = APIRouter()


@router.get("/indian/candles")
def indian_candles(symbol: str = Query(...), period: str = Query("6mo"), interval: str = Query("1d")):
    if not indian_market.is_valid_symbol(symbol):
        raise HTTPException(status_code=400, detail=f"Invalid symbol: {symbol}")
    data = indian_market.get_historical_data(symbol, period, interval)
    if not data:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    return {"symbol": symbol, "data": data}


@router.get("/indian/quote")
def indian_quote(symbol: str = Query(...)):
    if not indian_market.is_valid_symbol(symbol):
        raise HTTPException(status_code=400, detail=f"Invalid symbol: {symbol}")
    data = indian_market.get_quote(symbol)
    if not data:
        raise HTTPException(status_code=404, detail=f"No quote for {symbol}")
    return data


@router.get("/indian/watchlist")
def indian_watchlist():
    return indian_market.get_watchlist_quotes()


@router.get("/indian/indices")
def indian_indices():
    """Live spot quotes for Nifty 50, Bank Nifty, Sensex, etc."""
    return indian_market.get_index_quotes()


@router.get("/indian/option-chain")
def indian_option_chain(symbol: str = Query("NIFTY")):
    """Best-effort NSE index option chain (may be unavailable from some networks)."""
    return options_chain.get_option_chain(symbol)


@router.get("/indian/option-indices")
def indian_option_indices():
    return options_chain.list_option_indices()


@router.get("/indian/search")
def indian_search(q: str = Query(...)):
    return indian_market.search_symbols(q)


@router.get("/crypto/candles")
def crypto_candles(symbol: str = Query(...), days: int = Query(180)):
    coin_id = crypto_market.symbol_to_id(symbol)
    if not coin_id:
        raise HTTPException(status_code=404, detail=f"Unknown crypto symbol: {symbol}")
    data = crypto_market.get_historical_data(coin_id, days)
    if not data:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    return {"symbol": symbol, "data": data}


@router.get("/crypto/quote")
def crypto_quote(symbol: str = Query(...)):
    coin_id = crypto_market.symbol_to_id(symbol)
    if not coin_id:
        raise HTTPException(status_code=404, detail=f"Unknown crypto symbol: {symbol}")
    data = crypto_market.get_price(coin_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"No price for {symbol}")
    return data


@router.get("/crypto/watchlist")
def crypto_watchlist():
    return crypto_market.get_watchlist_quotes()


@router.get("/crypto/list")
def crypto_list():
    return crypto_market.CRYPTO_LIST

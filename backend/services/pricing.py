"""Server-side live price resolution (C3).

Fills must be priced by the server, never by the client (the browser previously
sent its own fill price — unrealistic and exploitable). The trading router uses
this to resolve the current market price for a symbol at order time.
"""
import logging
from typing import Optional

from services import indian_market, crypto_market

logger = logging.getLogger(__name__)


def get_live_price(symbol: str, market: str) -> Optional[float]:
    """Current market price for (symbol, market), or None if unavailable."""
    try:
        if market == "crypto":
            coin_id = crypto_market.symbol_to_id(symbol)
            if not coin_id:
                return None
            quote = crypto_market.get_price(coin_id)
        else:  # indian stocks / indices
            quote = indian_market.get_quote(symbol)
        price = quote.get("price") if quote else None
        return float(price) if price else None
    except Exception as e:
        logger.warning("Live price lookup failed for %s (%s): %s", symbol, market, e)
        return None

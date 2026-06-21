"""Market-hours gate (H3b).

When the Indian market is closed, the data providers still return the last
close, so a bot would otherwise keep "trading" on a stale price every tick and
corrupt the equity curve overnight/weekends. Bots consult this before acting.

Crypto trades 24/7. NSE/BSE trade Mon–Fri 09:15–15:30 IST. Exchange holidays are
not modeled here (a known limitation) — the weekday + session-time check covers
the common case.
"""
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

_SESSION_OPEN = (9, 15)
_SESSION_CLOSE = (15, 30)


def is_market_open(market: str, now: datetime | None = None) -> bool:
    """True if `market` is currently tradable."""
    if market == "crypto":
        return True

    now = now or datetime.now(IST)
    if now.tzinfo is None:
        now = now.replace(tzinfo=IST)
    now = now.astimezone(IST)

    if now.weekday() >= 5:  # Saturday/Sunday
        return False

    open_t = now.replace(hour=_SESSION_OPEN[0], minute=_SESSION_OPEN[1], second=0, microsecond=0)
    close_t = now.replace(hour=_SESSION_CLOSE[0], minute=_SESSION_CLOSE[1], second=0, microsecond=0)
    return open_t <= now <= close_t

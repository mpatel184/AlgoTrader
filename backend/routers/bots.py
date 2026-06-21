from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_db
from services import bot_engine
from auth import get_current_user, owns_portfolio

router = APIRouter()


class BotCreate(BaseModel):
    portfolio_id: int
    name: str
    symbol: str
    market: str
    strategy: str
    quantity: float
    sl_pct: float = 0.02
    rr_ratio: float = 2.0
    interval_seconds: int = 60


class BotUpdate(BaseModel):
    name: Optional[str] = None
    symbol: Optional[str] = None
    strategy: Optional[str] = None
    quantity: Optional[float] = None
    sl_pct: Optional[float] = None
    rr_ratio: Optional[float] = None
    interval_seconds: Optional[int] = None


def _get_bot_or_404(c, bot_id: int, user_id: int):
    c.execute("SELECT * FROM bots WHERE id = ?", (bot_id,))
    bot = c.fetchone()
    # 404 (not 403) when the bot belongs to another user, to avoid leaking existence.
    if not bot or not owns_portfolio(c, bot["portfolio_id"], user_id):
        raise HTTPException(status_code=404, detail="Bot not found")
    return dict(bot)


@router.get("")
def list_bots(portfolio_id: Optional[int] = None,
              current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    # Scope to bots whose portfolio is owned by the acting user.
    if portfolio_id is not None:
        c.execute("""SELECT b.* FROM bots b JOIN portfolios p ON b.portfolio_id = p.id
                     WHERE b.portfolio_id = ? AND p.user_id = ?
                     ORDER BY b.created_at DESC""", (portfolio_id, current_user["id"]))
    else:
        c.execute("""SELECT b.* FROM bots b JOIN portfolios p ON b.portfolio_id = p.id
                     WHERE p.user_id = ? ORDER BY b.created_at DESC""", (current_user["id"],))
    bots = [dict(r) for r in c.fetchall()]
    conn.close()
    return bots


@router.post("")
def create_bot(body: BotCreate, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    if not owns_portfolio(c, body.portfolio_id, current_user["id"]):
        conn.close()
        raise HTTPException(status_code=404, detail="Portfolio not found")
    c.execute(
        """INSERT INTO bots (portfolio_id, name, symbol, market, strategy, quantity,
                             sl_pct, rr_ratio, interval_seconds, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped')""",
        (body.portfolio_id, body.name, body.symbol, body.market, body.strategy,
         body.quantity, body.sl_pct, body.rr_ratio, body.interval_seconds),
    )
    bot_id = c.lastrowid
    conn.commit()
    bot = _get_bot_or_404(c, bot_id, current_user["id"])
    conn.close()
    return bot


@router.put("/{bot_id}")
def update_bot(bot_id: int, body: BotUpdate,
               current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    _get_bot_or_404(c, bot_id, current_user["id"])
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if fields:
        sets = ", ".join(f"{k} = ?" for k in fields)
        c.execute(f"UPDATE bots SET {sets} WHERE id = ?", (*fields.values(), bot_id))
        conn.commit()
    bot = _get_bot_or_404(c, bot_id, current_user["id"])
    conn.close()
    return bot


@router.post("/{bot_id}/start")
def start_bot(bot_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    _get_bot_or_404(c, bot_id, current_user["id"])
    c.execute("UPDATE bots SET status = 'running' WHERE id = ?", (bot_id,))
    c.execute("INSERT INTO bot_logs (bot_id, action, message) VALUES (?, 'INFO', 'Bot started')", (bot_id,))
    conn.commit()
    conn.close()
    return {"message": "Bot started", "status": "running"}


@router.post("/{bot_id}/stop")
def stop_bot(bot_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    _get_bot_or_404(c, bot_id, current_user["id"])
    c.execute("UPDATE bots SET status = 'stopped' WHERE id = ?", (bot_id,))
    c.execute("INSERT INTO bot_logs (bot_id, action, message) VALUES (?, 'INFO', 'Bot stopped')", (bot_id,))
    conn.commit()
    conn.close()
    return {"message": "Bot stopped", "status": "stopped"}


@router.post("/{bot_id}/run-once")
def run_once(bot_id: int, current_user: dict = Depends(get_current_user)):
    """Trigger a single decision cycle immediately (useful for testing)."""
    conn = get_db()
    c = conn.cursor()
    _get_bot_or_404(c, bot_id, current_user["id"])
    conn.close()
    return bot_engine.run_bot_once(bot_id)


@router.get("/{bot_id}/logs")
def bot_logs(bot_id: int, limit: int = 100,
             current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    _get_bot_or_404(c, bot_id, current_user["id"])
    c.execute("SELECT * FROM bot_logs WHERE bot_id = ? ORDER BY created_at DESC LIMIT ?", (bot_id, limit))
    logs = [dict(r) for r in c.fetchall()]
    conn.close()
    return logs


@router.delete("/{bot_id}")
def delete_bot(bot_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    c = conn.cursor()
    _get_bot_or_404(c, bot_id, current_user["id"])
    c.execute("DELETE FROM bot_logs WHERE bot_id = ?", (bot_id,))
    c.execute("DELETE FROM bots WHERE id = ?", (bot_id,))
    conn.commit()
    conn.close()
    return {"message": "Bot deleted"}

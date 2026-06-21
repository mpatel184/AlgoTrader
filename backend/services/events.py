"""Live event bus + WebSocket fan-out (M3).

Replaces frontend polling with server push. Manual orders and background bot
trades publish small "something changed" events; connected WebSocket clients
receive them and refresh the affected data.

Threading note: FastAPI sync endpoints and the bot scheduler run in worker
threads, not the asyncio loop. `publish()` is therefore thread-safe — it
schedules the broadcast coroutine onto the captured main loop via
`run_coroutine_threadsafe`. The loop reference is set once at startup.
"""
import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._connections: set = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, websocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(self, websocket) -> None:
        self._connections.discard(websocket)

    async def _broadcast(self, message: dict) -> None:
        for ws in list(self._connections):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(ws)

    def publish(self, event_type: str, **data: Any) -> None:
        """Thread-safe: enqueue a broadcast on the main loop. No-op if no loop
        (e.g. in unit tests that don't start the app) or no listeners."""
        if self._loop is None or not self._connections:
            return
        message = {"type": event_type, **data}
        try:
            asyncio.run_coroutine_threadsafe(self._broadcast(message), self._loop)
        except RuntimeError:
            logger.debug("event loop not running; dropping event %s", event_type)


manager = ConnectionManager()


def publish_portfolio_update(portfolio_id: int, **extra: Any) -> None:
    """Convenience: signal that a portfolio's positions/trades/balance changed."""
    manager.publish("portfolio_update", portfolio_id=portfolio_id, **extra)

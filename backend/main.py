import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from database import create_tables
from logging_config import setup_logging, get_logger
from routers import market, trading, backtest, account, bots, auth
from services import bot_engine
from services.events import manager as ws_manager

setup_logging()
logger = get_logger(__name__)

app = FastAPI(title="AlgoTrader - Paper Trading Platform", version="1.0.0", docs_url="/docs")

# Pin CORS origins. "*" with allow_credentials=True is rejected by browsers and
# blocks the credentialed (auth) requests coming in Phase 1. Override the dev
# default with a comma-separated CORS_ORIGINS env var in other environments.
_DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    create_tables()
    # Capture the running loop so worker threads (sync endpoints, bot scheduler)
    # can publish events onto it (M3).
    ws_manager.set_loop(asyncio.get_running_loop())
    bot_engine.start_scheduler()
    logger.info("AlgoTrader API started; bot scheduler running")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Live updates channel. The server pushes events; inbound frames are
    ignored (used only to keep the socket open / detect disconnect)."""
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(market.router, prefix="/api/market", tags=["Market Data"])
app.include_router(trading.router, prefix="/api/trading", tags=["Paper Trading"])
app.include_router(backtest.router, prefix="/api/backtest", tags=["Backtesting"])
app.include_router(account.router, prefix="/api/account", tags=["Account"])
app.include_router(bots.router, prefix="/api/bots", tags=["Auto-Trading Bots"])


@app.get("/")
def root():
    return {"message": "AlgoTrader API", "version": "1.0.0", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "healthy"}

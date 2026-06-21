# AlgoTrader

Full-stack **paper-trading platform** for Indian stocks & crypto — FastAPI + React, with 8 strategies, backtesting, and auto-trading bots.

AlgoTrader simulates trading for **Indian stocks (NSE via yfinance)** and **crypto (CoinGecko)**. All execution is paper-only against a local SQLite database — there is **no real-money trading**. Two portfolios are seeded out of the box: Indian (₹5,00,000) and Crypto ($10,000).

## Features

- 📈 **Live charts** — candlestick charts with EMA overlays and buy/sell signal markers
- 🧠 **8 strategies** — EMA crossover, RSI momentum, support/resistance breakout, gap-and-go, and crypto-specific trend/breakout strategies
- 🧪 **Backtesting** — replay any strategy over historical data with equity curve, win rate, and trade log
- 🤖 **Auto-trading bots** — background scheduler that opens/closes paper positions on live signals with stop-loss / take-profit
- 📊 **Trade history** — unified log of every manual and bot trade, with P&L, filters, and CSV export
- 🔎 **Signal research** — scan all strategies at once and rank symbols by multi-strategy confluence
- 🇮🇳 **Indian indices** — Nifty 50, Bank Nifty, Sensex, Nifty IT, and more
- 🎨 **Premium dark UI** — glassmorphism, Framer Motion animations, responsive layout

## Tech stack

| Layer | Stack |
|-------|-------|
| Backend | Python · FastAPI · SQLite · yfinance · CoinGecko |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · zustand · lightweight-charts · Framer Motion |

## Getting started

The repo targets Windows/PowerShell. Two helper scripts at the root install dependencies and start each side:

```powershell
.\start_backend.ps1    # pip install + uvicorn on http://localhost:8000  (API docs at /docs)
.\start_frontend.ps1   # npm install (if needed) + vite dev on http://localhost:5173
```

Manual equivalents:

```bash
# Backend (run from backend/)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (run from frontend/)
npm run dev        # vite dev server, proxies /api -> :8000
npm run build      # type-check + production build
npm run preview
```

> **Note:** Indian market data needs **yfinance ≥ 1.4.1** (now pinned as `yfinance>=1.4.1`). Older `0.2.x` releases return empty data for `.NS` tickers, which surfaces as "No price data available" on charts/quotes/backtests.

## Architecture

### Request flow
React pages → `frontend/src/api/index.ts` (single axios instance, `baseURL: '/api'`) → Vite proxy → FastAPI routers (`/api/*`). The frontend never calls `localhost:8000` directly; it relies on the Vite proxy in `vite.config.ts`. State lives in `frontend/src/store/useStore.ts` (zustand) — primarily `activeMarket` (`'indian' | 'crypto'`), which drives currency symbols (₹ vs $) and which market's data/portfolio is shown.

### Backend (`backend/`)
- `main.py` — app factory; on startup calls `create_tables()` then `bot_engine.start_scheduler()`. Mounts 5 routers under `/api/{market,trading,backtest,account,bots}`.
- `database.py` — SQLite at `backend/trading.db`. `create_tables()` is idempotent and also runs lightweight migrations (`PRAGMA table_info` + `ALTER TABLE`), and seeds the two default portfolios if none exist.
- `routers/` — thin HTTP layer; each handler opens its own connection via `get_db()` and runs raw SQL (no ORM).
- `services/`:
  - `strategy_engine.py` — all strategies as pure `df -> df` functions that set a `signal` column (1/-1/0), dispatched through `STRATEGY_MAP`. `run_strategy(candles, key)` is the single entry point. *To add a strategy: write the function, register it in `STRATEGY_MAP`, and add metadata in the backtest router's strategy list.*
  - `indian_market.py` / `crypto_market.py` — data providers. Crypto uses CoinGecko coin-ids and a TTL cache that serves stale data on rate-limit (429).
  - `backtest_engine.py` — replays a strategy over historical candles; returns summary stats + equity curve + trade log.
  - `bot_engine.py` — background asyncio scheduler (15s tick) that runs each bot on its own interval.
  - `options_chain.py` — best-effort NSE option chain; fails gracefully when unavailable.

### Paper trading is one shared ledger
Manual orders (`routers/trading.py`) and bot orders (`services/bot_engine.py`) write to the **same `trades` + `positions` + `portfolio_history` tables**. A trade row's `source` column (`'manual'` vs `'bot'`) and `bot_id` distinguish them, and the Trade History page filters/badges on this.

### Frontend (`frontend/src/`)
- Pages in `pages/`, routed in `App.tsx` (wrapped in `AnimatePresence` for page transitions). Sidebar nav grouped Trade / Analyze / Automate.
- Dark theme via Tailwind + custom utilities in `index.css` (`.card`, `.glass`/`.glass-card`, `.app-bg`). Reusable animation variants in `components/common/PageTransition.tsx`.
- Shared TypeScript types live in `src/api/index.ts` alongside the API methods.

## Gotchas

- **yfinance version** — requires **≥ 1.4.1** (pinned); older `0.2.x` returns empty data for `.NS` tickers.
- **CoinGecko rate limits (429)** — the crypto provider caches and serves stale data on error; transient old/empty crypto data is usually this, not a bug.
- **Seeded portfolios** — the app assumes portfolio id 1 = indian, id 2 = crypto. Deleting `trading.db` regenerates them on next startup.

## Disclaimer

AlgoTrader is for **education and simulation only**. It does not place real orders and is not financial advice. Strategy signals are rule-based and provided as-is.

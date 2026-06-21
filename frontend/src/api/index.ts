import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 30000 })

// ─── Market ─────────────────────────────────────────────────────────────────
export const marketAPI = {
  indianCandles: (symbol: string, period = '6mo', interval = '1d') =>
    api.get('/market/indian/candles', { params: { symbol, period, interval } }),
  indianQuote: (symbol: string) =>
    api.get('/market/indian/quote', { params: { symbol } }),
  indianWatchlist: () => api.get('/market/indian/watchlist'),
  indianIndices: () => api.get('/market/indian/indices'),
  indianSearch: (q: string) => api.get('/market/indian/search', { params: { q } }),
  optionChain: (symbol = 'NIFTY') => api.get('/market/indian/option-chain', { params: { symbol } }),
  optionIndices: () => api.get('/market/indian/option-indices'),

  cryptoCandles: (symbol: string, days = 180) =>
    api.get('/market/crypto/candles', { params: { symbol, days } }),
  cryptoQuote: (symbol: string) =>
    api.get('/market/crypto/quote', { params: { symbol } }),
  cryptoWatchlist: () => api.get('/market/crypto/watchlist'),
  cryptoList: () => api.get('/market/crypto/list'),
}

// ─── Trading ─────────────────────────────────────────────────────────────────
export const tradingAPI = {
  getPortfolios: () => api.get('/trading/portfolios'),
  getPortfolio: (id: number) => api.get(`/trading/portfolio/${id}`),
  getPositions: (id: number) => api.get(`/trading/positions/${id}`),
  getTrades: (id: number) => api.get<Trade[]>(`/trading/trades/${id}`),
  buy: (data: BuyOrderPayload) => api.post('/trading/buy', data),
  sell: (data: { position_id: number; price?: number }) => api.post('/trading/sell', data),
  resetPortfolio: (id: number) => api.post(`/trading/portfolio/reset/${id}`),
}

// ─── Backtest ────────────────────────────────────────────────────────────────
export const backtestAPI = {
  run: (data: BacktestPayload) => api.post('/backtest/run', data),
  strategies: () => api.get('/backtest/strategies'),
}

// ─── Auto-Trading Bots ───────────────────────────────────────────────────────
export const botsAPI = {
  list: (portfolioId?: number) =>
    api.get('/bots', { params: portfolioId != null ? { portfolio_id: portfolioId } : {} }),
  create: (data: BotCreatePayload) => api.post('/bots', data),
  update: (id: number, data: Partial<BotCreatePayload>) => api.put(`/bots/${id}`, data),
  start: (id: number) => api.post(`/bots/${id}/start`),
  stop: (id: number) => api.post(`/bots/${id}/stop`),
  runOnce: (id: number) => api.post(`/bots/${id}/run-once`),
  logs: (id: number, limit = 50) => api.get(`/bots/${id}/logs`, { params: { limit } }),
  remove: (id: number) => api.delete(`/bots/${id}`),
}

// ─── Account ─────────────────────────────────────────────────────────────────
export const accountAPI = {
  brokers: () => api.get('/account/brokers'),
  connected: () => api.get('/account/connected'),
  connect: (data: BrokerPayload) => api.post('/account/connect', data),
  disconnect: (id: number) => api.delete(`/account/disconnect/${id}`),
  liveSignals: (strategyKey: string, market: string) =>
    api.get(`/account/signals/${strategyKey}`, { params: { market } }),
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface Candle {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Quote {
  symbol: string
  name: string
  price: number
  change: number
  change_pct: number
  volume: number
  high: number
  low: number
  open: number
}

export interface Portfolio {
  id: number
  name: string
  market: 'indian' | 'crypto'
  initial_balance: number
  current_balance: number
  created_at: string
  positions?: Position[]
  trades?: Trade[]
  history?: { value: number; timestamp: string }[]
  total_pnl?: number
}

export interface Position {
  id: number
  portfolio_id: number
  symbol: string
  market: string
  quantity: number
  avg_price: number
  current_price: number
  stop_loss?: number
  take_profit?: number
  strategy?: string
  opened_at: string
}

export interface Trade {
  id: number
  portfolio_id: number
  symbol: string
  market: string
  trade_type: 'BUY' | 'SELL'
  quantity: number
  price: number
  total_value: number
  strategy?: string
  status: 'open' | 'closed'
  close_price?: number
  pnl?: number
  source?: 'manual' | 'bot'
  bot_id?: number
  created_at: string
  closed_at?: string
}

export interface Strategy {
  key: string
  name: string
  market: string
  timeframe: string
  description: string
  success_rate: string
}

export interface BacktestSummary {
  initial_capital: number
  final_value: number
  total_return: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  avg_win: number
  avg_loss: number
  profit_factor: number
  max_drawdown: number
  sharpe_ratio: number
  // Added in the H1 realism pass (optional for backward compatibility):
  cagr?: number
  sortino_ratio?: number
  calmar_ratio?: number
  max_consecutive_losses?: number
  exposure_pct?: number
}

export interface BacktestResult {
  summary: BacktestSummary
  gross?: BacktestSummary
  costs?: { total_costs: number; commission_bps: number; slippage_bps: number }
  trades: BacktestTrade[]
  equity_curve: { time: string; value: number }[]
}

export interface BacktestTrade {
  entry_date: string
  exit_date: string
  side: string
  entry_price: number
  exit_price: number
  qty: number
  pnl: number
  pnl_pct: number
  exit_reason: string
  gross_pnl?: number
  costs?: number
}

export interface BuyOrderPayload {
  portfolio_id: number
  symbol: string
  market: string
  quantity: number
  price: number
  stop_loss?: number
  take_profit?: number
  strategy?: string
}

export interface BacktestPayload {
  symbol: string
  market: string
  strategy: string
  period: string
  initial_capital: number
  risk_per_trade: number
  rr_ratio: number
  sl_pct: number
}

export interface BrokerPayload {
  broker: string
  market: string
  api_key: string
  api_secret: string
  client_id?: string
}

export interface Bot {
  id: number
  portfolio_id: number
  name: string
  symbol: string
  market: 'indian' | 'crypto'
  strategy: string
  quantity: number
  sl_pct: number
  rr_ratio: number
  interval_seconds: number
  status: 'running' | 'stopped'
  last_run?: string
  last_signal?: string
  message?: string
  created_at: string
}

export interface BotLog {
  id: number
  bot_id: number
  action: string
  message?: string
  price?: number
  pnl?: number
  created_at: string
}

export interface BotCreatePayload {
  portfolio_id: number
  name: string
  symbol: string
  market: string
  strategy: string
  quantity: number
  sl_pct: number
  rr_ratio: number
  interval_seconds: number
}

export default api

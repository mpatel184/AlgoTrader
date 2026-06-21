import { useEffect, useState, useCallback } from 'react'
import { Search, RefreshCw, ChevronDown } from 'lucide-react'
import { marketAPI, tradingAPI, backtestAPI, accountAPI, Candle, Quote, Position, Trade, Portfolio, Strategy } from '../api'
import { useStore } from '../store/useStore'
import CandleChart from '../components/Charts/CandleChart'
import OrderPanel from '../components/Trading/OrderPanel'
import PositionsTable from '../components/Trading/PositionsTable'

const PERIODS = [{ label: '1M', value: '1mo' }, { label: '3M', value: '3mo' }, { label: '6M', value: '6mo' }, { label: '1Y', value: '1y' }]
const INDIAN_SYMS = ['RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','SBIN.NS','WIPRO.NS','BAJFINANCE.NS','AXISBANK.NS','MARUTI.NS','LT.NS','TATAMOTORS.NS']
const CRYPTO_SYMS = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT','AVAX/USDT','LINK/USDT','MATIC/USDT']

export default function Trading() {
  const { activeMarket, selectedSymbol, setSelectedSymbol, eventTick } = useStore()
  const currency = activeMarket === 'indian' ? '₹' : '$'

  const [candles, setCandles] = useState<Candle[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [period, setPeriod] = useState('6mo')
  const [strategy, setStrategy] = useState('ema_crossover')
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [signals, setSignals] = useState<any>({})
  const [tab, setTab] = useState<'chart' | 'positions' | 'history'>('chart')
  const [loading, setLoading] = useState(false)
  const [showSymbols, setShowSymbols] = useState(false)
  const [indices, setIndices] = useState<{ symbol: string; name: string }[]>([])
  // Resolved from the API by market rather than assuming seeded ids 1/2 (M5).
  const [portfolioId, setPortfolioId] = useState<number | null>(null)

  const syms = activeMarket === 'indian' ? INDIAN_SYMS : CRYPTO_SYMS

  // Friendly label: indices show their name (e.g. "Nifty 50"), stocks drop the .NS suffix
  const indexNames = Object.fromEntries(indices.map((i) => [i.symbol, i.name]))
  const symbolLabel = (s: string) => indexNames[s] || s.replace('.NS', '')

  const loadChartData = useCallback(async () => {
    setLoading(true)
    try {
      const [candleRes, quoteRes] = await Promise.all([
        activeMarket === 'indian'
          ? marketAPI.indianCandles(selectedSymbol, period)
          : marketAPI.cryptoCandles(selectedSymbol, period === '1mo' ? 30 : period === '3mo' ? 90 : period === '6mo' ? 180 : 365),
        activeMarket === 'indian' ? marketAPI.indianQuote(selectedSymbol) : marketAPI.cryptoQuote(selectedSymbol),
      ])
      setCandles(candleRes.data.data || [])
      setQuote(quoteRes.data)
    } catch {}
    setLoading(false)
  }, [activeMarket, selectedSymbol, period])

  const loadPortfolio = useCallback(async () => {
    if (portfolioId == null) return
    try {
      const [portRes, posRes, tradeRes] = await Promise.all([
        tradingAPI.getPortfolio(portfolioId),
        tradingAPI.getPositions(portfolioId),
        tradingAPI.getTrades(portfolioId),
      ])
      setPortfolio(portRes.data)
      setPositions(posRes.data)
      setTrades(tradeRes.data)
    } catch {}
  }, [portfolioId])

  // Resolve which portfolio backs the active market (M5).
  useEffect(() => {
    setPortfolioId(null)
    tradingAPI.getPortfolios()
      .then(r => {
        const pf = (r.data as Portfolio[]).find(p => p.market === activeMarket)
        setPortfolioId(pf ? pf.id : null)
      })
      .catch(() => setPortfolioId(null))
  }, [activeMarket])

  useEffect(() => {
    backtestAPI.strategies().then(r => {
      setStrategies(r.data)
      setStrategy(activeMarket === 'indian' ? 'ema_crossover' : 'crypto_trend_rsi')
    }).catch(() => {})
  }, [activeMarket])

  useEffect(() => {
    if (activeMarket === 'indian') {
      marketAPI.indianIndices()
        .then(r => setIndices(r.data.map((q: any) => ({ symbol: q.symbol, name: q.name }))))
        .catch(() => setIndices([]))
    } else {
      setIndices([])
    }
  }, [activeMarket])

  useEffect(() => { loadChartData(); loadPortfolio() }, [loadChartData, loadPortfolio])

  // Live updates (M3): refetch portfolio when the server signals a change.
  useEffect(() => { if (eventTick) loadPortfolio() }, [eventTick, loadPortfolio])

  const runStrategy = async () => {
    if (!candles.length) return
    try {
      const res = await accountAPI.liveSignals(strategy, activeMarket)
      const found = res.data.find((s: any) => s.symbol === selectedSymbol)
      setSignals(found || {})
    } catch {}
  }

  const indicators = {
    ema20: candles.map(c => ({ time: c.time, value: (c as any).ema20 })).filter(d => d.value),
    ema50: candles.map(c => ({ time: c.time, value: (c as any).ema50 })).filter(d => d.value),
    ema200: candles.map(c => ({ time: c.time, value: (c as any).ema200 })).filter(d => d.value),
  }

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Symbol Picker */}
        <div className="relative">
          <button
            onClick={() => setShowSymbols(!showSymbols)}
            className="flex items-center gap-2 bg-[#161a24] border border-[#1e2235] rounded-lg px-3 py-2 text-sm font-semibold text-white hover:border-indigo-500/40 transition-colors"
          >
            {symbolLabel(selectedSymbol)}
            <ChevronDown size={12} className="text-gray-500" />
          </button>
          {showSymbols && (
            <div className="absolute top-full mt-1 left-0 bg-[#161a24] border border-[#1e2235] rounded-xl overflow-hidden z-20 shadow-2xl min-w-[180px] max-h-80 overflow-y-auto">
              {activeMarket === 'indian' && indices.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-600 sticky top-0 bg-[#161a24]">Indices</div>
                  {indices.map(idx => (
                    <button key={idx.symbol} onClick={() => { setSelectedSymbol(idx.symbol); setShowSymbols(false) }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-[#1e2235] transition-colors ${selectedSymbol === idx.symbol ? 'text-indigo-400' : 'text-gray-300'}`}>
                      {idx.name}
                    </button>
                  ))}
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-600 border-t border-[#1e2235] mt-1">Stocks</div>
                </>
              )}
              {syms.map(s => (
                <button key={s} onClick={() => { setSelectedSymbol(s); setShowSymbols(false) }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[#1e2235] transition-colors ${selectedSymbol === s ? 'text-indigo-400' : 'text-gray-300'}`}>
                  {s.replace('.NS', '')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quote */}
        {quote && (
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold font-mono text-white">
              {currency}{quote.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className={`text-sm font-semibold ${quote.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {quote.change_pct >= 0 ? '+' : ''}{quote.change_pct.toFixed(2)}%
            </span>
            <span className="text-xs text-gray-600">H: {currency}{quote.high} · L: {currency}{quote.low}</span>
          </div>
        )}

        {/* Period */}
        <div className="flex items-center gap-1 ml-auto">
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${period === p.value ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-[#1e2235]'}`}>
              {p.label}
            </button>
          ))}
          <button onClick={loadChartData} disabled={loading} className="ml-1 btn-ghost p-1.5">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Chart + Tabs */}
        <div className="xl:col-span-3 space-y-3">
          {/* Strategy bar */}
          <div className="card flex items-center gap-3 py-3">
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <span className="text-xs text-gray-500">Strategy:</span>
              <select className="select py-1 text-xs w-auto"
                value={strategy} onChange={e => setStrategy(e.target.value)}>
                {strategies.filter(s => s.market === activeMarket || s.market === 'both').map(s => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
              <button onClick={runStrategy} className="btn-primary py-1 px-3 text-xs">Scan Signal</button>
            </div>
            {signals.signal && (
              <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border ${
                signals.signal === 'BUY' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                {signals.signal} · SL: {currency}{signals.stop_loss?.toFixed(2)} · Target: {currency}{signals.target?.toFixed(2)}
              </div>
            )}
          </div>

          {/* Chart */}
          <div className="card p-0 overflow-hidden">
            <CandleChart candles={candles} height={420} />
          </div>

          {/* Indicator Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-yellow-400" /><span className="text-gray-500">EMA 20</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-purple-400" /><span className="text-gray-500">EMA 50</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-indigo-400" /><span className="text-gray-500">EMA 200</span></div>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full" /><span className="text-gray-500">BUY signal</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full" /><span className="text-gray-500">SELL signal</span></div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-[#1e2235] pb-0">
            {(['chart', 'positions', 'history'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-medium capitalize transition-all border-b-2 -mb-px ${
                  tab === t ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-white'}`}>
                {t} {t === 'positions' ? `(${positions.length})` : t === 'history' ? `(${trades.length})` : ''}
              </button>
            ))}
          </div>

          {tab === 'positions' && (
            <PositionsTable positions={positions} currency={currency} onSell={loadPortfolio} />
          )}
          {tab === 'history' && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-4">Trade History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-[#1e2235]">
                    {['Type','Symbol','Qty','Price','Total','P&L','Strategy','Date'].map(h => (
                      <th key={h} className="text-left text-gray-500 font-medium py-2 pr-4">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {trades.map(t => (
                      <tr key={t.id} className="table-row">
                        <td className="py-2 pr-4"><span className={t.trade_type === 'BUY' ? 'badge-buy' : 'badge-sell'}>{t.trade_type}</span></td>
                        <td className="py-2 pr-4 text-white font-semibold">{t.symbol.replace('.NS', '')}</td>
                        <td className="py-2 pr-4 font-mono text-gray-300">{t.quantity}</td>
                        <td className="py-2 pr-4 font-mono text-gray-300">{currency}{t.price.toFixed(2)}</td>
                        <td className="py-2 pr-4 font-mono text-gray-300">{currency}{t.total_value.toFixed(2)}</td>
                        <td className={`py-2 pr-4 font-mono font-semibold ${!t.pnl ? 'text-gray-600' : t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}${currency}${t.pnl.toFixed(2)}` : '–'}
                        </td>
                        <td className="py-2 pr-4 text-indigo-400 text-[10px]">{t.strategy || '–'}</td>
                        <td className="py-2 pr-4 text-gray-500 font-mono">{t.created_at?.slice(0, 10)}</td>
                      </tr>
                    ))}
                    {!trades.length && <tr><td colSpan={8} className="py-6 text-center text-gray-600">No trades yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Order Panel */}
        <div>
          {portfolioId != null ? (
            <OrderPanel
              symbol={selectedSymbol}
              currentPrice={quote?.price || 0}
              portfolioId={portfolioId}
              balance={portfolio?.current_balance || 0}
              currency={currency}
              market={activeMarket}
              positions={positions}
              onOrderPlaced={loadPortfolio}
            />
          ) : (
            <div className="card text-xs text-gray-500">Loading portfolio…</div>
          )}
          {/* Portfolio mini-stats */}
          {portfolio && (
            <div className="card mt-4 space-y-2">
              <h4 className="text-xs font-semibold text-gray-400">Portfolio</h4>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Balance</span>
                <span className="text-white font-mono">{currency}{portfolio.current_balance.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Started</span>
                <span className="text-gray-300 font-mono">{currency}{portfolio.initial_balance.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Open Positions</span>
                <span className="text-indigo-400">{positions.length}</span>
              </div>
              <button
                onClick={() => portfolioId != null && confirm('Reset portfolio to initial balance?') && tradingAPI.resetPortfolio(portfolioId).then(loadPortfolio)}
                className="w-full text-xs text-red-400 hover:text-red-300 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
                Reset Portfolio
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

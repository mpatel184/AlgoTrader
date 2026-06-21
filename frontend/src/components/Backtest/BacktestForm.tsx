import { useState, useEffect } from 'react'
import { Play, Loader } from 'lucide-react'
import { backtestAPI, Strategy } from '../../api'
import { useStore } from '../../store/useStore'

interface Props {
  // Reports the run's result AND the market it ran on, so the page can render
  // the right currency regardless of the global market toggle.
  onResult: (result: any, market: 'indian' | 'crypto') => void
}

const marketDefaults = (market: 'indian' | 'crypto') => ({
  market,
  symbol: market === 'indian' ? 'RELIANCE.NS' : 'BTC/USDT',
  strategy: market === 'indian' ? 'ema_crossover' : 'crypto_trend_rsi',
  sl_pct: market === 'indian' ? 0.02 : 0.04,
  initial_capital: market === 'indian' ? 100000 : 10000,
})

const INDIAN_SYMBOLS = ['RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','SBIN.NS','WIPRO.NS','BAJFINANCE.NS','AXISBANK.NS','MARUTI.NS']
const INDIAN_INDICES = [
  { symbol: '^NSEI', label: 'Nifty 50' },
  { symbol: '^NSEBANK', label: 'Bank Nifty' },
  { symbol: '^BSESN', label: 'Sensex' },
  { symbol: '^CNXIT', label: 'Nifty IT' },
  { symbol: '^NSEMDCP50', label: 'Nifty Midcap 50' },
  { symbol: 'NIFTY_FIN_SERVICE.NS', label: 'Fin Nifty' },
]
const INDEX_SYMBOLS = INDIAN_INDICES.map(i => i.symbol)
const CRYPTO_SYMBOLS = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT','AVAX/USDT']

export default function BacktestForm({ onResult }: Props) {
  const { activeMarket } = useStore()
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [form, setForm] = useState({
    ...marketDefaults(activeMarket),
    period: '1y',
    risk_per_trade: 0.01,
    rr_ratio: 2.0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    backtestAPI.strategies().then(r => setStrategies(r.data)).catch(() => {})
  }, [])

  // Follow the global market toggle so the form matches what the user expects.
  useEffect(() => {
    setForm(f => ({ ...f, ...marketDefaults(activeMarket) }))
  }, [activeMarket])

  const filteredStrategies = strategies.filter(s => s.market === form.market || s.market === 'both')
  const isIndex = INDEX_SYMBOLS.includes(form.symbol)

  const handleMarketChange = (market: 'indian' | 'crypto') => {
    setForm(f => ({ ...f, ...marketDefaults(market) }))
  }

  const run = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await backtestAPI.run(form as any)
      onResult(res.data, form.market as 'indian' | 'crypto')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Backtest failed')
    }
    setLoading(false)
  }

  const currency = form.market === 'indian' ? '₹' : '$'

  return (
    <div className="card space-y-4">
      <h3 className="text-sm font-semibold text-white">Backtest Configuration</h3>

      {/* Market */}
      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">Market</label>
        <div className="flex gap-2">
          {(['indian', 'crypto'] as const).map(m => (
            <button key={m}
              onClick={() => handleMarketChange(m)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${
                form.market === m ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-[#1e2235] text-gray-400 hover:border-gray-600'
              }`}>
              {m === 'indian' ? '🇮🇳 Indian' : '🪙 Crypto'}
            </button>
          ))}
        </div>
      </div>

      {/* Symbol */}
      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">Symbol</label>
        <select className="select" value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}>
          {form.market === 'indian' ? (
            <>
              <optgroup label="Indices">
                {INDIAN_INDICES.map(i => <option key={i.symbol} value={i.symbol}>{i.label}</option>)}
              </optgroup>
              <optgroup label="Stocks">
                {INDIAN_SYMBOLS.map(s => <option key={s} value={s}>{s.replace('.NS', '')}</option>)}
              </optgroup>
            </>
          ) : (
            CRYPTO_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)
          )}
        </select>
        {isIndex && (
          <p className="text-[10px] text-gray-500 mt-1">
            Indices have no volume — volume-based strategies (S&amp;R Breakout, Gap &amp; Go) won't signal. Use trend/RSI strategies.
          </p>
        )}
      </div>

      {/* Strategy */}
      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">Strategy</label>
        <select className="select" value={form.strategy} onChange={e => setForm(f => ({ ...f, strategy: e.target.value }))}>
          {filteredStrategies.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>
      </div>

      {/* Period */}
      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">Period</label>
        <div className="grid grid-cols-4 gap-1.5">
          {['3mo','6mo','1y','2y'].map(p => (
            <button key={p}
              onClick={() => setForm(f => ({ ...f, period: p }))}
              className={`py-1.5 rounded-lg text-xs font-medium transition-all border ${
                form.period === p ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-[#1e2235] text-gray-400 hover:border-gray-600'
              }`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Capital */}
      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">Initial Capital ({currency})</label>
        <input type="number" className="input font-mono text-right"
          value={form.initial_capital} onChange={e => setForm(f => ({ ...f, initial_capital: parseFloat(e.target.value) || 0 }))} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">Risk/Trade</label>
          <input type="number" step="0.005" className="input font-mono text-right text-yellow-400"
            value={form.risk_per_trade} onChange={e => setForm(f => ({ ...f, risk_per_trade: parseFloat(e.target.value) }))} />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">R:R Ratio</label>
          <input type="number" step="0.5" className="input font-mono text-right text-green-400"
            value={form.rr_ratio} onChange={e => setForm(f => ({ ...f, rr_ratio: parseFloat(e.target.value) }))} />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">SL %</label>
          <input type="number" step="0.005" className="input font-mono text-right text-red-400"
            value={form.sl_pct} onChange={e => setForm(f => ({ ...f, sl_pct: parseFloat(e.target.value) }))} />
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <button onClick={run} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
        {loading ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
        {loading ? 'Running Backtest...' : 'Run Backtest'}
      </button>
    </div>
  )
}

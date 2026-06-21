import { useEffect, useState } from 'react'
import { Brain, TrendingUp, TrendingDown, RefreshCw, Minus } from 'lucide-react'
import { backtestAPI, accountAPI, Strategy } from '../api'
import { useStore } from '../store/useStore'
import StrategyCard from '../components/Strategies/StrategyCard'

interface Signal {
  symbol: string
  signal: string
  price: number
  stop_loss: number
  target: number
  strategy: string
  indicators: Record<string, number>
}

export default function Strategies() {
  const { activeMarket } = useStore()
  const currency = activeMarket === 'indian' ? '₹' : '$'
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [activeStrategy, setActiveStrategy] = useState<string | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    backtestAPI.strategies().then(r => setStrategies(r.data)).catch(() => {})
  }, [])

  const scanSignals = async (stratKey: string) => {
    setActiveStrategy(stratKey)
    setLoading(true)
    setSignals([])
    try {
      const res = await accountAPI.liveSignals(stratKey, activeMarket)
      setSignals(res.data)
    } catch {}
    setLoading(false)
  }

  const filtered = strategies.filter(s => s.market === activeMarket || s.market === 'both')
  const topSignal = signals[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Strategies</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeMarket === 'indian' ? '🇮🇳 Indian' : '🪙 Crypto'} market strategies with live signal scanning
          </p>
        </div>
        {activeStrategy && (
          <button onClick={() => scanSignals(activeStrategy)} disabled={loading}
            className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Rescan
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Strategy Cards */}
        <div className="xl:col-span-1 space-y-3">
          {filtered.map(s => (
            <StrategyCard
              key={s.key}
              strategy={s}
              isActive={activeStrategy === s.key}
              onClick={() => scanSignals(s.key)}
              signal={signals[0] && activeStrategy === s.key ? signals[0] : undefined}
            />
          ))}
        </div>

        {/* Signals Panel */}
        <div className="xl:col-span-2">
          {loading ? (
            <div className="card h-64 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <div className="text-gray-500 text-sm">Scanning market for signals...</div>
                <div className="text-gray-600 text-xs mt-1">Fetching data for all symbols</div>
              </div>
            </div>
          ) : activeStrategy ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Live Signals — {strategies.find(s => s.key === activeStrategy)?.name}
                </h3>
                <span className={`text-xs px-2 py-1 rounded-lg ${
                  signals.length > 0 ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
                }`}>
                  {signals.length} signal{signals.length !== 1 ? 's' : ''} found
                </span>
              </div>

              {signals.length === 0 ? (
                <div className="card text-center py-12">
                  <div className="text-2xl mb-2">🔍</div>
                  <div className="text-gray-400 text-sm">No active signals right now</div>
                  <div className="text-gray-600 text-xs mt-1">
                    The strategy has no buy/sell signals on the current data.
                    Try a different strategy or check back later.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {signals.map((sig, i) => (
                    <SignalRow key={i} signal={sig} currency={currency} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card h-64 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                <Brain size={24} className="text-indigo-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">Select a Strategy</h3>
              <p className="text-gray-500 text-sm max-w-xs">
                Click any strategy on the left to scan the market for buy/sell signals across all major symbols.
              </p>
            </div>
          )}

          {/* Strategy Info Panel */}
          {activeStrategy && (
            <div className="card mt-4">
              {(() => {
                const s = strategies.find(x => x.key === activeStrategy)
                if (!s) return null
                return (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-3">{s.name} — How it works</h3>
                    <StrategyExplainer stratKey={activeStrategy} />
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SignalRow({ signal, currency }: { signal: Signal; currency: string }) {
  const isBuy = signal.signal === 'BUY'
  return (
    <div className={`card border transition-all ${isBuy ? 'border-green-500/30' : 'border-red-500/30'}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isBuy ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            {isBuy ? <TrendingUp size={18} className="text-green-400" /> : <TrendingDown size={18} className="text-red-400" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{signal.symbol.replace('.NS', '')}</span>
              <span className={isBuy ? 'badge-buy' : 'badge-sell'}>{signal.signal}</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{signal.strategy}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold font-mono text-white">
            {currency}{signal.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-gray-500">Entry price</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-[#1e2235]">
        <div className="text-center">
          <div className="text-[10px] text-gray-600 mb-1">Stop Loss</div>
          <div className="text-xs font-mono font-semibold text-red-400">
            {signal.stop_loss ? `${currency}${signal.stop_loss.toFixed(2)}` : '–'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-600 mb-1">Target</div>
          <div className="text-xs font-mono font-semibold text-green-400">
            {signal.target ? `${currency}${signal.target.toFixed(2)}` : '–'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-600 mb-1">Risk:Reward</div>
          <div className="text-xs font-semibold text-indigo-400">1:2.0</div>
        </div>
      </div>

      {/* Indicators */}
      {Object.keys(signal.indicators).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(signal.indicators).map(([k, v]) => (
            <div key={k} className="bg-[#111318] rounded px-2 py-1 text-[10px]">
              <span className="text-gray-600">{k.toUpperCase()}: </span>
              <span className="text-gray-300 font-mono">{typeof v === 'number' ? v.toFixed(2) : v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const STRATEGY_INFO: Record<string, { rules: string[]; tips: string[] }> = {
  ema_crossover: {
    rules: ['20 EMA crosses above 50 EMA → BUY', 'Both EMAs must be above 200 EMA (trend)', '20 EMA crosses below 50 EMA → SELL'],
    tips: ['Best on large-cap stocks (Reliance, TCS, HDFC)', 'Use daily timeframe for swing trading', 'Hold until sell signal or 3:1 R/R reached'],
  },
  rsi_momentum: {
    rules: ['RSI(10) crosses below 30 then back above 30 + price above EMA20 → BUY', 'RSI(10) crosses above 70 then back below 70 → SELL'],
    tips: ['RSI 10 is faster than standard RSI 14', 'Works well on 4H and daily charts', 'Combine with trend direction for better accuracy'],
  },
  crypto_trend_rsi: {
    rules: ['Price above 200 EMA (bullish trend)', 'Price breaks resistance level + RSI 50-70 → BUY', 'Price below 200 EMA + RSI > 70 → SELL'],
    tips: ['Best on BTC, ETH, SOL (high liquidity)', 'Use 4H or daily timeframe', 'Risk only 1-2% capital per trade'],
  },
  rsi_divergence: {
    rules: ['Price makes lower low, RSI makes higher low → Bullish divergence (BUY)', 'Price makes higher high, RSI makes lower high → Bearish divergence (SELL)'],
    tips: ['Powerful reversal signal', 'Works on any market', 'Confirmed by volume is stronger'],
  },
}

function StrategyExplainer({ stratKey }: { stratKey: string }) {
  const info = STRATEGY_INFO[stratKey]
  if (!info) return <div className="text-xs text-gray-500">Strategy details coming soon.</div>
  return (
    <div className="grid grid-cols-2 gap-4 text-xs">
      <div>
        <div className="text-gray-400 font-semibold mb-2">Signal Rules</div>
        <ul className="space-y-1.5">
          {info.rules.map((r, i) => <li key={i} className="text-gray-500 flex gap-2"><span className="text-indigo-400 shrink-0">→</span>{r}</li>)}
        </ul>
      </div>
      <div>
        <div className="text-gray-400 font-semibold mb-2">Pro Tips</div>
        <ul className="space-y-1.5">
          {info.tips.map((t, i) => <li key={i} className="text-gray-500 flex gap-2"><span className="text-yellow-400 shrink-0">★</span>{t}</li>)}
        </ul>
      </div>
    </div>
  )
}

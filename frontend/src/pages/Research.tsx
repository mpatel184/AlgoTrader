import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles, TrendingUp, TrendingDown, Activity, Gauge, RefreshCw, Zap, Brain,
} from 'lucide-react'
import { backtestAPI, accountAPI, marketAPI, Strategy, Quote } from '../api'
import { useStore } from '../store/useStore'
import PageTransition, { stagger } from '../components/common/PageTransition'

interface Signal {
  symbol: string
  signal: string
  price: number
  stop_loss: number
  target: number
  strategy: string
  indicators: Record<string, number>
}
type AggSignal = Signal & { strategyKey: string; strategyName: string }

export default function Research() {
  const { activeMarket } = useStore()
  const currency = activeMarket === 'indian' ? '₹' : '$'
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [signals, setSignals] = useState<AggSignal[]>([])
  const [watchlist, setWatchlist] = useState<Quote[]>([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    backtestAPI.strategies().then((r) => setStrategies(r.data)).catch(() => {})
    ;(activeMarket === 'indian' ? marketAPI.indianWatchlist() : marketAPI.cryptoWatchlist())
      .then((r) => setWatchlist(r.data)).catch(() => {})
    setSignals([])
  }, [activeMarket])

  const runScan = async () => {
    const relevant = strategies.filter((s) => s.market === activeMarket || s.market === 'both')
    if (!relevant.length) return
    setScanning(true)
    setSignals([])
    setProgress(0)
    const collected: AggSignal[] = []
    for (let i = 0; i < relevant.length; i++) {
      const s = relevant[i]
      try {
        const res = await accountAPI.liveSignals(s.key, activeMarket)
        res.data.forEach((sig: Signal) =>
          collected.push({ ...sig, strategyKey: s.key, strategyName: s.name }))
      } catch {}
      setProgress(Math.round(((i + 1) / relevant.length) * 100))
      setSignals([...collected])
    }
    setScanning(false)
  }

  const buys = signals.filter((s) => s.signal === 'BUY')
  const sells = signals.filter((s) => s.signal === 'SELL')
  const total = signals.length || 1
  const bullPct = Math.round((buys.length / total) * 100)
  const sentiment = signals.length === 0 ? 50 : Math.round((buys.length / signals.length) * 100)
  const mood = sentiment >= 60 ? 'Bullish' : sentiment <= 40 ? 'Bearish' : 'Neutral'
  const moodColor = sentiment >= 60 ? 'text-green-400' : sentiment <= 40 ? 'text-red-400' : 'text-yellow-400'

  // group signals by symbol → confluence (more strategies agreeing = higher conviction)
  const bySymbol = new Map<string, AggSignal[]>()
  signals.forEach((s) => {
    const k = s.symbol
    bySymbol.set(k, [...(bySymbol.get(k) || []), s])
  })
  const conviction = Array.from(bySymbol.entries())
    .map(([symbol, sigs]) => {
      const buy = sigs.filter((s) => s.signal === 'BUY').length
      const sell = sigs.filter((s) => s.signal === 'SELL').length
      return { symbol, count: sigs.length, buy, sell, price: sigs[0].price, dir: buy >= sell ? 'BUY' : 'SELL', sigs }
    })
    .sort((a, b) => b.count - a.count)

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center">
              <Sparkles size={20} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                AI Research <span className="text-[10px] gradient-text font-bold border border-indigo-500/30 rounded px-1.5 py-0.5">BETA</span>
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Multi-strategy signal confluence across {activeMarket === 'indian' ? '🇮🇳 Indian' : '🪙 Crypto'} markets
              </p>
            </div>
          </div>
          <button onClick={runScan} disabled={scanning}
            className="btn-primary text-xs flex items-center gap-1.5">
            {scanning ? <><RefreshCw size={13} className="animate-spin" /> Scanning {progress}%</> : <><Zap size={13} /> Run AI Scan</>}
          </button>
        </div>

        {scanning && (
          <div className="h-1 w-full bg-[#1e2235] rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
              animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut' }} />
          </div>
        )}

        {/* Sentiment + stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sentiment gauge */}
          <div className="glass-card flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Market Sentiment</span>
              <Gauge size={16} className="text-gray-600" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center py-2">
              <div className="relative w-40 h-40">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#1e2235" strokeWidth="8" />
                  <motion.circle cx="50" cy="50" r="42" fill="none"
                    stroke={sentiment >= 60 ? '#22c55e' : sentiment <= 40 ? '#ef4444' : '#eab308'}
                    strokeWidth="8" strokeLinecap="round" strokeDasharray={2 * Math.PI * 42}
                    initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - sentiment / 100) }}
                    transition={{ duration: 1, ease: 'easeOut' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-bold font-mono ${moodColor}`}>{signals.length ? sentiment : '—'}</span>
                  <span className={`text-xs font-semibold ${moodColor}`}>{signals.length ? mood : 'Idle'}</span>
                </div>
              </div>
              <div className="text-[11px] text-gray-600 mt-3 text-center">
                {signals.length ? `${buys.length} buy vs ${sells.length} sell signals` : 'Run a scan to compute sentiment'}
              </div>
            </div>
          </div>

          {/* Stat tiles */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-4">
            <Tile label="Buy Signals" value={buys.length} color="green" icon={<TrendingUp size={16} />} sub={`${bullPct}% of signals`} />
            <Tile label="Sell Signals" value={sells.length} color="red" icon={<TrendingDown size={16} />} sub={`${100 - bullPct}% of signals`} />
            <Tile label="Strategies Scanned" value={strategies.filter((s) => s.market === activeMarket || s.market === 'both').length} color="indigo" icon={<Brain size={16} />} sub="active models" />
            <Tile label="Conviction Picks" value={conviction.filter((c) => c.count > 1).length} color="gold" icon={<Activity size={16} />} sub="multi-strategy agreement" />
          </div>
        </div>

        {/* Conviction board */}
        <div className="glass-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Conviction Board</h3>
              <p className="text-[11px] text-gray-500">Symbols ranked by how many strategies agree — higher confluence = stronger conviction</p>
            </div>
          </div>

          {signals.length === 0 ? (
            <div className="text-center py-14">
              <div className="w-14 h-14 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles size={24} className="text-indigo-400" />
              </div>
              <div className="text-gray-300 text-sm font-medium">No research yet</div>
              <p className="text-gray-600 text-xs mt-1 max-w-sm mx-auto">
                Hit <span className="text-indigo-400">Run AI Scan</span> to evaluate every strategy against major {activeMarket} symbols and surface the highest-conviction setups.
              </p>
            </div>
          ) : (
            <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-2">
              {conviction.map((c) => {
                const isBuy = c.dir === 'BUY'
                return (
                  <motion.div key={c.symbol} variants={stagger.item}
                    className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-[#1e2235] hover:border-indigo-500/25 transition-colors">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isBuy ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      {isBuy ? <TrendingUp size={16} className="text-green-400" /> : <TrendingDown size={16} className="text-red-400" />}
                    </div>
                    <div className="min-w-[90px]">
                      <div className="text-sm font-bold text-white">{c.symbol.replace('.NS', '')}</div>
                      <div className="text-[10px] text-gray-600 font-mono">{currency}{c.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                    {/* confluence bar */}
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        {c.sigs.map((s, i) => (
                          <span key={i} title={s.strategyName}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${s.signal === 'BUY' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                            {s.strategyName.split(' ')[0]}
                          </span>
                        ))}
                      </div>
                      <div className="h-1.5 w-full bg-[#1e2235] rounded-full overflow-hidden">
                        <div className={`h-full ${isBuy ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, c.count * 33)}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-block ${isBuy ? 'badge-buy' : 'badge-sell'}`}>{c.dir}</span>
                      <div className="text-[10px] text-gray-600 mt-1">{c.count} strateg{c.count > 1 ? 'ies' : 'y'}</div>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </div>

        {/* Market movers */}
        {watchlist.length > 0 && (
          <div className="glass-card">
            <h3 className="text-sm font-semibold text-white mb-3">Market Movers</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {[...watchlist].sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct)).slice(0, 8).map((q) => (
                <div key={q.symbol} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-[#1e2235]">
                  <div>
                    <div className="text-xs font-semibold text-white">{q.symbol.replace('.NS', '')}</div>
                    <div className="text-[10px] text-gray-600 font-mono">{currency}{q.price.toLocaleString()}</div>
                  </div>
                  <div className={`text-xs font-semibold ${q.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {q.change_pct >= 0 ? '+' : ''}{q.change_pct.toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-600 text-center">
          AI Research aggregates rule-based strategy signals for educational purposes. Not financial advice.
        </p>
      </div>
    </PageTransition>
  )
}

function Tile({ label, value, color, icon, sub }: {
  label: string; value: number; color: 'green' | 'red' | 'indigo' | 'gold'; icon: React.ReactNode; sub: string
}) {
  const map = {
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    gold: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  }[color]
  const [text, bg, border] = map.split(' ')
  return (
    <div className="glass-card">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${bg} ${border} ${text}`}>{icon}</div>
      </div>
      <div className={`text-2xl font-bold font-mono ${text}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-1">{sub}</div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  History as HistoryIcon, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Wallet, Percent, Target, RefreshCw, Search, Download, Bot, User,
} from 'lucide-react'
import { tradingAPI, Portfolio, Trade } from '../api'
import PageTransition, { stagger } from '../components/common/PageTransition'

type EnrichedTrade = Trade & { portfolioName: string; portfolioMarket: 'indian' | 'crypto' }
type MarketFilter = 'all' | 'indian' | 'crypto'
type TypeFilter = 'all' | 'BUY' | 'SELL'
type StatusFilter = 'all' | 'open' | 'closed'
type SourceFilter = 'all' | 'bot' | 'manual'

const cur = (m: string) => (m === 'crypto' ? '$' : '₹')
// A trade is a bot trade if explicitly tagged 'bot' (new rows) — older rows may
// be untagged, so fall back to "has a strategy and isn't tagged manual".
const isBotTrade = (t: Trade) => t.source === 'bot' || (!t.source && !!t.strategy)

export default function History() {
  const [trades, setTrades] = useState<EnrichedTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [market, setMarket] = useState<MarketFilter>('all')
  const [type, setType] = useState<TypeFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [source, setSource] = useState<SourceFilter>('all')
  const [query, setQuery] = useState('')

  const load = async () => {
    setRefreshing(true)
    try {
      const pRes = await tradingAPI.getPortfolios()
      const portfolios: Portfolio[] = pRes.data
      const all = await Promise.all(
        portfolios.map(async (p) => {
          const tRes = await tradingAPI.getTrades(p.id)
          return tRes.data.map((t) => ({
            ...t,
            portfolioName: p.name,
            portfolioMarket: p.market,
          })) as EnrichedTrade[]
        })
      )
      const flat = all.flat().sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      setTrades(flat)
    } catch {
      setTrades([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (market !== 'all' && t.portfolioMarket !== market) return false
      if (type !== 'all' && t.trade_type !== type) return false
      if (status !== 'all' && t.status !== status) return false
      if (source !== 'all' && (source === 'bot') !== isBotTrade(t)) return false
      if (query && !t.symbol.toLowerCase().includes(query.toLowerCase())) return false
      return true
    })
  }, [trades, market, type, status, source, query])

  const stats = useMemo(() => {
    const closed = filtered.filter((t) => t.trade_type === 'SELL' && t.pnl != null)
    const wins = closed.filter((t) => (t.pnl || 0) > 0)
    const losses = closed.filter((t) => (t.pnl || 0) < 0)
    const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0)
    const volume = filtered.reduce((s, t) => s + (t.total_value || 0), 0)
    const winRate = closed.length ? (wins.length / closed.length) * 100 : 0
    const grossWin = wins.reduce((s, t) => s + (t.pnl || 0), 0)
    const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0))
    const profitFactor = grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0
    return { count: filtered.length, closed: closed.length, wins: wins.length, losses: losses.length, totalPnl, volume, winRate, profitFactor }
  }, [filtered])

  const exportCsv = () => {
    const head = ['Date', 'Portfolio', 'Market', 'Symbol', 'Type', 'Qty', 'Price', 'Total', 'P&L', 'Status', 'Source', 'Strategy']
    const rows = filtered.map((t) => [
      t.created_at, t.portfolioName, t.portfolioMarket, t.symbol, t.trade_type,
      t.quantity, t.price, t.total_value, t.pnl ?? '', t.status,
      isBotTrade(t) ? 'bot' : 'manual', t.strategy ?? '',
    ])
    const csv = [head, ...rows].map((r) => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `trade-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center">
              <HistoryIcon size={20} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Trade History</h1>
              <p className="text-xs text-gray-500 mt-0.5">Every paper trade across all portfolios · realized & open</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={!filtered.length} className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40">
              <Download size={13} /> Export CSV
            </button>
            <button onClick={load} disabled={refreshing} className="btn-ghost text-xs flex items-center gap-1.5">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <motion.div variants={stagger.container} initial="initial" animate="animate"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard variant="item" label="Realized P&L"
            value={`${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            sub={`${stats.closed} closed trades`} color={stats.totalPnl >= 0 ? 'green' : 'red'}
            icon={stats.totalPnl >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />} />
          <SummaryCard variant="item" label="Win Rate" value={`${stats.winRate.toFixed(1)}%`}
            sub={`${stats.wins}W · ${stats.losses}L`} color="indigo" icon={<Percent size={16} />} />
          <SummaryCard variant="item" label="Profit Factor"
            value={stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
            sub="gross win / gross loss" color="gold" icon={<Target size={16} />} />
          <SummaryCard variant="item" label="Total Volume"
            value={stats.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            sub={`${stats.count} total trades`} color="default" icon={<Wallet size={16} />} />
        </motion.div>

        {/* Filters */}
        <div className="glass-card flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbol…" className="input pl-9" />
          </div>
          <SegBtns value={source} onChange={setSource} options={[['all', 'All'], ['bot', '🤖 Bot'], ['manual', '👤 Manual']]} />
          <SegBtns value={market} onChange={setMarket} options={[['all', 'All'], ['indian', '🇮🇳 Indian'], ['crypto', '🪙 Crypto']]} />
          <SegBtns value={type} onChange={setType} options={[['all', 'All'], ['BUY', 'Buy'], ['SELL', 'Sell']]} />
          <SegBtns value={status} onChange={setStatus} options={[['all', 'All'], ['open', 'Open'], ['closed', 'Closed']]} />
        </div>

        {/* Table */}
        <div className="glass overflow-hidden">
          {loading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-11 rounded-lg shimmer" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-4xl mb-3 opacity-60">📭</div>
              <div className="text-gray-300 text-sm font-medium">No trades found</div>
              <div className="text-gray-600 text-xs mt-1">Place a paper trade or adjust your filters to see history here.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-[#1e2235]">
                    <th className="text-left font-medium px-4 py-3">Symbol</th>
                    <th className="text-left font-medium px-4 py-3">Side</th>
                    <th className="text-right font-medium px-4 py-3">Qty</th>
                    <th className="text-right font-medium px-4 py-3">Price</th>
                    <th className="text-right font-medium px-4 py-3">Total</th>
                    <th className="text-right font-medium px-4 py-3">P&L</th>
                    <th className="text-left font-medium px-4 py-3">Source</th>
                    <th className="text-left font-medium px-4 py-3 hidden md:table-cell">Strategy</th>
                    <th className="text-left font-medium px-4 py-3">Status</th>
                    <th className="text-right font-medium px-4 py-3 hidden lg:table-cell">Date</th>
                  </tr>
                </thead>
                <motion.tbody variants={stagger.container} initial="initial" animate="animate">
                  {filtered.slice(0, 200).map((t) => {
                    const isBuy = t.trade_type === 'BUY'
                    const c = cur(t.portfolioMarket)
                    const pnl = t.pnl ?? null
                    return (
                      <motion.tr key={t.id} variants={stagger.item}
                        className="border-b border-[#1e2235]/60 hover:bg-white/[0.025] transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-white">{t.symbol.replace('.NS', '')}</div>
                          <div className="text-[10px] text-gray-600">{t.portfolioName}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 ${isBuy ? 'badge-buy' : 'badge-sell'}`}>
                            {isBuy ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{t.trade_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300">{t.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300">{c}{t.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300">{c}{t.total_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {pnl == null ? <span className="text-gray-600">—</span> : (
                            <span className={pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {pnl >= 0 ? '+' : ''}{c}{pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isBotTrade(t) ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300">
                              <Bot size={11} /> Bot
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-400">
                              <User size={11} /> Manual
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">{t.strategy || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            t.status === 'closed' ? 'bg-gray-500/15 text-gray-400' : 'bg-indigo-500/15 text-indigo-400'
                          }`}>{t.status}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-[11px] text-gray-600 hidden lg:table-cell font-mono">
                          {new Date(t.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </motion.tr>
                    )
                  })}
                </motion.tbody>
              </table>
              {filtered.length > 200 && (
                <div className="text-center text-[11px] text-gray-600 py-3 border-t border-[#1e2235]">
                  Showing latest 200 of {filtered.length} trades — export CSV for the full log.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  )
}

function SummaryCard({ label, value, sub, color, icon, variant }: {
  label: string; value: string; sub: string; icon: React.ReactNode
  color: 'green' | 'red' | 'indigo' | 'gold' | 'default'; variant?: string
}) {
  const map = {
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    gold: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    default: 'text-gray-200 bg-white/5 border-white/10',
  }[color]
  const [text, bg, border] = map.split(' ')
  return (
    <motion.div variants={variant ? stagger.item : undefined} className="glass-card">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${bg} ${border} ${text}`}>{icon}</div>
      </div>
      <div className={`text-2xl font-bold font-mono leading-tight ${text}`}>{value}</div>
      <div className="text-[11px] mt-1 text-gray-500">{sub}</div>
    </motion.div>
  )
}

function SegBtns<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: [T, string][]
}) {
  return (
    <div className="flex items-center gap-1 bg-[#111318] border border-[#1e2235] rounded-lg p-1">
      {options.map(([val, label]) => (
        <button key={val} onClick={() => onChange(val)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
            value === val ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
          }`}>{label}</button>
      ))}
    </div>
  )
}

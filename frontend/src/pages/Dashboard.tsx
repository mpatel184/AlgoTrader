import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, BarChart2, Activity, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { tradingAPI, marketAPI, Quote, Portfolio } from '../api'
import { useStore } from '../store/useStore'
import StatsCard from '../components/common/StatsCard'
import PortfolioChart from '../components/Charts/PortfolioChart'

export default function Dashboard() {
  const { activeMarket, setPortfolios, setWatchlist, eventTick } = useStore()
  const [portfolios, setLocalPortfolios] = useState<Portfolio[]>([])
  const [watchlist, setLocalWatchlist] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)

  const currency = activeMarket === 'indian' ? '₹' : '$'

  useEffect(() => {
    Promise.all([
      tradingAPI.getPortfolios(),
      activeMarket === 'indian' ? marketAPI.indianWatchlist() : marketAPI.cryptoWatchlist(),
    ]).then(([pRes, wRes]) => {
      setLocalPortfolios(pRes.data)
      setLocalWatchlist(wRes.data)
      setWatchlist(wRes.data)
      const indian = pRes.data.find((p: Portfolio) => p.market === 'indian') || null
      const crypto = pRes.data.find((p: Portfolio) => p.market === 'crypto') || null
      setPortfolios(indian, crypto)
    }).finally(() => setLoading(false))
  }, [activeMarket])

  // Live updates (M3): refresh portfolio balances when the server signals a change.
  useEffect(() => {
    if (!eventTick) return
    tradingAPI.getPortfolios().then(({ data }) => {
      setLocalPortfolios(data)
      const indian = data.find((p: Portfolio) => p.market === 'indian') || null
      const crypto = data.find((p: Portfolio) => p.market === 'crypto') || null
      setPortfolios(indian, crypto)
    }).catch(() => {})
  }, [eventTick])

  const portfolio = portfolios.find(p => p.market === activeMarket)
  const totalPnL = portfolio ? portfolio.current_balance - portfolio.initial_balance : 0
  const pnlPct = portfolio ? (totalPnL / portfolio.initial_balance) * 100 : 0
  const isUp = totalPnL >= 0

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <div className="text-gray-500 text-sm">Loading dashboard...</div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeMarket === 'indian' ? '🇮🇳 Indian Stock Market' : '🪙 Crypto Market'} · Paper Trading
          </p>
        </div>
        <Link to="/trading" className="btn-primary text-xs flex items-center gap-1.5">
          Start Trading <ArrowRight size={12} />
        </Link>
      </div>

      {/* Portfolio stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="Portfolio Value"
          value={`${currency}${(portfolio?.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          sub={`Started: ${currency}${(portfolio?.initial_balance || 0).toLocaleString()}`}
          icon={<DollarSign size={14} />}
          color="indigo"
        />
        <StatsCard
          label="Total P&L"
          value={`${isUp ? '+' : ''}${currency}${totalPnL.toFixed(2)}`}
          sub={`${isUp ? '+' : ''}${pnlPct.toFixed(2)}% overall`}
          trend={isUp ? 'up' : 'down'}
          color={isUp ? 'green' : 'red'}
          icon={isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        />
        <StatsCard
          label="Markets"
          value="2 Active"
          sub="Indian + Crypto"
          icon={<BarChart2 size={14} />}
          color="gold"
        />
        <StatsCard
          label="Strategies"
          value="8 Available"
          sub="4 Indian · 4 Crypto"
          icon={<Activity size={14} />}
          color="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio Charts */}
        <div className="lg:col-span-2 space-y-4">
          {portfolios.map(p => (
            <div key={p.id} className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">{p.name}</h3>
                  <div className="text-xs text-gray-500">{p.market === 'indian' ? '₹' : '$'}{p.current_balance.toLocaleString()} current value</div>
                </div>
                <div className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                  p.current_balance >= p.initial_balance ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
                }`}>
                  {p.current_balance >= p.initial_balance ? '+' : ''}
                  {(((p.current_balance - p.initial_balance) / p.initial_balance) * 100).toFixed(2)}%
                </div>
              </div>
              <PortfolioChartWrapper portfolioId={p.id} currency={p.market === 'indian' ? '₹' : '$'} initial={p.initial_balance} />
            </div>
          ))}
        </div>

        {/* Watchlist */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Watchlist</h3>
            <span className="text-[10px] text-gray-600 bg-[#111318] px-2 py-0.5 rounded">
              {activeMarket === 'indian' ? 'NSE' : 'Crypto'} · Live
            </span>
          </div>
          <div className="space-y-1">
            {watchlist.slice(0, 12).map(q => (
              <Link key={q.symbol} to="/trading"
                className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-[#1e2235] transition-colors group">
                <div>
                  <div className="text-xs font-semibold text-white group-hover:text-indigo-400 transition-colors">
                    {q.symbol.replace('.NS', '')}
                  </div>
                  <div className="text-[10px] text-gray-600 truncate w-24">{q.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-white">
                    {activeMarket === 'indian' ? '₹' : '$'}{q.price.toLocaleString()}
                  </div>
                  <div className={`text-[10px] font-medium ${q.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {q.change_pct >= 0 ? '+' : ''}{q.change_pct.toFixed(2)}%
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Risk Rules */}
      <div className="card border-yellow-500/20">
        <h3 className="text-sm font-semibold text-white mb-3">⚠️ Universal Risk Management Rules</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
          {[
            { rule: '1% Rule', desc: 'Never risk more than 1% of capital on a single trade' },
            { rule: 'Stop Loss', desc: 'Always use stop-loss orders to automate exits' },
            { rule: 'Risk-Reward', desc: 'Aim for 1:2 ratio (gain = 2× risk)' },
            { rule: 'Position Sizing', desc: 'Adjust size based on your risk level' },
            { rule: 'No Revenge', desc: "Don't chase losses immediately after a loss" },
            { rule: 'Diversify', desc: 'Spread investments across multiple assets' },
          ].map(r => (
            <div key={r.rule} className="bg-[#111318] rounded-lg p-3 border border-[#1e2235]">
              <div className="text-yellow-400 font-semibold mb-0.5">{r.rule}</div>
              <div className="text-gray-500">{r.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PortfolioChartWrapper({ portfolioId, currency, initial }: { portfolioId: number; currency: string; initial: number }) {
  const [history, setHistory] = useState<{ value: number; timestamp: string }[]>([])
  useEffect(() => {
    tradingAPI.getPortfolio(portfolioId).then(r => setHistory(r.data.history || [])).catch(() => {})
  }, [portfolioId])
  return <PortfolioChart data={history} initial={initial} currency={currency} />
}

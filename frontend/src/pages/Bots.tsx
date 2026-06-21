import { useState, useEffect, useCallback } from 'react'
import { Bot as BotIcon, Play, Square, Trash2, Zap, Plus, Loader, ChevronDown, ChevronUp } from 'lucide-react'
import { botsAPI, backtestAPI, tradingAPI, Bot, BotLog, Strategy, Portfolio } from '../api'
import { useStore } from '../store/useStore'

const INDIAN_STOCKS = ['RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','SBIN.NS','WIPRO.NS','BAJFINANCE.NS','AXISBANK.NS','MARUTI.NS']
const INDICES = [
  { symbol: '^NSEI', label: 'Nifty 50 (Index)' },
  { symbol: '^NSEBANK', label: 'Bank Nifty (Index)' },
  { symbol: '^BSESN', label: 'Sensex (Index)' },
  { symbol: '^CNXIT', label: 'Nifty IT (Index)' },
  { symbol: '^NSEMDCP50', label: 'Nifty Midcap 50 (Index)' },
  { symbol: 'NIFTY_FIN_SERVICE.NS', label: 'Fin Nifty (Index)' },
]
const CRYPTO_SYMBOLS = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT','AVAX/USDT']

function signalBadge(sig?: string) {
  if (sig === 'BUY') return 'badge-buy'
  if (sig === 'SELL') return 'badge-sell'
  return 'badge-hold'
}

function timeAgo(iso?: string) {
  if (!iso) return 'never'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export default function Bots() {
  const { notify, eventTick } = useStore()
  const [bots, setBots] = useState<Bot[]>([])
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [logs, setLogs] = useState<BotLog[]>([])

  const [form, setForm] = useState({
    portfolio_id: 0,
    name: '',
    symbol: 'RELIANCE.NS',
    market: 'indian',
    strategy: 'ema_crossover',
    quantity: 10,
    sl_pct: 0.02,
    rr_ratio: 2.0,
    interval_seconds: 60,
  })
  const [creating, setCreating] = useState(false)

  const loadBots = useCallback(() => {
    botsAPI.list().then(r => setBots(r.data)).catch(() => {})
  }, [])

  // Live updates (M3): refresh bots when a bot trades in the background.
  useEffect(() => { if (eventTick) loadBots() }, [eventTick, loadBots])

  useEffect(() => {
    backtestAPI.strategies().then(r => setStrategies(r.data)).catch(() => {})
    tradingAPI.getPortfolios().then(r => {
      setPortfolios(r.data)
      if (r.data.length) {
        const p = r.data[0]
        setForm(f => ({ ...f, portfolio_id: p.id, market: p.market }))
      }
    }).catch(() => {})
  }, [])

  // Poll bot list every 4s so live status/signals update
  useEffect(() => {
    loadBots()
    const t = setInterval(loadBots, 4000)
    return () => clearInterval(t)
  }, [loadBots])

  // Poll logs of the expanded bot
  useEffect(() => {
    if (expanded == null) return
    const load = () => botsAPI.logs(expanded).then(r => setLogs(r.data)).catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [expanded])

  const onPortfolioChange = (id: number) => {
    const p = portfolios.find(x => x.id === id)
    const market = p?.market || 'indian'
    const sym = market === 'indian' ? 'RELIANCE.NS' : 'BTC/USDT'
    const strat = market === 'indian' ? 'ema_crossover' : 'crypto_trend_rsi'
    const sl = market === 'indian' ? 0.02 : 0.04
    const qty = market === 'indian' ? 10 : 0.05
    setForm(f => ({ ...f, portfolio_id: id, market, symbol: sym, strategy: strat, sl_pct: sl, quantity: qty }))
  }

  const filteredStrategies = strategies.filter(s => s.market === form.market || s.market === 'both')

  const create = async () => {
    if (!form.portfolio_id) { notify('error', 'Select a portfolio first'); return }
    if (!form.name.trim()) { notify('error', 'Give the bot a name'); return }
    setCreating(true)
    try {
      await botsAPI.create(form)
      notify('success', `Bot "${form.name}" created`)
      setForm(f => ({ ...f, name: '' }))
      loadBots()
    } catch (e: any) {
      notify('error', e?.response?.data?.detail || 'Failed to create bot')
    }
    setCreating(false)
  }

  const act = async (id: number, fn: () => Promise<any>, msg: string) => {
    setBusy(id)
    try {
      await fn()
      notify('success', msg)
      loadBots()
      if (expanded === id) botsAPI.logs(id).then(r => setLogs(r.data)).catch(() => {})
    } catch (e: any) {
      notify('error', e?.response?.data?.detail || 'Action failed')
    }
    setBusy(null)
  }

  const runningCount = bots.filter(b => b.status === 'running').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Auto-Trading Bots</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Bots run your chosen strategy automatically — buy on signal, sell on stop-loss / target. Paper trading only.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-gray-400">{runningCount} running</span>
          <span className="text-gray-600">/ {bots.length} total</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Create form */}
        <div className="xl:col-span-1">
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Plus size={15} className="text-indigo-400" /> Create Bot
            </h3>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Portfolio</label>
              <select className="select" value={form.portfolio_id}
                onChange={e => onPortfolioChange(parseInt(e.target.value))}>
                {portfolios.length === 0 && <option value={0}>No portfolios</option>}
                {portfolios.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.market})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Bot Name</label>
              <input className="input" placeholder="e.g. Nifty Swing Bot"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Symbol</label>
              <select className="select" value={form.symbol}
                onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}>
                {form.market === 'indian' ? (
                  <>
                    <optgroup label="Indices">
                      {INDICES.map(i => <option key={i.symbol} value={i.symbol}>{i.label}</option>)}
                    </optgroup>
                    <optgroup label="Stocks">
                      {INDIAN_STOCKS.map(s => <option key={s} value={s}>{s}</option>)}
                    </optgroup>
                  </>
                ) : (
                  CRYPTO_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)
                )}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Strategy</label>
              <select className="select" value={form.strategy}
                onChange={e => setForm(f => ({ ...f, strategy: e.target.value }))}>
                {filteredStrategies.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Quantity</label>
                <input type="number" step="any" className="input font-mono text-right"
                  value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Check every (s)</label>
                <input type="number" className="input font-mono text-right"
                  value={form.interval_seconds} onChange={e => setForm(f => ({ ...f, interval_seconds: parseInt(e.target.value) || 60 }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Stop Loss %</label>
                <input type="number" step="0.005" className="input font-mono text-right text-red-400"
                  value={form.sl_pct} onChange={e => setForm(f => ({ ...f, sl_pct: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">R:R Ratio</label>
                <input type="number" step="0.5" className="input font-mono text-right text-green-400"
                  value={form.rr_ratio} onChange={e => setForm(f => ({ ...f, rr_ratio: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>

            <button onClick={create} disabled={creating} className="btn-primary w-full flex items-center justify-center gap-2">
              {creating ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
              {creating ? 'Creating...' : 'Create Bot'}
            </button>

            <p className="text-[10px] text-gray-600 leading-relaxed">
              Note: stock/index signals use daily candles (slow); stop-loss & target exits check the live price each tick.
              Crypto reacts within the interval.
            </p>
          </div>
        </div>

        {/* Bot list */}
        <div className="xl:col-span-2 space-y-3">
          {bots.length === 0 && (
            <div className="card h-full min-h-64 flex flex-col items-center justify-center text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                <BotIcon size={28} className="text-indigo-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">No bots yet</h3>
              <p className="text-gray-500 text-sm max-w-xs">
                Create a bot to let a strategy trade automatically against a paper portfolio.
              </p>
            </div>
          )}

          {bots.map(bot => {
            const currency = bot.market === 'indian' ? '₹' : '$'
            const isOpen = expanded === bot.id
            return (
              <div key={bot.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold text-sm truncate">{bot.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        bot.status === 'running'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {bot.status === 'running' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1 animate-pulse" />}
                        {bot.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-gray-300 font-mono">{bot.symbol}</span>
                      <span>{bot.strategy}</span>
                      <span>qty {bot.quantity}</span>
                      <span>SL {(bot.sl_pct * 100).toFixed(1)}% · RR {bot.rr_ratio}</span>
                      <span>every {bot.interval_seconds}s</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {bot.status === 'running' ? (
                      <button title="Stop" onClick={() => act(bot.id, () => botsAPI.stop(bot.id), 'Bot stopped')}
                        disabled={busy === bot.id} className="btn-ghost !px-2 !py-1.5 text-red-400 hover:bg-red-500/10">
                        <Square size={14} />
                      </button>
                    ) : (
                      <button title="Start" onClick={() => act(bot.id, () => botsAPI.start(bot.id), 'Bot started')}
                        disabled={busy === bot.id} className="btn-ghost !px-2 !py-1.5 text-green-400 hover:bg-green-500/10">
                        <Play size={14} />
                      </button>
                    )}
                    <button title="Run once now" onClick={() => act(bot.id, () => botsAPI.runOnce(bot.id), 'Tick executed')}
                      disabled={busy === bot.id} className="btn-ghost !px-2 !py-1.5 text-indigo-400 hover:bg-indigo-500/10">
                      {busy === bot.id ? <Loader size={14} className="animate-spin" /> : <Zap size={14} />}
                    </button>
                    <button title="Delete" onClick={() => act(bot.id, () => botsAPI.remove(bot.id), 'Bot deleted')}
                      disabled={busy === bot.id} className="btn-ghost !px-2 !py-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-[#1e2235] pt-3">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">Last signal</span>
                    <span className={signalBadge(bot.last_signal)}>{bot.last_signal || 'HOLD'}</span>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-500">ran {timeAgo(bot.last_run)}</span>
                  </div>
                  <button onClick={() => setExpanded(isOpen ? null : bot.id)}
                    className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                    Activity {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>

                {bot.message && (
                  <div className="mt-2 text-[11px] text-gray-500 font-mono truncate">{bot.message}</div>
                )}

                {isOpen && (
                  <div className="mt-3 bg-[#111318] border border-[#1e2235] rounded-lg p-3 max-h-64 overflow-y-auto">
                    {logs.length === 0 ? (
                      <div className="text-xs text-gray-600 text-center py-4">No activity yet</div>
                    ) : (
                      <div className="space-y-1.5">
                        {logs.map(log => (
                          <div key={log.id} className="flex items-start gap-2 text-[11px]">
                            <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${
                              log.action.startsWith('BUY') ? 'bg-green-500/20 text-green-400'
                              : log.action.startsWith('SELL') ? 'bg-red-500/20 text-red-400'
                              : log.action === 'ERROR' ? 'bg-red-500/20 text-red-400'
                              : 'bg-gray-500/20 text-gray-400'
                            }`}>{log.action}</span>
                            <span className="text-gray-400 flex-1">{log.message}</span>
                            <span className="text-gray-600 shrink-0">{timeAgo(log.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

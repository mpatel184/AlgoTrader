import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Settings as SettingsIcon, Palette, Sliders, ShieldAlert, Info, Check,
  RotateCcw, Wallet, Zap, Bell,
} from 'lucide-react'
import { tradingAPI, Portfolio } from '../api'
import { useStore } from '../store/useStore'
import PageTransition, { stagger } from '../components/common/PageTransition'

interface Prefs {
  defaultMarket: 'indian' | 'crypto'
  animations: boolean
  notifications: boolean
  compactTables: boolean
  riskPerTrade: number
  rrRatio: number
}

const DEFAULTS: Prefs = {
  defaultMarket: 'indian', animations: true, notifications: true,
  compactTables: false, riskPerTrade: 1, rrRatio: 2,
}

const loadPrefs = (): Prefs => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('algotrader_prefs') || '{}') } }
  catch { return DEFAULTS }
}

export default function Settings() {
  const { notify, setActiveMarket } = useStore()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState<number | null>(null)

  useEffect(() => { tradingAPI.getPortfolios().then((r) => setPortfolios(r.data)).catch(() => {}) }, [])

  const update = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }))

  const save = () => {
    localStorage.setItem('algotrader_prefs', JSON.stringify(prefs))
    setActiveMarket(prefs.defaultMarket)
    setSaved(true)
    notify('success', 'Settings saved')
    setTimeout(() => setSaved(false), 1800)
  }

  const resetPortfolio = async (p: Portfolio) => {
    if (!confirm(`Reset "${p.name}"? This deletes all positions and trade history and restores the starting balance.`)) return
    setResetting(p.id)
    try {
      await tradingAPI.resetPortfolio(p.id)
      notify('success', `${p.name} reset to ${p.market === 'crypto' ? '$' : '₹'}${p.initial_balance.toLocaleString()}`)
      const r = await tradingAPI.getPortfolios()
      setPortfolios(r.data)
    } catch {
      notify('error', 'Failed to reset portfolio')
    } finally {
      setResetting(null)
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center">
              <SettingsIcon size={20} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Settings</h1>
              <p className="text-xs text-gray-500 mt-0.5">Personalize your trading workspace</p>
            </div>
          </div>
          <button onClick={save} className="btn-primary text-xs flex items-center gap-1.5">
            {saved ? <><Check size={13} /> Saved</> : 'Save Changes'}
          </button>
        </div>

        <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-6">
          {/* Appearance */}
          <Section icon={<Palette size={16} />} title="Appearance" desc="Theme and visual preferences">
            <Row label="Theme" hint="Dark theme is optimized for trading sessions">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="w-4 h-4 rounded-full bg-[#0a0b0f] border border-[#1e2235]" />
                Midnight (Dark) <span className="text-[10px] text-gray-600">· default</span>
              </div>
            </Row>
            <Row label="Smooth animations" hint="Framer Motion page & card transitions">
              <Toggle on={prefs.animations} onClick={() => update('animations', !prefs.animations)} />
            </Row>
            <Row label="Compact tables" hint="Tighter row spacing in history & positions">
              <Toggle on={prefs.compactTables} onClick={() => update('compactTables', !prefs.compactTables)} />
            </Row>
          </Section>

          {/* Trading defaults */}
          <Section icon={<Sliders size={16} />} title="Trading Defaults" desc="Applied across new orders and backtests">
            <Row label="Default market" hint="Market loaded when you open the app">
              <div className="flex items-center gap-1 bg-[#111318] border border-[#1e2235] rounded-lg p-1">
                {(['indian', 'crypto'] as const).map((m) => (
                  <button key={m} onClick={() => update('defaultMarket', m)}
                    className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      prefs.defaultMarket === m ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}>{m === 'indian' ? '🇮🇳 Indian' : '🪙 Crypto'}</button>
                ))}
              </div>
            </Row>
            <Row label="Risk per trade" hint="Percentage of capital risked on each position">
              <Stepper value={prefs.riskPerTrade} suffix="%" step={0.5} min={0.5} max={5}
                onChange={(v) => update('riskPerTrade', v)} />
            </Row>
            <Row label="Risk : Reward ratio" hint="Target reward as a multiple of risk">
              <Stepper value={prefs.rrRatio} prefix="1 : " step={0.5} min={1} max={5}
                onChange={(v) => update('rrRatio', v)} />
            </Row>
          </Section>

          {/* Notifications */}
          <Section icon={<Bell size={16} />} title="Notifications" desc="In-app toasts for trade events">
            <Row label="Trade notifications" hint="Show toast when orders fill or bots act">
              <Toggle on={prefs.notifications} onClick={() => update('notifications', !prefs.notifications)} />
            </Row>
          </Section>

          {/* Portfolio management */}
          <Section icon={<Wallet size={16} />} title="Portfolios" desc="Manage your virtual trading accounts">
            {portfolios.length === 0 ? (
              <div className="text-xs text-gray-600 py-2">No portfolios found.</div>
            ) : portfolios.map((p) => {
              const c = p.market === 'crypto' ? '$' : '₹'
              const pnl = p.current_balance - p.initial_balance
              return (
                <div key={p.id} className="flex items-center justify-between py-3 border-b border-[#1e2235] last:border-0">
                  <div>
                    <div className="text-sm font-semibold text-white">{p.name}</div>
                    <div className="text-[11px] text-gray-500">
                      Balance <span className="font-mono text-gray-300">{c}{p.current_balance.toLocaleString()}</span>
                      <span className={`ml-2 font-mono ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {pnl >= 0 ? '+' : ''}{c}{pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => resetPortfolio(p)} disabled={resetting === p.id}
                    className="btn-ghost text-xs flex items-center gap-1.5 text-gray-400 hover:text-yellow-400">
                    <RotateCcw size={13} className={resetting === p.id ? 'animate-spin' : ''} /> Reset
                  </button>
                </div>
              )
            })}
          </Section>

          {/* Danger zone */}
          <div className="glass-card border-red-500/20">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert size={16} className="text-red-400" />
              <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
            </div>
            <p className="text-[11px] text-gray-500 mb-4">Resetting a portfolio wipes its positions, trade history and equity curve. This cannot be undone.</p>
            <div className="flex flex-wrap gap-2">
              {portfolios.map((p) => (
                <button key={p.id} onClick={() => resetPortfolio(p)} disabled={resetting === p.id}
                  className="btn-danger text-xs flex items-center gap-1.5">
                  <Zap size={12} /> Reset {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* About */}
          <Section icon={<Info size={16} />} title="About" desc="">
            <div className="grid grid-cols-2 gap-y-2 text-xs">
              <span className="text-gray-500">Application</span><span className="text-gray-300 text-right">AlgoTrader · Paper Trading</span>
              <span className="text-gray-500">Version</span><span className="text-gray-300 text-right font-mono">1.0.0</span>
              <span className="text-gray-500">Markets</span><span className="text-gray-300 text-right">Indian (NSE) · Crypto</span>
              <span className="text-gray-500">Mode</span><span className="text-right"><span className="text-green-400">● Simulated</span></span>
            </div>
          </Section>
        </motion.div>
      </div>
    </PageTransition>
  )
}

function Section({ icon, title, desc, children }: {
  icon: React.ReactNode; title: string; desc: string; children: React.ReactNode
}) {
  return (
    <motion.div variants={stagger.item} className="glass-card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {desc && <p className="text-[11px] text-gray-500">{desc}</p>}
        </div>
      </div>
      <div className="divide-y divide-[#1e2235]">{children}</div>
    </motion.div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div>
        <div className="text-sm text-gray-200">{label}</div>
        {hint && <div className="text-[11px] text-gray-600 mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-indigo-600' : 'bg-[#1e2235]'}`}>
      <motion.div layout className="w-5 h-5 rounded-full bg-white shadow"
        animate={{ x: on ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
    </button>
  )
}

function Stepper({ value, onChange, step, min, max, prefix, suffix }: {
  value: number; onChange: (v: number) => void; step: number; min: number; max: number; prefix?: string; suffix?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}
        className="w-7 h-7 rounded-lg bg-[#111318] border border-[#1e2235] text-gray-400 hover:text-white">−</button>
      <span className="text-sm font-mono text-white w-16 text-center">{prefix}{value}{suffix}</span>
      <button onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))}
        className="w-7 h-7 rounded-lg bg-[#111318] border border-[#1e2235] text-gray-400 hover:text-white">+</button>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link as LinkIcon, Shield, Zap, AlertTriangle } from 'lucide-react'
import { accountAPI } from '../api'
import BrokerConnect from '../components/Account/BrokerConnect'

export default function Account() {
  const [brokers, setBrokers] = useState<any>({ indian: [], crypto: [] })
  const [connected, setConnected] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const [bRes, cRes] = await Promise.all([accountAPI.brokers(), accountAPI.connected()])
      setBrokers(bRes.data)
      setConnected(cRes.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Live Account</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Connect your real broker account to trade live after validating your strategies
        </p>
      </div>

      {/* Workflow */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-4">Recommended Workflow</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            { step: '01', icon: '📊', label: 'Paper Trade', desc: 'Practice with ₹5L virtual capital on AlgoTrader', active: true },
            { step: '02', icon: '🧪', label: 'Backtest', desc: 'Validate strategies on 1-2 years of historical data', active: false },
            { step: '03', icon: '📈', label: 'Optimize', desc: 'Tune parameters to improve win rate & Sharpe ratio', active: false },
            { step: '04', icon: '🔗', label: 'Go Live', desc: 'Connect your real broker account with small position sizes', active: false },
          ].map(s => (
            <div key={s.step} className={`rounded-xl p-4 border ${s.active ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-[#1e2235] bg-[#111318]'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-indigo-400/50">{s.step}</span>
                <span className="text-lg">{s.icon}</span>
              </div>
              <div className="text-sm font-semibold text-white mb-1">{s.label}</div>
              <div className="text-xs text-gray-500">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature boxes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-3">
            <Zap size={18} className="text-green-400" />
          </div>
          <h4 className="text-sm font-semibold text-white mb-1">Auto Execute</h4>
          <p className="text-xs text-gray-500">Strategies generate signals that can be executed automatically on your connected account</p>
        </div>
        <div className="card text-center">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3">
            <Shield size={18} className="text-indigo-400" />
          </div>
          <h4 className="text-sm font-semibold text-white mb-1">Risk Protected</h4>
          <p className="text-xs text-gray-500">All live trades use the same stop-loss and position sizing rules from your paper trading setup</p>
        </div>
        <div className="card text-center">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={18} className="text-yellow-400" />
          </div>
          <h4 className="text-sm font-semibold text-white mb-1">Start Small</h4>
          <p className="text-xs text-gray-500">Begin with 10% of intended capital. Scale up only after 20+ live trades match backtest performance</p>
        </div>
      </div>

      {/* Connect Section */}
      {loading ? (
        <div className="card h-40 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <BrokerConnect brokers={brokers} connected={connected} onRefresh={load} />
      )}

      {/* API Guide */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-4">📘 Setting Up API Access</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          <div>
            <h4 className="text-indigo-400 font-semibold mb-2">🇮🇳 Zerodha Kite Setup</h4>
            <ol className="space-y-1.5 text-gray-500 list-none">
              {['Go to kite.trade → Create Developer Account', 'Register an app → Get API key & secret', 'Login flow generates daily access token', 'Use access token for all API calls', 'IP whitelist your server for security'].map((s, i) => (
                <li key={i} className="flex gap-2"><span className="text-indigo-400 shrink-0">{i+1}.</span>{s}</li>
              ))}
            </ol>
          </div>
          <div>
            <h4 className="text-yellow-400 font-semibold mb-2">🪙 Binance Setup</h4>
            <ol className="space-y-1.5 text-gray-500 list-none">
              {['Login to binance.com → Account → API Management', 'Create new API key with Trading permission', 'Enable IP restriction (paste your server IP)', 'Set withdrawal restriction = OFF for safety', 'Copy API key & secret to AlgoTrader'].map((s, i) => (
                <li key={i} className="flex gap-2"><span className="text-yellow-400 shrink-0">{i+1}.</span>{s}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

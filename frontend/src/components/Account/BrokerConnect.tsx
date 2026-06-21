import { useState } from 'react'
import { CheckCircle, ExternalLink, Trash2, Plus } from 'lucide-react'
import { accountAPI } from '../../api'
import { useStore } from '../../store/useStore'

interface Broker {
  id: string; name: string; logo: string; color: string; features: string[]; setup_url: string;
}
interface ConnectedAccount {
  id: number; broker: string; market: string; client_id?: string; is_active: number; created_at: string;
}

interface Props {
  brokers: { indian: Broker[]; crypto: Broker[] }
  connected: ConnectedAccount[]
  onRefresh: () => void
}

export default function BrokerConnect({ brokers, connected, onRefresh }: Props) {
  const { notify } = useStore()
  const [selected, setSelected] = useState<{ broker: Broker; market: string } | null>(null)
  const [form, setForm] = useState({ api_key: '', api_secret: '', client_id: '' })
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    if (!selected || !form.api_key || !form.api_secret) {
      return notify('error', 'API Key and Secret are required')
    }
    setLoading(true)
    try {
      await accountAPI.connect({
        broker: selected.broker.id,
        market: selected.market,
        api_key: form.api_key,
        api_secret: form.api_secret,
        client_id: form.client_id || undefined,
      })
      notify('success', `${selected.broker.name} connected successfully`)
      setSelected(null)
      setForm({ api_key: '', api_secret: '', client_id: '' })
      onRefresh()
    } catch (e: any) {
      notify('error', e?.response?.data?.detail || 'Connection failed')
    }
    setLoading(false)
  }

  const handleDisconnect = async (id: number, name: string) => {
    if (!confirm(`Disconnect ${name}?`)) return
    try {
      await accountAPI.disconnect(id)
      notify('success', 'Account disconnected')
      onRefresh()
    } catch {
      notify('error', 'Failed to disconnect')
    }
  }

  const allBrokers = [
    ...brokers.indian.map(b => ({ broker: b, market: 'indian' })),
    ...brokers.crypto.map(b => ({ broker: b, market: 'crypto' })),
  ]

  return (
    <div className="space-y-6">
      {/* Connected Accounts */}
      {connected.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Connected Accounts</h3>
          <div className="space-y-3">
            {connected.map(acc => (
              <div key={acc.id} className="flex items-center justify-between bg-[#111318] rounded-lg p-3 border border-green-500/20">
                <div className="flex items-center gap-3">
                  <CheckCircle size={16} className="text-green-400" />
                  <div>
                    <div className="text-sm font-semibold text-white capitalize">{acc.broker}</div>
                    <div className="text-xs text-gray-500">{acc.market} market{acc.client_id ? ` · ${acc.client_id}` : ''}</div>
                  </div>
                </div>
                <button onClick={() => handleDisconnect(acc.id, acc.broker)}
                  className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warning Banner */}
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
        <div className="flex gap-3">
          <div className="text-xl">⚠️</div>
          <div>
            <div className="text-yellow-400 font-semibold text-sm mb-1">Real Money at Risk</div>
            <div className="text-yellow-400/70 text-xs">
              Connecting a real broker account allows live trading. Only connect after thoroughly backtesting and paper trading your strategies.
              Always start with small position sizes and never risk more than 1% per trade.
            </div>
          </div>
        </div>
      </div>

      {/* Broker Grid */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">🇮🇳 Indian Market Brokers</h3>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {brokers.indian.map(b => (
            <BrokerCard key={b.id} broker={b} market="indian"
              isSelected={selected?.broker.id === b.id}
              onClick={() => setSelected({ broker: b, market: 'indian' })}
            />
          ))}
        </div>
        <h3 className="text-sm font-semibold text-white mb-3">🪙 Crypto Exchanges</h3>
        <div className="grid grid-cols-2 gap-3">
          {brokers.crypto.map(b => (
            <BrokerCard key={b.id} broker={b} market="crypto"
              isSelected={selected?.broker.id === b.id}
              onClick={() => setSelected({ broker: b, market: 'crypto' })}
            />
          ))}
        </div>
      </div>

      {/* Connection Form */}
      {selected && (
        <div className="card border border-indigo-500/30 animate-slide-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Connect {selected.broker.name}</h3>
            <a href={selected.broker.setup_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              <ExternalLink size={12} /> API Docs
            </a>
          </div>

          <div className="space-y-3">
            {selected.broker.id === 'zerodha' || selected.broker.id === 'angel' ? (
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Client ID</label>
                <input type="text" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                  placeholder="e.g. ZZ1234 or A12345" className="input" />
              </div>
            ) : null}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">API Key</label>
              <input type="text" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                placeholder="Your API key" className="input font-mono" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">API Secret</label>
              <input type="password" value={form.api_secret} onChange={e => setForm(f => ({ ...f, api_secret: e.target.value }))}
                placeholder="Your API secret" className="input font-mono" />
            </div>
            <div className="text-xs text-gray-600 bg-[#111318] rounded-lg px-3 py-2">
              🔐 Your credentials are stored locally in the database. Never share your API secret.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSelected(null)} className="flex-1 btn-ghost text-sm">Cancel</button>
              <button onClick={handleConnect} disabled={loading} className="flex-1 btn-primary text-sm flex items-center justify-center gap-2">
                <Plus size={14} /> {loading ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BrokerCard({ broker, market, isSelected, onClick }: {
  broker: Broker; market: string; isSelected: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`card text-left transition-all hover:border-indigo-500/40 ${isSelected ? 'border-indigo-500/60' : ''}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white"
          style={{ background: broker.color }}>
          {broker.logo}
        </div>
        <div>
          <div className="text-sm font-semibold text-white">{broker.name}</div>
          <div className="text-[10px] text-gray-500">{market}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {broker.features.map(f => (
          <span key={f} className="text-[10px] bg-[#111318] text-gray-500 px-1.5 py-0.5 rounded">{f}</span>
        ))}
      </div>
    </button>
  )
}

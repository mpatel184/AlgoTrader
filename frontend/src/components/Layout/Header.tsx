import { useEffect, useState } from 'react'
import { Bell, RefreshCw } from 'lucide-react'
import { marketAPI, Quote } from '../../api'
import { useStore } from '../../store/useStore'

export default function Header() {
  const { activeMarket, setActiveMarket, notifications, dismiss } = useStore()
  const [ticker, setTicker] = useState<Quote[]>([])
  const [loading, setLoading] = useState(false)

  const fetchTicker = async () => {
    setLoading(true)
    try {
      if (activeMarket === 'indian') {
        const res = await marketAPI.indianWatchlist()
        setTicker(res.data.slice(0, 8))
      } else {
        const res = await marketAPI.cryptoWatchlist()
        setTicker(res.data.slice(0, 8))
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchTicker() }, [activeMarket])

  return (
    <>
      {/* Notification stack (most recent on top) */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`px-4 py-3 rounded-xl border text-sm font-medium shadow-2xl animate-slide-in cursor-pointer
              ${n.type === 'success' ? 'bg-green-500/20 border-green-500/30 text-green-400' :
                n.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-400' :
                'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'}`}
            onClick={() => dismiss(n.id)}
          >
            {n.message}
          </div>
        ))}
      </div>

      <header className="fixed top-0 left-56 right-0 h-14 bg-[#0d0f16]/90 backdrop-blur border-b border-[#1e2235] flex items-center z-30">
        {/* Market Switch */}
        <div className="flex items-center gap-1 px-4 border-r border-[#1e2235]">
          <button
            onClick={() => setActiveMarket('indian')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeMarket === 'indian' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            🇮🇳 Indian
          </button>
          <button
            onClick={() => setActiveMarket('crypto')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeMarket === 'crypto' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            🪙 Crypto
          </button>
        </div>

        {/* Ticker Scroll */}
        <div className="flex-1 overflow-hidden px-4">
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
            {ticker.map((q) => (
              <div key={q.symbol} className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400 font-medium">{q.symbol.replace('.NS', '')}</span>
                <span className={`text-xs font-mono font-semibold ${q.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {activeMarket === 'crypto' ? `$${q.price.toLocaleString()}` : `₹${q.price.toLocaleString()}`}
                </span>
                <span className={`text-[10px] font-medium ${q.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {q.change_pct >= 0 ? '+' : ''}{q.change_pct.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4">
          <button
            onClick={fetchTicker}
            disabled={loading}
            className="w-8 h-8 rounded-lg hover:bg-[#1e2235] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="w-8 h-8 rounded-lg hover:bg-[#1e2235] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <Bell size={14} />
          </button>
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white ml-1">
            T
          </div>
        </div>
      </header>
    </>
  )
}

import { TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react'
import { Strategy } from '../../api'

interface Props {
  strategy: Strategy
  signal?: { signal: string; price: number; stop_loss: number; target: number; symbol: string }
  onClick: () => void
  isActive: boolean
}

const marketBadge = (m: string) => {
  if (m === 'indian') return 'text-orange-400 bg-orange-500/10'
  if (m === 'crypto') return 'text-purple-400 bg-purple-500/10'
  return 'text-indigo-400 bg-indigo-500/10'
}

export default function StrategyCard({ strategy, signal, onClick, isActive }: Props) {
  return (
    <button
      onClick={onClick}
      className={`card w-full text-left transition-all hover:border-indigo-500/40 group
        ${isActive ? 'border-indigo-500/60 bg-indigo-500/5' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white leading-tight">{strategy.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${marketBadge(strategy.market)}`}>
              {strategy.market === 'indian' ? '🇮🇳' : strategy.market === 'crypto' ? '🪙' : '🌐'} {strategy.market}
            </span>
            <span className="text-[10px] text-gray-600">{strategy.timeframe}</span>
          </div>
        </div>
        <ChevronRight size={14} className="text-gray-600 group-hover:text-indigo-400 transition-colors mt-0.5" />
      </div>

      <p className="text-xs text-gray-500 mb-3 line-clamp-2">{strategy.description}</p>

      {/* Success rate */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-gray-600">Win Rate</span>
        <span className="text-xs font-semibold text-green-400">{strategy.success_rate}</span>
      </div>

      {/* Current signal */}
      {signal ? (
        <div className={`rounded-lg p-2.5 flex items-center justify-between border
          ${signal.signal === 'BUY' ? 'bg-green-500/10 border-green-500/20' :
            signal.signal === 'SELL' ? 'bg-red-500/10 border-red-500/20' :
            'bg-gray-500/10 border-gray-500/20'}`}>
          <div className="flex items-center gap-2">
            {signal.signal === 'BUY' ? <TrendingUp size={13} className="text-green-400" /> :
             signal.signal === 'SELL' ? <TrendingDown size={13} className="text-red-400" /> :
             <Minus size={13} className="text-gray-400" />}
            <span className={`text-xs font-semibold ${
              signal.signal === 'BUY' ? 'text-green-400' :
              signal.signal === 'SELL' ? 'text-red-400' : 'text-gray-400'
            }`}>{signal.signal}</span>
          </div>
          <span className="text-xs font-mono text-gray-300">{signal.symbol?.replace('.NS', '')}</span>
        </div>
      ) : (
        <div className="rounded-lg p-2.5 bg-[#111318] border border-[#1e2235] text-center">
          <span className="text-[10px] text-gray-600">Click to scan signals</span>
        </div>
      )}
    </button>
  )
}

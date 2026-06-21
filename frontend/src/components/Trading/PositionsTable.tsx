import { useState } from 'react'
import { X, TrendingUp, TrendingDown } from 'lucide-react'
import { Position, tradingAPI } from '../../api'
import { useStore } from '../../store/useStore'

interface Props {
  positions: Position[]
  currency: string
  onSell: () => void
}

export default function PositionsTable({ positions, currency, onSell }: Props) {
  const { notify } = useStore()
  const [closing, setClosing] = useState<number | null>(null)

  const handleClose = async (pos: Position) => {
    setClosing(pos.id)
    try {
      const priceStr = prompt(`Close position for ${pos.symbol}?\nEnter current price (current: ${pos.current_price}):`, String(pos.current_price))
      if (!priceStr) { setClosing(null); return }
      const price = parseFloat(priceStr)
      if (!price || price <= 0) { notify('error', 'Invalid price'); setClosing(null); return }
      await tradingAPI.sell({ position_id: pos.id, price })
      const pnl = (price - pos.avg_price) * pos.quantity
      notify(pnl >= 0 ? 'success' : 'error', `Closed ${pos.symbol}: ${pnl >= 0 ? '+' : ''}${currency}${pnl.toFixed(2)}`)
      onSell()
    } catch (e: any) {
      notify('error', e?.response?.data?.detail || 'Failed to close position')
    }
    setClosing(null)
  }

  if (!positions.length) {
    return (
      <div className="card text-center py-12">
        <div className="text-3xl mb-3">📭</div>
        <div className="text-gray-400 text-sm">No open positions</div>
        <div className="text-gray-600 text-xs mt-1">Buy a stock or crypto to start trading</div>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-white mb-4">Open Positions ({positions.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1e2235]">
              {['Symbol', 'Qty', 'Avg Price', 'Current', 'P&L', 'Stop Loss', 'Target', 'Strategy', ''].map(h => (
                <th key={h} className="text-left text-gray-500 font-medium py-2 pr-4 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map(pos => {
              const pnl = (pos.current_price - pos.avg_price) * pos.quantity
              const pnlPct = ((pos.current_price - pos.avg_price) / pos.avg_price) * 100
              const isProfit = pnl >= 0
              return (
                <tr key={pos.id} className="table-row">
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-white">{pos.symbol.replace('.NS', '')}</div>
                    <div className="text-gray-600 text-[10px]">{pos.market}</div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-gray-300">{pos.quantity}</td>
                  <td className="py-3 pr-4 font-mono text-gray-300">{currency}{pos.avg_price.toFixed(2)}</td>
                  <td className="py-3 pr-4 font-mono text-white">{currency}{(pos.current_price || pos.avg_price).toFixed(2)}</td>
                  <td className="py-3 pr-4">
                    <div className={`font-mono font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                      {isProfit ? '+' : ''}{currency}{pnl.toFixed(2)}
                    </div>
                    <div className={`text-[10px] ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                      {isProfit ? '+' : ''}{pnlPct.toFixed(2)}%
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-red-400">
                    {pos.stop_loss ? `${currency}${pos.stop_loss.toFixed(2)}` : '–'}
                  </td>
                  <td className="py-3 pr-4 font-mono text-green-400">
                    {pos.take_profit ? `${currency}${pos.take_profit.toFixed(2)}` : '–'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-indigo-400 text-[10px]">{pos.strategy || '–'}</span>
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => handleClose(pos)}
                      disabled={closing === pos.id}
                      className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

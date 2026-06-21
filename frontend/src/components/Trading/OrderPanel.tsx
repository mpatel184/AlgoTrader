import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { tradingAPI, Position } from '../../api'
import { useStore } from '../../store/useStore'

interface Props {
  symbol: string
  currentPrice: number
  portfolioId: number
  balance: number
  currency: string
  market: 'indian' | 'crypto'
  positions: Position[]
  onOrderPlaced: () => void
}

export default function OrderPanel({ symbol, currentPrice, portfolioId, balance, currency, market, positions, onOrderPlaced }: Props) {
  const { notify } = useStore()
  const [quantity, setQuantity] = useState('')
  const [stopLossPct, setStopLossPct] = useState('2')
  const [takeProfitPct, setTakeProfitPct] = useState('4')
  const [loading, setLoading] = useState(false)
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY')

  // The open position for this symbol, if any (what a SELL would close).
  const openPosition = positions.find(p => p.symbol === symbol) || null

  const qty = parseFloat(quantity) || 0
  const total = qty * currentPrice
  const sl = currentPrice * (1 - parseFloat(stopLossPct) / 100)
  const tp = currentPrice * (1 + parseFloat(takeProfitPct) / 100)
  const risk = qty * Math.abs(currentPrice - sl)
  const reward = qty * Math.abs(tp - currentPrice)
  const rrRatio = risk > 0 ? (reward / risk).toFixed(1) : '–'
  const riskPct = balance > 0 ? ((risk / balance) * 100).toFixed(2) : '0'

  const handleBuy = async () => {
    if (!qty || qty <= 0) return notify('error', 'Enter a valid quantity')
    if (total > balance) return notify('error', `Insufficient balance. Need ${currency}${total.toFixed(2)}`)

    setLoading(true)
    try {
      // Note: the server prices the fill from the live quote and returns it;
      // the price we send is ignored (kept for compatibility).
      const res = await tradingAPI.buy({
        portfolio_id: portfolioId,
        symbol,
        market,
        quantity: qty,
        price: currentPrice,
        stop_loss: parseFloat(stopLossPct) ? sl : undefined,
        take_profit: parseFloat(takeProfitPct) ? tp : undefined,
        strategy: 'Manual',
      })
      const fill = res.data?.price ?? currentPrice
      notify('success', `BUY ${qty} ${symbol} @ ${currency}${fill.toLocaleString()}`)
      setQuantity('')
      onOrderPlaced()
    } catch (e: any) {
      notify('error', e?.response?.data?.detail || 'Order failed')
    }
    setLoading(false)
  }

  const handleSell = async () => {
    if (!openPosition) return notify('error', `No open position in ${symbol} to sell`)

    setLoading(true)
    try {
      // Selling closes the whole position; the server prices the exit.
      const res = await tradingAPI.sell({ position_id: openPosition.id })
      const fill = res.data?.price ?? currentPrice
      const pnl = res.data?.pnl
      notify('success',
        `SELL ${openPosition.quantity} ${symbol} @ ${currency}${fill.toLocaleString()}` +
        (pnl != null ? ` (P&L ${pnl >= 0 ? '+' : ''}${currency}${pnl.toFixed(2)})` : ''))
      onOrderPlaced()
    } catch (e: any) {
      notify('error', e?.response?.data?.detail || 'Order failed')
    }
    setLoading(false)
  }

  const handleOrder = () => (orderType === 'BUY' ? handleBuy() : handleSell())

  const setMaxQty = () => {
    const maxQty = Math.floor((balance * 0.95) / currentPrice * 1000) / 1000
    setQuantity(String(maxQty))
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Place Order</h3>
        <span className="text-xs text-gray-500 font-mono">{symbol}</span>
      </div>

      {/* Buy/Sell toggle */}
      <div className="flex rounded-lg overflow-hidden border border-[#1e2235]">
        <button
          onClick={() => setOrderType('BUY')}
          className={`flex-1 py-2 text-sm font-semibold transition-all ${
            orderType === 'BUY' ? 'bg-green-600 text-white' : 'bg-[#111318] text-gray-500 hover:text-green-400'
          }`}
        >
          BUY
        </button>
        <button
          onClick={() => setOrderType('SELL')}
          className={`flex-1 py-2 text-sm font-semibold transition-all ${
            orderType === 'SELL' ? 'bg-red-600 text-white' : 'bg-[#111318] text-gray-500 hover:text-red-400'
          }`}
        >
          SELL
        </button>
      </div>

      {/* Price display */}
      <div className="bg-[#111318] rounded-lg p-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">Market Price</span>
        <span className="font-mono font-semibold text-white text-sm">
          {currency}{currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* ─── BUY: quantity + risk inputs ─── */}
      {orderType === 'BUY' && (
        <>
          {/* Quantity */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-400">Quantity</label>
              <button onClick={setMaxQty} className="text-xs text-indigo-400 hover:text-indigo-300">Max</button>
            </div>
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="0.00"
              className="input text-right font-mono"
              min="0"
            />
          </div>

          {/* Stop Loss & Take Profit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Stop Loss %</label>
              <input type="number" value={stopLossPct} onChange={e => setStopLossPct(e.target.value)}
                className="input text-right text-red-400 font-mono" min="0" max="50" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Take Profit %</label>
              <input type="number" value={takeProfitPct} onChange={e => setTakeProfitPct(e.target.value)}
                className="input text-right text-green-400 font-mono" min="0" max="200" />
            </div>
          </div>

          {/* Risk summary */}
          {qty > 0 && (
            <div className="bg-[#111318] rounded-lg p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Cost</span>
                <span className="text-white font-mono">{currency}{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Stop Loss</span>
                <span className="text-red-400 font-mono">{currency}{sl.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Take Profit</span>
                <span className="text-green-400 font-mono">{currency}{tp.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-[#1e2235] pt-1.5">
                <span className="text-gray-500">Risk/Reward</span>
                <span className={`font-semibold ${parseFloat(rrRatio) >= 2 ? 'text-green-400' : 'text-yellow-400'}`}>1:{rrRatio}</span>
              </div>
              {parseFloat(riskPct) > 2 && (
                <div className="flex items-center gap-1.5 text-yellow-400 bg-yellow-500/10 rounded px-2 py-1 mt-1">
                  <AlertTriangle size={11} />
                  <span>Risk {riskPct}% of portfolio (rule: max 1-2%)</span>
                </div>
              )}
            </div>
          )}

          {/* Balance */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Available Balance</span>
            <span className="text-gray-300 font-mono">{currency}{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </>
      )}

      {/* ─── SELL: close the open position for this symbol ─── */}
      {orderType === 'SELL' && (
        openPosition ? (
          <div className="bg-[#111318] rounded-lg p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Position</span>
              <span className="text-white font-mono">{openPosition.quantity} {symbol.replace('.NS', '')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Avg Price</span>
              <span className="text-gray-300 font-mono">{currency}{openPosition.avg_price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-[#1e2235] pt-1.5">
              <span className="text-gray-500">Est. P&L @ market</span>
              <span className={`font-mono font-semibold ${currentPrice >= openPosition.avg_price ? 'text-green-400' : 'text-red-400'}`}>
                {currency}{((currentPrice - openPosition.avg_price) * openPosition.quantity).toFixed(2)}
              </span>
            </div>
            <p className="text-[10px] text-gray-600 pt-1">Sells the entire position at the live market price.</p>
          </div>
        ) : (
          <div className="bg-[#111318] rounded-lg p-3 text-xs text-gray-500">
            No open position in {symbol.replace('.NS', '')} to sell.
          </div>
        )
      )}

      <button
        onClick={handleOrder}
        disabled={loading || (orderType === 'BUY' ? !qty : !openPosition)}
        className={`w-full py-3 rounded-lg font-semibold text-sm transition-all active:scale-[0.99] disabled:opacity-50 ${
          orderType === 'BUY'
            ? 'bg-green-600 hover:bg-green-500 text-white'
            : 'bg-red-600 hover:bg-red-500 text-white'
        }`}
      >
        {loading ? 'Placing...' : `${orderType} ${symbol.replace('.NS', '')}`}
      </button>
    </div>
  )
}

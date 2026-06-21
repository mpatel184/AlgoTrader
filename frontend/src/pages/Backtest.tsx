import { useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { BacktestResult } from '../api'
import BacktestForm from '../components/Backtest/BacktestForm'
import BacktestResults from '../components/Backtest/BacktestResults'

export default function Backtest() {
  const [result, setResult] = useState<BacktestResult | null>(null)
  // Currency follows the market the backtest actually ran on, not the global
  // header toggle — otherwise an Indian run could render with '$'.
  const [resultMarket, setResultMarket] = useState<'indian' | 'crypto'>('indian')
  const currency = resultMarket === 'indian' ? '₹' : '$'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Backtesting</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Test your strategies on historical data before trading with real money
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-1">
          <BacktestForm onResult={(r, market) => { setResult(r); setResultMarket(market) }} />

          {/* Explainer */}
          <div className="card mt-4 space-y-3">
            <h4 className="text-xs font-semibold text-white">How Backtesting Works</h4>
            {[
              { step: '1', text: 'Select symbol, strategy & period' },
              { step: '2', text: 'Set initial capital & risk parameters' },
              { step: '3', text: 'Strategy runs on historical OHLCV data' },
              { step: '4', text: 'Each signal generates a simulated trade' },
              { step: '5', text: 'Stop loss & take profit applied automatically' },
              { step: '6', text: 'Review metrics: win rate, Sharpe, drawdown' },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-2.5 text-xs">
                <div className="w-4 h-4 rounded bg-indigo-600/20 text-indigo-400 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                  {s.step}
                </div>
                <span className="text-gray-400">{s.text}</span>
              </div>
            ))}
          </div>

          {/* Risk warning */}
          <div className="card mt-4 bg-yellow-500/5 border-yellow-500/20">
            <div className="text-yellow-400 font-semibold text-xs mb-2">⚠️ Remember</div>
            <div className="text-yellow-400/70 text-xs space-y-1">
              <p>Past performance does not guarantee future results.</p>
              <p>Always paper trade first before going live.</p>
              <p>Backtests can have survivorship bias.</p>
            </div>
          </div>
        </div>

        <div className="xl:col-span-3">
          {result ? (
            <BacktestResults result={result} currency={currency} />
          ) : (
            <div className="card h-full min-h-64 flex flex-col items-center justify-center text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                <FlaskConical size={28} className="text-indigo-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">Ready to Backtest</h3>
              <p className="text-gray-500 text-sm max-w-xs">
                Configure a strategy and run a backtest to see performance metrics, equity curve, and trade log.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-4 text-xs">
                {[
                  { label: 'Win Rate', value: '65-70%', note: 'EMA Crossover' },
                  { label: 'Sharpe', value: '1.2+', note: 'Good strategies' },
                  { label: 'Max DD', value: '<15%', note: 'Target threshold' },
                ].map(m => (
                  <div key={m.label} className="bg-[#111318] rounded-lg p-3 border border-[#1e2235]">
                    <div className="text-gray-500">{m.label}</div>
                    <div className="text-indigo-400 font-bold mt-1">{m.value}</div>
                    <div className="text-gray-600 text-[10px]">{m.note}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

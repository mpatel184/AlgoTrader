import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from 'recharts'
import { BacktestResult } from '../../api'
import { TrendingUp, TrendingDown, Target, BarChart2, Shield, Award } from 'lucide-react'

interface Props {
  result: BacktestResult
  currency: string
}

const MetricCard = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) => (
  <div className="bg-[#111318] rounded-xl p-4 border border-[#1e2235]">
    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{label}</div>
    <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
    {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
  </div>
)

export default function BacktestResults({ result, currency }: Props) {
  const { summary, gross, costs, trades, equity_curve } = result
  const isProfit = summary.total_return >= 0

  const equityData = equity_curve.map(e => ({
    time: e.time.slice(0, 10),
    value: e.value,
  }))

  const tradePnlData = trades.slice(0, 30).map((t, i) => ({
    i: i + 1,
    pnl: t.pnl,
  }))

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Summary Banner */}
      <div className={`card border ${isProfit ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 mb-1">Total Return</div>
            <div className={`text-3xl font-bold font-mono ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
              {isProfit ? '+' : ''}{summary.total_return.toFixed(2)}%
            </div>
            <div className="text-sm text-gray-400 mt-1">
              {currency}{summary.initial_capital.toLocaleString()} → {currency}{summary.final_value.toLocaleString()}
            </div>
          </div>
          <div className="text-6xl opacity-20">{isProfit ? '📈' : '📉'}</div>
        </div>
      </div>

      {/* Net vs Gross (cost transparency) */}
      {gross && costs && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Net vs Gross</h3>
            <span className="text-[10px] text-gray-500">
              {costs.commission_bps}bps commission · {costs.slippage_bps}bps slippage per side
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Net Return (after costs)"
              value={`${summary.total_return >= 0 ? '+' : ''}${summary.total_return.toFixed(2)}%`}
              sub="what you'd actually keep"
              color={summary.total_return >= 0 ? 'text-green-400' : 'text-red-400'} />
            <MetricCard label="Gross Return (frictionless)"
              value={`${gross.total_return >= 0 ? '+' : ''}${gross.total_return.toFixed(2)}%`}
              sub="before any costs"
              color={gross.total_return >= 0 ? 'text-green-400' : 'text-red-400'} />
            <MetricCard label="Total Cost Drag"
              value={`${currency}${costs.total_costs.toLocaleString()}`}
              sub="commission + slippage" color="text-yellow-400" />
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Win Rate" value={`${summary.win_rate.toFixed(1)}%`}
          sub={`${summary.winning_trades}W / ${summary.losing_trades}L`}
          color={summary.win_rate >= 50 ? 'text-green-400' : 'text-red-400'} />
        <MetricCard label="Total Trades" value={String(summary.total_trades)}
          sub="completed trades" color="text-white" />
        <MetricCard label="Profit Factor" value={summary.profit_factor >= 9000 ? '∞' : summary.profit_factor.toFixed(2)}
          sub="gross profit / gross loss"
          color={summary.profit_factor >= 1.5 ? 'text-green-400' : summary.profit_factor >= 1 ? 'text-yellow-400' : 'text-red-400'} />
        <MetricCard label="Sharpe Ratio" value={summary.sharpe_ratio.toFixed(2)}
          sub="risk-adjusted return"
          color={summary.sharpe_ratio >= 1 ? 'text-green-400' : summary.sharpe_ratio >= 0 ? 'text-yellow-400' : 'text-red-400'} />
        <MetricCard label="Max Drawdown" value={`${summary.max_drawdown.toFixed(2)}%`}
          sub="peak to trough"
          color={summary.max_drawdown <= 10 ? 'text-green-400' : summary.max_drawdown <= 20 ? 'text-yellow-400' : 'text-red-400'} />
        <MetricCard label="Avg Win" value={`${currency}${summary.avg_win.toFixed(0)}`} sub="per winning trade" color="text-green-400" />
        <MetricCard label="Avg Loss" value={`${currency}${Math.abs(summary.avg_loss).toFixed(0)}`} sub="per losing trade" color="text-red-400" />
        <MetricCard label="Net P&L" value={`${currency}${(summary.final_value - summary.initial_capital).toFixed(0)}`}
          sub="total profit/loss"
          color={summary.final_value >= summary.initial_capital ? 'text-green-400' : 'text-red-400'} />
        {summary.sortino_ratio !== undefined && (
          <MetricCard label="Sortino" value={summary.sortino_ratio.toFixed(2)}
            sub="downside risk-adjusted"
            color={summary.sortino_ratio >= 1 ? 'text-green-400' : summary.sortino_ratio >= 0 ? 'text-yellow-400' : 'text-red-400'} />
        )}
        {summary.calmar_ratio !== undefined && (
          <MetricCard label="Calmar" value={summary.calmar_ratio.toFixed(2)}
            sub="CAGR / max drawdown"
            color={summary.calmar_ratio >= 1 ? 'text-green-400' : summary.calmar_ratio >= 0 ? 'text-yellow-400' : 'text-red-400'} />
        )}
        {summary.exposure_pct !== undefined && (
          <MetricCard label="Exposure" value={`${summary.exposure_pct.toFixed(1)}%`}
            sub="time in market" color="text-white" />
        )}
        {summary.max_consecutive_losses !== undefined && (
          <MetricCard label="Max Consec. Losses" value={String(summary.max_consecutive_losses)}
            sub="worst losing streak"
            color={summary.max_consecutive_losses >= 5 ? 'text-red-400' : 'text-white'} />
        )}
      </div>

      {/* Equity Curve */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-4">Equity Curve</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={equityData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                <stop offset="100%" stopColor={isProfit ? '#22c55e' : '#ef4444'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2235" />
            <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={60}
              tickFormatter={v => `${currency}${(v/1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: '#1e2235', border: '1px solid #2d3250', borderRadius: 8, fontSize: 11 }}
              formatter={(v: any) => [`${currency}${Number(v).toLocaleString()}`, 'Portfolio']}
            />
            <Area type="monotone" dataKey="value" stroke={isProfit ? '#22c55e' : '#ef4444'}
              strokeWidth={2} fill="url(#eqGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Trade P&L Distribution */}
      {tradePnlData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Trade P&L ({Math.min(trades.length, 30)} shown)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={tradePnlData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2235" />
              <XAxis dataKey="i" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={50} tickFormatter={v => `${currency}${v}`} />
              <Tooltip
                contentStyle={{ background: '#1e2235', border: '1px solid #2d3250', borderRadius: 8, fontSize: 11 }}
                formatter={(v: any) => [`${currency}${Number(v).toFixed(2)}`, 'P&L']}
              />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {tradePnlData.map((t, i) => <Cell key={i} fill={t.pnl >= 0 ? '#22c55e' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trade Log */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-4">Trade Log</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1e2235]">
                {['#', 'Entry Date', 'Exit Date', 'Side', 'Entry', 'Exit', 'P&L', 'P&L %', 'Exit Reason'].map(h => (
                  <th key={h} className="text-left text-gray-500 font-medium py-2 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 20).map((t, i) => (
                <tr key={i} className="table-row">
                  <td className="py-2 pr-4 text-gray-600">{i + 1}</td>
                  <td className="py-2 pr-4 text-gray-400 font-mono">{t.entry_date.slice(0, 10)}</td>
                  <td className="py-2 pr-4 text-gray-400 font-mono">{t.exit_date.slice(0, 10)}</td>
                  <td className="py-2 pr-4">
                    <span className={t.side === 'long' ? 'badge-buy' : 'badge-sell'}>{t.side.toUpperCase()}</span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-gray-300">{currency}{t.entry_price.toFixed(2)}</td>
                  <td className="py-2 pr-4 font-mono text-gray-300">{currency}{t.exit_price.toFixed(2)}</td>
                  <td className={`py-2 pr-4 font-mono font-semibold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.pnl >= 0 ? '+' : ''}{currency}{t.pnl.toFixed(2)}
                  </td>
                  <td className={`py-2 pr-4 font-mono text-xs ${t.pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct.toFixed(2)}%
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      t.exit_reason === 'take_profit' ? 'text-green-400 bg-green-500/10' :
                      t.exit_reason === 'stop_loss' ? 'text-red-400 bg-red-500/10' :
                      'text-gray-400 bg-gray-500/10'
                    }`}>{t.exit_reason.replace('_', ' ')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {trades.length > 20 && (
            <div className="text-center text-xs text-gray-600 mt-3">
              Showing 20 of {trades.length} trades
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

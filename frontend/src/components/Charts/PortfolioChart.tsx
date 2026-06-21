import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { format } from 'date-fns'

interface Props {
  data: { timestamp?: string; time?: string; value: number }[]
  initial: number
  currency?: string
}

const CustomTooltip = ({ active, payload, label, currency }: any) => {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="bg-[#1e2235] border border-[#2d3250] rounded-lg px-3 py-2 text-xs">
      <div className="text-gray-400 mb-1">{label}</div>
      <div className="text-white font-mono font-semibold">
        {currency === '₹' ? '₹' : '$'}{val.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </div>
    </div>
  )
}

export default function PortfolioChart({ data, initial, currency = '₹' }: Props) {
  if (!data?.length) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
        No history yet
      </div>
    )
  }

  const chartData = data.map(d => {
    const ts = d.timestamp || d.time || ''
    let label = ''
    try { label = format(new Date(ts), 'MMM dd') } catch { label = ts.slice(0, 10) }
    return { label, value: d.value }
  })

  const isUp = chartData[chartData.length - 1]?.value >= initial
  const color = isUp ? '#22c55e' : '#ef4444'

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2235" />
        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
          tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} width={50} />
        <Tooltip content={<CustomTooltip currency={currency} />} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2}
          fill="url(#colorValue)" dot={false} activeDot={{ r: 3, fill: color }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

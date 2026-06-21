import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface Props {
  label: string
  value: string | number
  sub?: string
  icon?: ReactNode
  trend?: 'up' | 'down' | 'neutral'
  color?: 'green' | 'red' | 'indigo' | 'gold' | 'default'
}

const colorMap = {
  green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  gold: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  default: { bg: 'bg-white/5', text: 'text-white', border: 'border-[#1e2235]' },
}

export default function StatsCard({ label, value, sub, icon, trend, color = 'default' }: Props) {
  const c = colorMap[color]
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="glass-card"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
        {icon && (
          <div className={`w-8 h-8 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center ${c.text}`}>
            {icon}
          </div>
        )}
      </div>
      <div className={`text-2xl font-bold font-mono ${c.text} leading-tight`}>{value}</div>
      {sub && (
        <div className={`text-xs mt-1 ${
          trend === 'up' ? 'text-green-400' :
          trend === 'down' ? 'text-red-400' : 'text-gray-500'
        }`}>
          {trend === 'up' ? '▲ ' : trend === 'down' ? '▼ ' : ''}{sub}
        </div>
      )}
    </motion.div>
  )
}

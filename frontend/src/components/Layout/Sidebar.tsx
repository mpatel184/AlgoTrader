import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, TrendingUp, History, FlaskConical, Brain, Sparkles,
  Bot, Link as LinkIcon, Settings, ChevronRight,
} from 'lucide-react'

const groups: { title: string; links: { to: string; icon: any; label: string }[] }[] = [
  {
    title: 'Trade',
    links: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/trading', icon: TrendingUp, label: 'Trading' },
      { to: '/history', icon: History, label: 'Trade History' },
    ],
  },
  {
    title: 'Analyze',
    links: [
      { to: '/backtest', icon: FlaskConical, label: 'Backtesting' },
      { to: '/strategies', icon: Brain, label: 'Strategies' },
      { to: '/research', icon: Sparkles, label: 'AI Research' },
    ],
  },
  {
    title: 'Automate',
    links: [
      { to: '/bots', icon: Bot, label: 'Auto Bots' },
      { to: '/account', icon: LinkIcon, label: 'Live Account' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-[#0d0f16]/95 backdrop-blur-xl border-r border-[#1e2235] flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#1e2235]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold glow-indigo">
            AT
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">AlgoTrader</div>
            <div className="text-[10px] text-indigo-400 font-medium">Paper Trading</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto no-scrollbar">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600">{group.title}</div>
            <div className="space-y-1">
              {group.links.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group
                     ${isActive
                      ? 'text-indigo-300 bg-indigo-600/15'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span layoutId="sidebar-active"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-indigo-400"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
                      )}
                      <Icon size={16} />
                      <span className="flex-1">{label}</span>
                      <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom badge */}
      <div className="px-4 py-4 border-t border-[#1e2235]">
        <div className="glass rounded-lg p-3 text-center">
          <div className="text-[10px] text-gray-500 mb-1">PAPER TRADING</div>
          <div className="flex items-center justify-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-400 font-medium">Simulated Mode</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

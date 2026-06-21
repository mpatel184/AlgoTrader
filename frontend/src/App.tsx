import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useLiveUpdates } from './hooks/useLiveUpdates'
import Sidebar from './components/Layout/Sidebar'
import Header from './components/Layout/Header'
import Dashboard from './pages/Dashboard'
import Trading from './pages/Trading'
import Backtest from './pages/Backtest'
import Strategies from './pages/Strategies'
import Bots from './pages/Bots'
import Account from './pages/Account'
import History from './pages/History'
import Research from './pages/Research'
import Settings from './pages/Settings'

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trading" element={<Trading />} />
        <Route path="/history" element={<History />} />
        <Route path="/backtest" element={<Backtest />} />
        <Route path="/strategies" element={<Strategies />} />
        <Route path="/research" element={<Research />} />
        <Route path="/bots" element={<Bots />} />
        <Route path="/account" element={<Account />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  useLiveUpdates()   // open the live-updates WebSocket once for the app (M3)
  return (
    <BrowserRouter>
      <div className="min-h-screen app-bg flex">
        <Sidebar />
        <div className="flex-1 ml-56">
          <Header />
          <main className="pt-14 p-6 min-h-screen">
            <AnimatedRoutes />
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

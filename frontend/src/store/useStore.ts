import { create } from 'zustand'
import { Portfolio, Quote } from '../api'

interface AppState {
  activeMarket: 'indian' | 'crypto'
  setActiveMarket: (m: 'indian' | 'crypto') => void

  selectedSymbol: string
  setSelectedSymbol: (s: string) => void

  indianPortfolio: Portfolio | null
  cryptoPortfolio: Portfolio | null
  setPortfolios: (indian: Portfolio | null, crypto: Portfolio | null) => void

  watchlist: Quote[]
  setWatchlist: (q: Quote[]) => void

  // A queue of toasts (M7) — concurrent async/bot events no longer clobber each other.
  notifications: Toast[]
  notify: (type: 'success' | 'error' | 'info', message: string) => void
  dismiss: (id: number) => void

  // Bumped on each live server event (M3); pages watch it to refetch.
  eventTick: number
  bumpEvent: () => void
}

export interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

let _toastId = 0

export const useStore = create<AppState>((set) => ({
  activeMarket: 'indian',
  setActiveMarket: (m) => set({ activeMarket: m, selectedSymbol: m === 'indian' ? 'RELIANCE.NS' : 'BTC/USDT' }),

  selectedSymbol: 'RELIANCE.NS',
  setSelectedSymbol: (s) => set({ selectedSymbol: s }),

  indianPortfolio: null,
  cryptoPortfolio: null,
  setPortfolios: (indian, crypto) => set({ indianPortfolio: indian, cryptoPortfolio: crypto }),

  watchlist: [],
  setWatchlist: (q) => set({ watchlist: q }),

  notifications: [],
  notify: (type, message) => {
    const id = ++_toastId
    set((s) => ({ notifications: [...s.notifications, { id, type, message }] }))
    // Auto-dismiss this specific toast; others are untouched.
    setTimeout(() => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })), 4000)
  },
  dismiss: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  eventTick: 0,
  bumpEvent: () => set((s) => ({ eventTick: s.eventTick + 1 })),
}))

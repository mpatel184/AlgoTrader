import { useEffect } from 'react'
import { useStore } from '../store/useStore'

/**
 * Opens the server WebSocket (M3) and bumps the store's eventTick on each
 * portfolio_update, so pages refetch instead of polling. Auto-reconnects with
 * a fixed backoff if the socket drops.
 */
export function useLiveUpdates() {
  const bumpEvent = useStore((s) => s.bumpEvent)

  useEffect(() => {
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let closed = false

    const connect = () => {
      if (closed) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(`${proto}://${location.host}/ws`)

      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'portfolio_update') bumpEvent()
        } catch {
          /* ignore malformed frames */
        }
      }
      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000)
      }
      socket.onerror = () => socket?.close()
    }

    connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      socket?.close()
    }
  }, [bumpEvent])
}

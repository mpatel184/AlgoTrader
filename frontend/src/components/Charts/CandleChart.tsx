import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode, IChartApi, ISeriesApi } from 'lightweight-charts'
import { Candle } from '../../api'

interface Props {
  candles: Candle[]
  indicators?: {
    ema20?: { time: string; value: number }[]
    ema50?: { time: string; value: number }[]
    ema200?: { time: string; value: number }[]
    rsi?: { time: string; value: number }[]
  }
  signals?: { time: string; signal: number }[]
  height?: number
}

export default function CandleChart({ candles, indicators, signals, height = 420 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#161a24' },
        textColor: '#64748b',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: '#1e2235' },
        horzLines: { color: '#1e2235' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1e2235', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#1e2235', timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height,
    })
    chartRef.current = chart

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    const validCandles = candles
      .filter(c => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
      .map(c => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close }))
    candleSeries.setData(validCandles)

    if (indicators?.ema20?.length) {
      const s = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'EMA20' })
      s.setData(indicators.ema20.map(d => ({ time: d.time as any, value: d.value })))
    }
    if (indicators?.ema50?.length) {
      const s = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 1, title: 'EMA50' })
      s.setData(indicators.ema50.map(d => ({ time: d.time as any, value: d.value })))
    }
    if (indicators?.ema200?.length) {
      const s = chart.addLineSeries({ color: '#6366f1', lineWidth: 2, title: 'EMA200' })
      s.setData(indicators.ema200.map(d => ({ time: d.time as any, value: d.value })))
    }

    // Buy/Sell markers
    if (signals?.length) {
      const markers = signals
        .filter(s => s.signal !== 0)
        .map(s => ({
          time: s.time as any,
          position: s.signal === 1 ? 'belowBar' : 'aboveBar',
          color: s.signal === 1 ? '#22c55e' : '#ef4444',
          shape: s.signal === 1 ? 'arrowUp' : 'arrowDown',
          text: s.signal === 1 ? 'BUY' : 'SELL',
          size: 1,
        })) as any[]
      candleSeries.setMarkers(markers)
    }

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
    }
  }, [candles, indicators, signals, height])

  if (candles.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-gray-500 text-sm bg-[#161a24] rounded-lg">
        <div className="text-center">
          <div className="text-2xl mb-2">📊</div>
          <div>Select a symbol to load chart</div>
        </div>
      </div>
    )
  }

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden" />
}

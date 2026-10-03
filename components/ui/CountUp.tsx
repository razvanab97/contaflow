'use client'
import { useEffect, useRef, useState } from 'react'

// Cifra care "numara" pana la valoarea finala (easing), formatata ro-RO. Respecta
// prefers-reduced-motion (afiseaza direct valoarea).
export default function CountUp({ value, decimals = 0, duration = 900, suffix = '' }: { value: number; decimals?: number; duration?: number; suffix?: string }) {
  const [v, setV] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setV(value); return }
    const start = performance.now(), a = from.current
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const e = 1 - Math.pow(1 - k, 3)
      setV(a + (value - a) * e)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{new Intl.NumberFormat('ro-RO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v)}{suffix}</>
}

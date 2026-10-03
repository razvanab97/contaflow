'use client'
import { useEffect, useState } from 'react'

// Inel de progres SVG; se "umple" animat la montare (porneste de la 0). Peste 100% = verde (gata).
export default function ProgressRing({ pct, size = 56, stroke = 5, label = true, className, title, color }: {
  pct: number; size?: number; stroke?: number; label?: boolean; className?: string; title?: string; color?: string
}) {
  const [shown, setShown] = useState(0)
  useEffect(() => { const id = requestAnimationFrame(() => setShown(pct)); return () => cancelAnimationFrame(id) }, [pct])
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const done = pct >= 100
  return (
    <div className={`${done ? 'ring-done ' : ''}${className || ''}`} title={title} role="img" aria-label={title || `${pct}%`}
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ring-value" style={color && pct < 100 ? { stroke: color } : undefined} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, shown)) / 100)} />
      </svg>
      {label && (
        <span className="display" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(10, Math.round(size * 0.26)), fontWeight: 650, color: done ? 'var(--success)' : 'var(--text-primary)' }}>
          {pct}<span style={{ fontSize: '.6em', marginLeft: 1, color: 'var(--text-muted)' }}>%</span>
        </span>
      )}
    </div>
  )
}

'use client'
import { useState } from 'react'

interface Props {
  title: string
  description?: string
  collapsible?: boolean
  defaultOpen?: boolean
  onDelete?: () => void
  children: React.ReactNode
}

// Reordonarea SECTIUNILOR nu e oferita: ordinea reflecta pozitia reala din sablonul Word
// (detectata dupa text-ancora) - a le amesteca in UI n-ar schimba ordinea in documentul
// generat, ar fi doar inselator. Iconita ⋮⋮ e pastrata ca reper vizual de "bloc", nu ca handle.
export default function ReportSection({ title, description, collapsible = true, defaultOpen = true, onDelete, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
      <div
        onClick={() => collapsible && setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', cursor: collapsible ? 'pointer' : 'default', userSelect: 'none' }}
      >
        <span style={{ color: 'var(--c-444444)', fontSize: 'var(--fs-md)', flexShrink: 0 }}>⋮⋮</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--c-e0e0e0)' }}>{title}</div>
          {description && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-666666)', marginTop: '2px' }}>{description}</div>}
        </div>
        {onDelete && (
          <button onClick={e => { e.stopPropagation(); onDelete() }} title="Șterge" style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '2px 4px' }}>
            ✕
          </button>
        )}
        {collapsible && (
          <svg width="12" height="12" fill="none" stroke="var(--c-666666)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        )}
      </div>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  )
}

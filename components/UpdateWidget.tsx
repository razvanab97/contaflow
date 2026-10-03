'use client'
import { useState } from 'react'
import { UPDATES } from '@/lib/version'

export default function UpdateWidget() {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'fixed', bottom: '8px', left: '16px', zIndex: 9999 }}>
      {open && (
        <div className="menu popover-in" style={{
          position: 'absolute', bottom: '26px', left: 0, width: 'min(360px, calc(100vw - 32px))', maxHeight: '420px', overflowY: 'auto', padding: '12px 14px',
        }}>
          <div className="eyebrow" style={{ marginBottom: '10px' }}>
            Ce s-a schimbat
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {UPDATES.map(u => (
              <div key={u.v} style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 650 }}>#{u.v}</span> {u.text}
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', background: 'transparent', border: 'none', padding: '2px 6px', borderRadius: 'var(--r-xs)' }}
      >
        Update {UPDATES[0].v}
      </button>
    </div>
  )
}

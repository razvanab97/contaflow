'use client'
import { useState } from 'react'
import { UPDATES } from '@/lib/version'

export default function UpdateWidget() {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'fixed', bottom: '6px', left: '20px', zIndex: 9999 }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: '22px', left: 0, width: '320px', maxHeight: '360px', overflowY: 'auto',
          background: 'var(--glass-elevated-bg)', border: '1px solid var(--glass-elevated-border)', borderRadius: '10px', padding: '12px 14px',
          backdropFilter: 'var(--glass-elevated-blur)', WebkitBackdropFilter: 'var(--glass-elevated-blur)',
          boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>
            Ce s-a schimbat
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {UPDATES.map(u => (
              <div key={u.v} style={{ fontSize: '11px', color: 'var(--c-999999)', lineHeight: 1.4 }}>
                <span style={{ color: 'var(--c-666666)', fontWeight: 700 }}>#{u.v}</span> {u.text}
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: '10px', color: 'var(--c-444444)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        Update {UPDATES[0].v}
      </button>
    </div>
  )
}

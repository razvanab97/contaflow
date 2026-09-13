'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { FirmaNav } from '@/components/Sidebar'

interface Props {
  firme: FirmaNav[]
  firmaAtiva: FirmaNav
  luna: string
  lunaInPath: boolean
}

// Bara globala din capul zonei de continut: comutator de firma, cu prefetch, care pastreaza
// luna curenta cand exista in URL. Randata o singura data de ShellClient, nu se remonteaza la
// navigare intre module - doar link-urile se actualizeaza. Nu mai are propriul comutator de
// luna: fiecare pagina de hub/modul il are deja pe al ei (vezi [luna]/page.tsx, MonthSwitcher),
// dublarea lui aici doar producea doua selectoare de luna suprapuse pe ecran.
export default function GlobalHeader({ firme, firmaAtiva, luna, lunaInPath }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <header style={{
      height: '52px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '14px',
      padding: '0 28px', borderBottom: '1px solid var(--glass-surface-border)',
      background: 'var(--glass-surface-bg)',
      backdropFilter: 'var(--glass-surface-blur)', WebkitBackdropFilter: 'var(--glass-surface-blur)',
    }}>
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
            background: 'var(--surface-secondary)', border: '1px solid var(--border-strong)', borderRadius: '8px',
            padding: '6px 10px 6px 12px',
          }}
        >
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: firmaAtiva.culoare, flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{firmaAtiva.nume.replace(' SRL', '')}</span>
          <svg width="11" height="11" fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24" style={{ marginLeft: '2px' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
            <div style={{
              position: 'absolute', top: '38px', left: 0, zIndex: 61, minWidth: '210px',
              background: 'var(--glass-elevated-bg)', border: '1px solid var(--glass-elevated-border)', borderRadius: '10px',
              backdropFilter: 'var(--glass-elevated-blur)', WebkitBackdropFilter: 'var(--glass-elevated-blur)',
              padding: '6px', boxShadow: 'var(--shadow-md)',
            }}>
              {firme.map(f => (
                <Link
                  key={f.id}
                  href={lunaInPath ? `/${f.slug}/${luna}` : `/${f.slug}`}
                  prefetch
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 10px', borderRadius: '6px',
                    background: f.slug === firmaAtiva.slug ? 'var(--accent-soft)' : 'transparent',
                  }}
                >
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: f.culoare, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: f.slug === firmaAtiva.slug ? 600 : 500, color: f.slug === firmaAtiva.slug ? 'var(--accent-hover)' : 'var(--text-secondary)' }}>
                    {f.nume.replace(' SRL', '')}
                  </span>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: f.pct === 100 ? 'var(--success)' : f.pct > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{f.pct}%</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

    </header>
  )
}

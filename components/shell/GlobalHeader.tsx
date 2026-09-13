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
      padding: '0 28px', borderBottom: '1px solid var(--c-1a1a1a)',
    }}>
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
            background: 'var(--c-141414)', border: '1px solid var(--c-262626)', borderRadius: '8px',
            padding: '6px 10px 6px 12px',
          }}
        >
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: firmaAtiva.culoare, flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-eeeeee)' }}>{firmaAtiva.nume.replace(' SRL', '')}</span>
          <svg width="11" height="11" fill="none" stroke="var(--c-888888)" strokeWidth="2" viewBox="0 0 24 24" style={{ marginLeft: '2px' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
            <div style={{
              position: 'absolute', top: '38px', left: 0, zIndex: 61, minWidth: '210px',
              background: 'var(--c-141414)', border: '1px solid var(--c-262626)', borderRadius: '10px',
              padding: '6px', boxShadow: '0 12px 28px rgba(0,0,0,.45)',
            }}>
              {firme.map(f => (
                <Link
                  key={f.id}
                  href={lunaInPath ? `/${f.slug}/${luna}` : `/${f.slug}`}
                  prefetch
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 10px', borderRadius: '6px',
                    background: f.slug === firmaAtiva.slug ? 'var(--overlay-hover)' : 'transparent',
                  }}
                >
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: f.culoare, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: f.slug === firmaAtiva.slug ? 600 : 400, color: 'var(--c-dddddd)' }}>
                    {f.nume.replace(' SRL', '')}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: f.pct === 100 ? 'var(--accent-mint)' : 'var(--c-777777)' }}>{f.pct}%</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

    </header>
  )
}

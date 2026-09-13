'use client'
import { useEffect, useState } from 'react'

type Pref = 'system' | 'light' | 'dark' | 'glass'
const KEY = 'cf-theme'

function resolve(pref: Pref): 'light' | 'dark' | 'glass' {
  if (pref !== 'system') return pref
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function apply(pref: Pref) {
  const resolved = resolve(pref)
  if (resolved === 'dark') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', resolved)
}

const OPTIONS: { key: Pref; label: string; icon: React.ReactNode }[] = [
  {
    key: 'system', label: 'Sistem', icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
    ),
  },
  {
    key: 'light', label: 'Deschis', icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
    ),
  },
  {
    key: 'dark', label: 'Întunecat', icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a6 6 0 009 9 9 9 0 11-9-9z" /></svg>
    ),
  },
  {
    key: 'glass', label: 'Glass', icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v6a9 9 0 01-18 0V3z" /><path d="M7 3v5M17 3v5" /></svg>
    ),
  },
]

// Selector global de aparenta (Sistem/Deschis/Intunecat/Glass), randat in Sidebar - singurul
// element prezent pe absolut orice pagina (dashboard inclusiv, unde GlobalHeader nu exista).
// Persistat in localStorage; scriptul din layout.tsx aplica valoarea inainte de primul paint,
// ca sa nu clipeasca o tema gresita la incarcare.
export default function ThemeSelector() {
  const [pref, setPref] = useState<Pref>('dark')

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Pref) || 'system'
    setPref(stored)
    if (stored === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: light)')
      const onChange = () => apply('system')
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
  }, [])

  function choose(next: Pref) {
    setPref(next)
    localStorage.setItem(KEY, next)
    apply(next)
  }

  return (
    <div style={{ display: 'flex', gap: '2px', padding: '3px', margin: '0 20px 14px', background: 'var(--c-141414)', border: '1px solid var(--border-subtle)', borderRadius: '9px' }}>
      {OPTIONS.map(o => (
        <button
          key={o.key}
          onClick={() => choose(o.key)}
          title={o.label}
          aria-label={o.label}
          aria-pressed={pref === o.key}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '6px 0', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: pref === o.key ? 'var(--surface-elevated)' : 'transparent',
            color: pref === o.key ? 'var(--text-primary)' : 'var(--text-muted)',
            transition: 'background-color .15s ease, color .15s ease',
          }}
        >
          {o.icon}
        </button>
      ))}
    </div>
  )
}

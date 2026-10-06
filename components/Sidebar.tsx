'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ModuleDef } from '@/lib/firma-config'
import ThemeSelector from './shell/ThemeSelector'
import Icon, { MODULE_ICONS } from './ui/Icon'
import ProgressRing from './ui/ProgressRing'

export interface FirmaNav {
  id: string
  slug: string
  nume: string
  culoare: string
  pct: number
}

interface Props {
  firme: FirmaNav[]
  lunaCurenta: string
  lunaLabel: string
  firmaAtiva?: string
  moduleFirma?: ModuleDef[]
  restanteCount?: number
  moduleComplete?: Record<string, boolean>
  open: boolean
  onClose: () => void
  onSearch: () => void
  lunaCalendaristica?: boolean
}

// Navigatia principala, organizata pe 3 niveluri de context: global (Dashboard + firme) ->
// luna firmei active (rezumat + module, in ordinea de lucru) -> date permanente ale firmei
// (furnizori, date personale, modele, facturi de asociat). Pe desktop e fixa (sticky); sub
// 900px devine sertar, deschis din butonul de meniu al header-ului (starea traieste in ShellClient).
export default function Sidebar({ firme, lunaCurenta, lunaLabel, firmaAtiva, moduleFirma, restanteCount, moduleComplete, open, onClose, onSearch, lunaCalendaristica = false }: Props) {
  const pathname = usePathname()
  const isDashboard = pathname === '/dashboard'

  // Derivat din URL (nu primit ca prop) - sidebar-ul e randat din layout-ul comun, care nu are
  // acces la segmentul [modul] al paginii copil.
  const pathParts = pathname.split('/').filter(Boolean)
  const inLunaCurenta = !!firmaAtiva && pathParts[0] === firmaAtiva && pathParts[1] === lunaCurenta
  const modulActiv = inLunaCurenta ? pathParts[2] : undefined
  const isHub = inLunaCurenta && pathParts.length === 2

  // Inchide sertarul pe mobil la orice navigare.
  useEffect(() => { onClose() }, [pathname, onClose])

  // Escape inchide sertarul.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Indicatorul elementului activ aluneca (top/height animate) intre pagini, in loc sa sara.
  const navRef = useRef<HTMLElement>(null)
  const [ind, setInd] = useState<{ top: number; height: number } | null>(null)
  useLayoutEffect(() => {
    function measure() {
      const el = navRef.current?.querySelector<HTMLElement>('.nav-item.is-active')
      setInd(el ? { top: el.offsetTop, height: el.offsetHeight } : null)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [pathname, firmaAtiva, moduleFirma, moduleComplete, restanteCount])

  const firmaObj = firme.find(f => f.slug === firmaAtiva)
  const doneCount = moduleFirma ? moduleFirma.filter(m => moduleComplete?.[m.slug]).length : 0

  const firmaLinks = firmaAtiva ? [
    { href: `/${firmaAtiva}/furnizori`, label: 'Furnizori', icon: 'users', match: '/furnizori' },
    { href: `/${firmaAtiva}/date-personale`, label: 'Date personale', icon: 'idCard', match: '/date-personale' },
    { href: `/${firmaAtiva}/model-documente`, label: 'Model documente', icon: 'fileText', match: '/model-documente' },
    { href: `/${firmaAtiva}/facturi-de-asociat`, label: 'Facturi de asociat', icon: 'link', match: '/facturi-de-asociat' },
  ] : []

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}

      <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="Navigație principală">
        {/* Brand */}
        <div style={{ height: 'var(--header-h)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 0 18px' }}>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px', height: '28px', background: '#fff', border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <img src="/logo-icon.png" alt="" width={18} height={18} />
            </div>
            <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>ContaFlow</span>
          </Link>
          <button onClick={onClose} aria-label="Închide meniul" className="sidebar-close btn btn-ghost btn-icon btn-sm">
            <Icon name="close" />
          </button>
        </div>

        <div style={{ padding: '2px 12px 6px' }}>
          <button type="button" className="search-trigger" onClick={onSearch} aria-label="Caută în toate firmele și documentele">
            <Icon name="search" size={15} />
            <span>Caută peste tot…</span>
            <span className="kbd">⌘K</span>
          </button>
        </div>

        <nav className={`sidebar-scroll${ind ? ' has-indicator' : ''}`} ref={navRef}>
          {ind && <span className="nav-indicator" style={{ top: ind.top, height: ind.height }} aria-hidden="true" />}
          <div className="sidebar-section">
            <Link href="/dashboard" className={`nav-item${isDashboard ? ' is-active' : ''}`} aria-current={isDashboard ? 'page' : undefined}>
              <span className="nav-icon"><Icon name="dashboard" /></span>
              <span className="nav-text">Dashboard</span>
            </Link>
          </div>

          {/* Firme */}
          <div className="sidebar-section">
            <div className="sidebar-label">Firme</div>
            {firme.map(f => {
              const isActive = f.slug === firmaAtiva
              return (
                <Link key={f.id} href={`/${f.slug}/${lunaCurenta}`} className="nav-item"
                  style={isActive ? { color: 'var(--text-primary)', fontWeight: 600, background: 'var(--hover)' } : undefined}>
                  <span className="nav-icon"><span className="dot" style={{ background: f.culoare }} /></span>
                  <span className="nav-text">{f.nume.replace(' SRL', '')}</span>
                  <span className="nav-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: f.pct === 100 ? 'var(--success)' : f.pct > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                    {f.pct}%
                    <ProgressRing pct={f.pct} size={16} stroke={2.5} label={false} color={f.culoare} title={`${f.pct}% din task-uri`} />
                  </span>
                </Link>
              )
            })}
          </div>

          {/* Luna firmei active */}
          {firmaAtiva && moduleFirma && moduleFirma.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-label">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lunaLabel}>{lunaCalendaristica ? `Luna · ${lunaLabel}` : 'Luna contabilă'}</span>
                <span style={{ letterSpacing: 0, textTransform: 'none', fontWeight: 600 }} title="Module complete">{doneCount}/{moduleFirma.length}</span>
              </div>
              <Link href={`/${firmaAtiva}/${lunaCurenta}`} className={`nav-item${isHub ? ' is-active' : ''}`} aria-current={isHub ? 'page' : undefined}>
                <span className="nav-icon"><Icon name="calendar" /></span>
                <span className="nav-text">Rezumatul lunii</span>
              </Link>
              {moduleFirma.map(m => {
                const href = `/${firmaAtiva}/${lunaCurenta}/${m.linkDirect || m.slug}`
                const isCurrentMod = m.slug === modulActiv || (!!m.linkDirect && m.linkDirect === modulActiv)
                const isComplete = !!moduleComplete?.[m.slug]
                return (
                  <Link key={m.slug} href={href}
                    className={`nav-item${isCurrentMod ? ' is-active' : ''}${isComplete && !isCurrentMod ? ' is-done' : ''}`}
                    aria-current={isCurrentMod ? 'page' : undefined}
                    title={isComplete ? `${m.label} — complet` : m.label}>
                    <span className="nav-icon"><Icon name={MODULE_ICONS[m.slug] || 'fileText'} /></span>
                    <span className="nav-text">{m.label}</span>
                    {m.slug === 'facturi-restante' && !!restanteCount && (
                      <span className="badge badge-danger" style={{ height: '18px', padding: '0 6px' }}>{restanteCount}</span>
                    )}
                    {isComplete && (
                      <span style={{ color: 'var(--success)', display: 'inline-flex' }} aria-label="complet"><Icon name="check" size={14} strokeWidth={2.25} /></span>
                    )}
                  </Link>
                )
              })}
            </div>
          )}

          {/* Date permanente ale firmei */}
          {firmaAtiva && (
            <div className="sidebar-section">
              <div className="sidebar-label">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firmaObj ? firmaObj.nume.replace(' SRL', '') : 'Firmă'}</span>
              </div>
              {firmaLinks.map(l => {
                const active = pathname.endsWith(l.match)
                return (
                  <Link key={l.href} href={l.href} className={`nav-item${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
                    <span className="nav-icon"><Icon name={l.icon} /></span>
                    <span className="nav-text">{l.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </nav>

        {/* Subsol: aparenta + luna de lucru. Padding-ul de jos lasa loc widget-ului "Update N". */}
        <div style={{ flexShrink: 0, padding: '12px 14px 34px', borderTop: '1px solid var(--border-subtle)' }}>
          {/* Cronometrul „Timp azi” se montează aici (vezi app/layout.tsx → time-tracking.js) */}
          <div id="tt-mount" className="tt-mount" />
          <ThemeSelector />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', padding: '0 4px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
            <Icon name="calendar" size={13} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lunaLabel}>{lunaCalendaristica ? `Luna ${lunaLabel}` : `Contabilitate ${lunaLabel}`}</span>
          </div>
        </div>
      </aside>
    </>
  )
}

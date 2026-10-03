'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { FirmaNav } from '@/components/Sidebar'
import DocumentSearch from '@/components/DocumentSearch'
import Icon from '@/components/ui/Icon'
import { MODULE_DEFS, type ModuleSlug } from '@/lib/firma-config'
import { accountingShortLabel } from '@/lib/accounting-period'

interface Props {
  firme: FirmaNav[]
  firmaAtiva?: FirmaNav
  luna: string
  lunaInPath: boolean
  onMenu: () => void
}

const PAGINI_FIRMA: Record<string, string> = {
  'furnizori': 'Furnizori',
  'date-personale': 'Date personale',
  'model-documente': 'Model documente',
  'facturi-de-asociat': 'Facturi de asociat',
  'bonuri': 'Bonuri',
}

// Bara de sus a zonei de continut, prezenta pe ORICE pagina: meniu (mobil) + breadcrumb
// contextual (Firma ▾ › Luna › Modul) + cautarea de documente a firmei active. Comutatorul de
// firma pastreaza pagina curenta cand se poate (aceeasi luna/modul, sau aceeasi pagina de firma),
// ca schimbarea firmei sa nu te scoata din contextul in care lucrai.
export default function GlobalHeader({ firme, firmaAtiva, luna, lunaInPath, onMenu }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const menuRef = useRef<HTMLDivElement>(null)
  const parts = pathname.split('/').filter(Boolean)

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  // Unde duce comutatorul de firma: aceeasi luna (+ acelasi modul, daca noua firma il are),
  // aceeasi pagina de firma (furnizori etc.), altfel rezumatul lunii curente.
  function hrefPentruFirma(f: FirmaNav) {
    if (lunaInPath) return `/${f.slug}/${luna}`
    const sub = parts[1]
    if (sub && PAGINI_FIRMA[sub] && sub !== 'bonuri') return `/${f.slug}/${sub}`
    return `/${f.slug}/${luna}`
  }

  const modulSeg = lunaInPath ? parts[2] : undefined
  const modulLabel = modulSeg ? (MODULE_DEFS[modulSeg as ModuleSlug]?.label || PAGINI_FIRMA[modulSeg] || modulSeg) : undefined
  const paginaFirma = !lunaInPath && parts[1] ? PAGINI_FIRMA[parts[1]] : undefined

  return (
    <header className="app-header">
      <button className="header-menu-btn btn btn-ghost btn-icon" onClick={onMenu} aria-label="Deschide meniul">
        <Icon name="menu" size={18} />
      </button>

      <nav className="crumbs" aria-label="Cale de navigare">
        {!firmaAtiva ? (
          <span className="crumb-current">{pathname === '/dashboard' ? 'Dashboard' : 'ContaFlow'}</span>
        ) : (
          <>
            <div ref={menuRef} style={{ position: 'relative', minWidth: 0 }}>
              <button
                onClick={() => setOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                className="btn btn-ghost"
                style={{ height: '32px', padding: '0 8px', gap: '8px', color: 'var(--text-primary)', fontWeight: 600, maxWidth: '100%' }}
              >
                <span className="dot" style={{ background: firmaAtiva.culoare }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{firmaAtiva.nume.replace(' SRL', '')}</span>
                <Icon name="chevronDown" size={14} style={{ color: 'var(--text-muted)' }} />
              </button>

              {open && (
                <div className="menu popover-in" role="menu" style={{ top: '38px', left: 0, minWidth: '240px' }}>
                  <div className="eyebrow" style={{ padding: '6px 10px 4px' }}>Schimbă firma</div>
                  {firme.map(f => {
                    const active = f.slug === firmaAtiva.slug
                    return (
                      <Link
                        key={f.id}
                        href={hrefPentruFirma(f)}
                        prefetch
                        role="menuitem"
                        onClick={() => setOpen(false)}
                        className={`menu-item${active ? ' is-active' : ''}`}
                      >
                        <span className="dot" style={{ background: f.culoare }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nume.replace(' SRL', '')}</span>
                        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: f.pct === 100 ? 'var(--success)' : f.pct > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{f.pct}%</span>
                        {active && <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {lunaInPath && (
              <>
                <Icon name="chevronRight" size={14} className="crumb-sep hide-mobile" />
                {modulLabel ? (
                  <Link href={`/${firmaAtiva.slug}/${luna}`} className="crumb-link hide-mobile">{accountingShortLabel(luna)}</Link>
                ) : (
                  <span className="crumb-current hide-mobile">{accountingShortLabel(luna)}</span>
                )}
              </>
            )}
            {(modulLabel || paginaFirma) && (
              <>
                <Icon name="chevronRight" size={14} className="crumb-sep" />
                <span className="crumb-current">{modulLabel || paginaFirma}</span>
              </>
            )}
          </>
        )}
      </nav>

      {firmaAtiva && <DocumentSearch firmaId={firmaAtiva.id} culoare={firmaAtiva.culoare} />}
    </header>
  )
}

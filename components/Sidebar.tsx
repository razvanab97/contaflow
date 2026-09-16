'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ModuleDef } from '@/lib/firma-config'
import DocumentSearch from './DocumentSearch'
import ThemeSelector from './shell/ThemeSelector'

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
}

export default function Sidebar({ firme, lunaCurenta, lunaLabel, firmaAtiva, moduleFirma, restanteCount, moduleComplete }: Props) {
  const pathname = usePathname()
  const isDashboard = pathname === '/dashboard'
  const [open, setOpen] = useState(false)

  // Derivat din URL (nu primit ca prop) ca sidebar-ul sa poata fi randat dintr-un layout
  // comun [firma]/[luna]/layout.tsx, care nu are acces la segmentul [modul] al paginii copil.
  const pathParts = pathname.split('/').filter(Boolean)
  const modulActiv = firmaAtiva && pathParts[0] === firmaAtiva && pathParts[1] === lunaCurenta ? pathParts[2] : undefined

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3" style={{ height: '56px', padding: '0 16px', background: 'var(--glass-surface-bg)', backdropFilter: 'var(--glass-surface-blur)', WebkitBackdropFilter: 'var(--glass-surface-blur)', borderBottom: '1px solid var(--glass-surface-border)' }}>
        <button
          onClick={() => setOpen(true)}
          aria-label="Deschide meniul"
          style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--c-ffffff)', flexShrink: 0 }}
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        </button>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/logo-icon.png" alt="ContaFlow" width={18} height={18} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--c-ffffff)', letterSpacing: '-0.3px' }}>ContaFlow</span>
        </Link>
      </div>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,.5)' }}
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 h-screen z-50 transition-transform duration-200 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          width: '240px', flexShrink: 0,
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'var(--glass-surface-blur)',
          WebkitBackdropFilter: 'var(--glass-surface-blur)',
          borderRight: '1px solid var(--glass-surface-border)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '22px 20px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '30px', height: '30px', background: 'var(--c-ffffff)',
              borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <img src="/logo-icon.png" alt="ContaFlow" width={20} height={20} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--c-ffffff)', letterSpacing: '-0.3px' }}>ContaFlow</span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Închide meniul"
            className="md:hidden flex items-center justify-center"
            style={{ width: '28px', height: '28px', background: 'transparent', border: 'none', color: 'var(--c-999999)', flexShrink: 0 }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <ThemeSelector />

      {/* Back to hub (when in module page) */}
      {firmaAtiva && modulActiv && (
        <Link href={`/${firmaAtiva}/${lunaCurenta}`} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 20px', marginBottom: '4px',
          fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)',
          transition: 'color .15s',
        }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Înapoi la hub
        </Link>
      )}

      <div style={{ height: '1px', background: 'var(--c-1a1a1a)', margin: '0 16px 14px' }}/>

      {/* Firme */}
      <div style={{ padding: '0 20px 8px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
        Firme
      </div>
      {firme.map(f => {
        const isActive = f.slug === firmaAtiva
        return (
          <Link key={f.id} href={`/${f.slug}/${lunaCurenta}`} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 20px',
            background: isActive ? 'var(--accent-soft)' : 'transparent',
            borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
            transition: 'background-color .14s ease, border-color .14s ease',
          }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: f.culoare, flexShrink: 0,
            }}/>
            <span style={{ flex: 1, fontSize: '13px', fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--accent-hover)' : 'var(--text-secondary)', lineHeight: 1.3 }}>
              {f.nume.replace(' SRL', '')}
            </span>
            <span style={{
              fontSize: '11.5px', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: f.pct === 100 ? 'var(--success)' : f.pct > 0 ? 'var(--accent)' : 'var(--text-muted)',
            }}>
              {f.pct}%
            </span>
          </Link>
        )
      })}

      {/* Cautare documente (cand suntem in contextul unei firme) */}
      {firmaAtiva && (
        <>
          <div style={{ height: '1px', background: 'var(--c-1a1a1a)', margin: '14px 16px 12px' }}/>
          <DocumentSearch firmaId={firme.find(f => f.slug === firmaAtiva)?.id || ''} culoare={firme.find(f => f.slug === firmaAtiva)?.culoare || 'var(--c-888888)'}/>
        </>
      )}

      {/* Furnizori link (when in a firm context) */}
      {firmaAtiva && (
        <>
          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '14px 16px 4px' }}/>
          <Link href={`/${firmaAtiva}/furnizori`} style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: '7px 20px',
            background: pathname.endsWith('/furnizori') ? 'var(--accent-soft)' : 'transparent',
            borderLeft: pathname.endsWith('/furnizori') ? '3px solid var(--accent)' : '3px solid transparent',
          }}>
            <svg width="11" height="11" fill="none" stroke={pathname.endsWith('/furnizori') ? 'var(--accent-hover)' : 'var(--text-muted)'} strokeWidth="2" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <span style={{ fontSize: '13px', fontWeight: pathname.endsWith('/furnizori') ? 600 : 500, color: pathname.endsWith('/furnizori') ? 'var(--accent-hover)' : 'var(--text-secondary)' }}>Furnizori</span>
          </Link>
          <Link href={`/${firmaAtiva}/date-personale`} style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: '7px 20px',
            background: pathname.endsWith('/date-personale') ? 'var(--accent-soft)' : 'transparent',
            borderLeft: pathname.endsWith('/date-personale') ? '3px solid var(--accent)' : '3px solid transparent',
          }}>
            <svg width="11" height="11" fill="none" stroke={pathname.endsWith('/date-personale') ? 'var(--accent-hover)' : 'var(--text-muted)'} strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 14h8M8 17h5"/>
            </svg>
            <span style={{ fontSize: '13px', fontWeight: pathname.endsWith('/date-personale') ? 600 : 500, color: pathname.endsWith('/date-personale') ? 'var(--accent-hover)' : 'var(--text-secondary)' }}>Date personale</span>
          </Link>
          <Link href={`/${firmaAtiva}/model-documente`} style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: '7px 20px',
            background: pathname.endsWith('/model-documente') ? 'var(--accent-soft)' : 'transparent',
            borderLeft: pathname.endsWith('/model-documente') ? '3px solid var(--accent)' : '3px solid transparent',
          }}>
            <svg width="11" height="11" fill="none" stroke={pathname.endsWith('/model-documente') ? 'var(--accent-hover)' : 'var(--text-muted)'} strokeWidth="2" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>
            </svg>
            <span style={{ fontSize: '13px', fontWeight: pathname.endsWith('/model-documente') ? 600 : 500, color: pathname.endsWith('/model-documente') ? 'var(--accent-hover)' : 'var(--text-secondary)' }}>Model documente</span>
          </Link>
          <Link href={`/${firmaAtiva}/facturi-de-asociat`} style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: '7px 20px',
            background: pathname.endsWith('/facturi-de-asociat') ? 'var(--accent-soft)' : 'transparent',
            borderLeft: pathname.endsWith('/facturi-de-asociat') ? '3px solid var(--accent)' : '3px solid transparent',
          }}>
            <svg width="11" height="11" fill="none" stroke={pathname.endsWith('/facturi-de-asociat') ? 'var(--accent-hover)' : 'var(--text-muted)'} strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            <span style={{ fontSize: '13px', fontWeight: pathname.endsWith('/facturi-de-asociat') ? 600 : 500, color: pathname.endsWith('/facturi-de-asociat') ? 'var(--accent-hover)' : 'var(--text-secondary)' }}>Facturi de asociat</span>
          </Link>
        </>
      )}

      {/* Module sub-nav (when in a firm's hub or module) */}
      {firmaAtiva && moduleFirma && moduleFirma.length > 0 && (
        <>
          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '14px 16px 12px' }}/>
          <div style={{ padding: '0 20px 8px', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Module
          </div>
          {moduleFirma.map(m => {
            const href = m.linkDirect
              ? `/${firmaAtiva}/${lunaCurenta}/${m.linkDirect}`
              : `/${firmaAtiva}/${lunaCurenta}/${m.slug}`
            const isCurrentMod = m.slug === modulActiv
            const isComplete = !!moduleComplete?.[m.slug]
            return (
              <Link key={m.slug} href={href} style={{
                display: 'flex', alignItems: 'center', gap: '9px',
                padding: '7px 20px',
                background: isCurrentMod ? 'var(--accent-soft)' : 'transparent',
                borderLeft: isCurrentMod ? '3px solid var(--accent)' : '3px solid transparent',
              }}>
                <div style={{
                  width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
                  background: isCurrentMod ? 'var(--accent)' : 'var(--border-strong)',
                }}/>
                <span style={{
                  flex: 1, minWidth: 0,
                  fontSize: '13px', fontWeight: isCurrentMod ? 600 : 500,
                  color: isCurrentMod ? 'var(--accent-hover)' : isComplete ? 'var(--text-muted)' : 'var(--text-secondary)',
                  textDecoration: isComplete ? 'line-through' : 'none',
                }}>
                  {m.label}
                </span>
                {m.slug === 'facturi-restante' && !!restanteCount && (
                  <span style={{
                    fontSize: '11px', fontWeight: 700, color: 'var(--danger)',
                    background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
                    borderRadius: '20px', padding: '1px 7px', flexShrink: 0,
                  }}>
                    {restanteCount}
                  </span>
                )}
              </Link>
            )
          })}
        </>
      )}

      {/* Bottom */}
      <div style={{ marginTop: 'auto', padding: '16px 20px 26px', borderTop: '1px solid var(--c-1a1a1a)' }}>
        <Link href="/dashboard" style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          fontSize: '13px', fontWeight: 500, color: isDashboard ? 'var(--accent-hover)' : 'var(--text-secondary)',
          marginBottom: '8px',
        }}>
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          Dashboard
        </Link>
        <div style={{ fontSize: '12px', fontWeight: 450, color: 'var(--text-muted)' }}>{lunaLabel}</div>
      </div>
    </aside>
    </>
  )
}

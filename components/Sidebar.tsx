'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ModuleDef } from '@/lib/firma-config'
import { rgb, legibil } from '@/lib/colors'
import DocumentSearch from './DocumentSearch'

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
  modulActiv?: string
  moduleFirma?: ModuleDef[]
  restanteCount?: number
}

export default function Sidebar({ firme, lunaCurenta, lunaLabel, firmaAtiva, modulActiv, moduleFirma, restanteCount }: Props) {
  const pathname = usePathname()
  const isDashboard = pathname === '/dashboard'
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3" style={{ height: '56px', padding: '0 16px', background: '#0D0D0D', borderBottom: '1px solid #1A1A1A' }}>
        <button
          onClick={() => setOpen(true)}
          aria-label="Deschide meniul"
          style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#FFF', flexShrink: 0 }}
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        </button>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/logo-icon.png" alt="ContaFlow" width={18} height={18} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFF', letterSpacing: '-0.3px' }}>ContaFlow</span>
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
          background: '#0D0D0D',
          borderRight: '1px solid #1A1A1A',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '22px 20px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '30px', height: '30px', background: '#FFF',
              borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <img src="/logo-icon.png" alt="ContaFlow" width={20} height={20} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFF', letterSpacing: '-0.3px' }}>ContaFlow</span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Închide meniul"
            className="md:hidden flex items-center justify-center"
            style={{ width: '28px', height: '28px', background: 'transparent', border: 'none', color: '#999', flexShrink: 0 }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

      {/* Back to hub (when in module page) */}
      {firmaAtiva && modulActiv && (
        <Link href={`/${firmaAtiva}/${lunaCurenta}`} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 20px', marginBottom: '4px',
          fontSize: '12px', fontWeight: 500, color: '#999',
          transition: 'color .15s',
        }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Înapoi la hub
        </Link>
      )}

      <div style={{ height: '1px', background: '#1A1A1A', margin: '0 16px 14px' }}/>

      {/* Firme */}
      <div style={{ padding: '0 20px 8px', fontSize: '11px', fontWeight: 700, color: '#777', letterSpacing: '.1em', textTransform: 'uppercase' }}>
        Firme
      </div>
      {firme.map(f => {
        const isActive = f.slug === firmaAtiva
        const r = rgb(f.culoare)
        return (
          <Link key={f.id} href={`/${f.slug}/${lunaCurenta}`} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 20px',
            background: isActive ? `rgba(${r},.06)` : 'transparent',
            borderLeft: isActive ? `2px solid ${f.culoare}` : '2px solid transparent',
            transition: 'background .15s',
          }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: f.culoare, flexShrink: 0,
            }}/>
            <span style={{ flex: 1, fontSize: '13px', fontWeight: isActive ? 600 : 400, color: isActive ? '#EEE' : '#888', lineHeight: 1.3 }}>
              {f.nume.replace(' SRL', '')}
            </span>
            <span style={{
              fontSize: '11px', fontWeight: 600,
              color: f.pct === 100 ? '#6EE7B0' : f.pct > 0 ? legibil(f.culoare) : '#666',
            }}>
              {f.pct}%
            </span>
          </Link>
        )
      })}

      {/* Cautare documente (cand suntem in contextul unei firme) */}
      {firmaAtiva && (
        <>
          <div style={{ height: '1px', background: '#1A1A1A', margin: '14px 16px 12px' }}/>
          <DocumentSearch firmaId={firme.find(f => f.slug === firmaAtiva)?.id || ''} culoare={firme.find(f => f.slug === firmaAtiva)?.culoare || '#888'}/>
        </>
      )}

      {/* Furnizori link (when in a firm context) */}
      {firmaAtiva && (
        <>
          <div style={{ height: '1px', background: '#1A1A1A', margin: '14px 16px 4px' }}/>
          <Link href={`/${firmaAtiva}/furnizori`} style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: '7px 20px',
            background: pathname.endsWith('/furnizori') ? 'rgba(255,255,255,.04)' : 'transparent',
            borderLeft: pathname.endsWith('/furnizori') ? '2px solid #555' : '2px solid transparent',
          }}>
            <svg width="11" height="11" fill="none" stroke={pathname.endsWith('/furnizori') ? '#CCC' : '#555'} strokeWidth="2" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <span style={{ fontSize: '12px', fontWeight: 400, color: pathname.endsWith('/furnizori') ? '#DDD' : '#777' }}>Furnizori</span>
          </Link>
          <Link href={`/${firmaAtiva}/date-personale`} style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: '7px 20px',
            background: pathname.endsWith('/date-personale') ? 'rgba(255,255,255,.04)' : 'transparent',
            borderLeft: pathname.endsWith('/date-personale') ? '2px solid #555' : '2px solid transparent',
          }}>
            <svg width="11" height="11" fill="none" stroke={pathname.endsWith('/date-personale') ? '#CCC' : '#555'} strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 14h8M8 17h5"/>
            </svg>
            <span style={{ fontSize: '12px', fontWeight: 400, color: pathname.endsWith('/date-personale') ? '#DDD' : '#777' }}>Date personale</span>
          </Link>
          <Link href={`/${firmaAtiva}/model-documente`} style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: '7px 20px',
            background: pathname.endsWith('/model-documente') ? 'rgba(255,255,255,.04)' : 'transparent',
            borderLeft: pathname.endsWith('/model-documente') ? '2px solid #555' : '2px solid transparent',
          }}>
            <svg width="11" height="11" fill="none" stroke={pathname.endsWith('/model-documente') ? '#CCC' : '#555'} strokeWidth="2" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>
            </svg>
            <span style={{ fontSize: '12px', fontWeight: 400, color: pathname.endsWith('/model-documente') ? '#DDD' : '#777' }}>Model documente</span>
          </Link>
        </>
      )}

      {/* Module sub-nav (when in a firm's hub or module) */}
      {firmaAtiva && moduleFirma && moduleFirma.length > 0 && (
        <>
          <div style={{ height: '1px', background: '#1A1A1A', margin: '14px 16px 12px' }}/>
          <div style={{ padding: '0 20px 8px', fontSize: '11px', fontWeight: 700, color: '#777', letterSpacing: '.1em', textTransform: 'uppercase' }}>
            Module
          </div>
          {moduleFirma.map(m => {
            const href = m.linkDirect
              ? `/${firmaAtiva}/${lunaCurenta}/${m.linkDirect}`
              : `/${firmaAtiva}/${lunaCurenta}/${m.slug}`
            const isCurrentMod = m.slug === modulActiv
            const firmaColor = firme.find(f => f.slug === firmaAtiva)?.culoare || '#FFF'
            const r2 = rgb(firmaColor)
            return (
              <Link key={m.slug} href={href} style={{
                display: 'flex', alignItems: 'center', gap: '9px',
                padding: '7px 20px',
                background: isCurrentMod ? `rgba(${r2},.08)` : 'transparent',
                borderLeft: isCurrentMod ? `2px solid ${firmaColor}` : '2px solid transparent',
              }}>
                <div style={{
                  width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
                  background: isCurrentMod ? firmaColor : '#333',
                }}/>
                <span style={{
                  flex: 1, minWidth: 0,
                  fontSize: '12px', fontWeight: isCurrentMod ? 600 : 400,
                  color: isCurrentMod ? '#DDD' : '#999',
                }}>
                  {m.label}
                </span>
                {m.slug === 'facturi-restante' && !!restanteCount && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700, color: '#F87171',
                    background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.3)',
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
      <div style={{ marginTop: 'auto', padding: '16px 20px 26px', borderTop: '1px solid #1A1A1A' }}>
        <Link href="/dashboard" style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          fontSize: '12px', color: isDashboard ? '#999' : '#888',
          marginBottom: '8px',
        }}>
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          Dashboard
        </Link>
        <div style={{ fontSize: '12px', color: '#777' }}>{lunaLabel}</div>
      </div>
    </aside>
    </>
  )
}

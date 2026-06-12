'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ModuleDef } from '@/lib/firma-config'

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
}

function rgb(h: string) {
  return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`
}

export default function Sidebar({ firme, lunaCurenta, lunaLabel, firmaAtiva, modulActiv, moduleFirma }: Props) {
  const pathname = usePathname()
  const isDashboard = pathname === '/dashboard'

  return (
    <aside style={{
      width: '240px', flexShrink: 0,
      background: '#0D0D0D',
      borderRight: '1px solid #1A1A1A',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh',
      overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ padding: '22px 20px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '30px', height: '30px', background: '#FFF',
          borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="14" height="14" fill="none" stroke="#0A0A0A" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          </svg>
        </div>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFF', letterSpacing: '-0.3px' }}>ContaFlow</span>
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
              color: f.pct === 100 ? '#6EE7B0' : f.pct > 0 ? f.culoare : '#666',
            }}>
              {f.pct}%
            </span>
          </Link>
        )
      })}

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
                  fontSize: '12px', fontWeight: isCurrentMod ? 600 : 400,
                  color: isCurrentMod ? '#DDD' : '#999',
                }}>
                  {m.label}
                </span>
              </Link>
            )
          })}
        </>
      )}

      {/* Bottom */}
      <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #1A1A1A' }}>
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
  )
}

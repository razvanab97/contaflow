'use client'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { LUNI_SHORT, accountingPeriodLabel, accountingWorkLabel, currentWorkMonthKey, etichetaLunaScurta, maxWorkMonthKey, workMonthLabel } from '@/lib/accounting-period'
import { esteLunaCalendaristica, modulInLuna, type ModuleSlug } from '@/lib/firma-config'

// AAAA-LL +/- n luni, fara Date/fus orar
export function mutaLuna(luna: string, delta: number) {
  const [a, m] = luna.split('-').map(Number), t = a * 12 + (m - 1) + delta
  return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`
}
// luna de lucru -> luna contabila scurta („Oct 2026”)
const contabilaScurta = (l: string) => { const [a, m] = mutaLuna(l, -1).split('-'); return `${LUNI_SHORT[Number(m)]} ${a}` }

// Comutator de luna (‹ perioada ›), comun hub-ului, paginilor de modul si Dashboard-ului. Click pe perioada
// deschide o grila cu lunile anului (salt direct la orice luna, plus „Luna curentă”). Se poate merge pana la o
// luna peste cea curenta (maxWorkMonthKey) - cerut direct, "avem documente de pus pe luna urmatoare"; restul
// lunilor viitoare raman inactive. La firme, grila arata luna contabila (octombrie = lucrata in noiembrie); la proiecte, luna calendaristica.
// Link-ul: `/${slug}/${luna}${suffix}` sau, fara slug, `${prefix}${luna}` (Dashboard: „/dashboard?luna=”).
// Daca `suffix` e un modul care nu exista in luna aleasa (ex. Airbnb doar in anumite luni), duce la rezumatul lunii.
// `compact` = doar eticheta + dropdown cu grila (fara sagetile ‹ ›), pentru breadcrumb-ul de sus
// (GlobalHeader) - cerut direct: „sa se poata selecta luna si de aici de sus, simplu”. In compact, grila se
// randeaza printr-un portal in <body>, cu position:fixed, pentru ca `.crumbs` din header are `overflow:hidden`
// si ar taia complet un dropdown pozitionat normal (motivul pentru care „nu se deschidea nimic”).
export default function MonthNav({ slug, luna, suffix = '', prefix, compact = false }: { slug?: string; luna: string; suffix?: string; prefix?: string; compact?: boolean }) {
  const calendar = slug ? esteLunaCalendaristica(slug) : false
  const curenta = currentWorkMonthKey()
  // maxLuna = cea mai avansata luna in care se poate intra (curenta + 1). curenta ramane folosita separat
  // pentru evidentierea lunii curente in grila si pentru butonul „↺ Luna curentă”.
  const maxLuna = maxWorkMonthKey()
  const href = (l: string) => {
    if (!slug) return `${prefix ?? '/dashboard?luna='}${l}`
    const mod = suffix.split('/')[1] as ModuleSlug | undefined
    const pastreaza = !mod || !modulInLuna(slug, mod) || modulInLuna(slug, mod, l)
    return `/${slug}/${l}${pastreaza ? suffix : ''}`
  }
  // anul din grila: la firme, al lunii contabile (luna de lucru - 1)
  const anAfisat = (l: string) => Number((calendar ? l : mutaLuna(l, -1)).slice(0, 4))
  const [open, setOpen] = useState(false)
  const [an, setAn] = useState(() => anAfisat(luna))
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setOpen(false) }, [luna])
  useEffect(() => {
    if (!open) return
    setAn(anAfisat(luna))
    // In compact, popover-ul e portat in <body>, deci nu mai e in `ref` - verificam si `popRef`, altfel
    // orice click in grila (ex. pe o luna) ar inchide popover-ul inainte sa se inregistreze.
    const jos = (e: MouseEvent) => { const t = e.target as Node; if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', jos); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', jos); document.removeEventListener('keydown', esc) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Compact: calculeaza pozitia fixa a popover-ului din dreptunghiul butonului (si o reface la scroll/resize).
  useEffect(() => {
    if (!open || !compact) return
    const masoara = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      // Sub bara (header), nu doar sub buton - butonul e inset in header, altfel popover-ul ar acoperi
      // 6px din bara. Fara header in jur (alte folosiri compact), cade pe marginea de jos a butonului.
      const hb = btnRef.current?.closest('header')?.getBoundingClientRect().bottom ?? r.bottom
      const w = 264, g = 12
      setPos({ top: Math.max(r.bottom, hb) + 6, left: Math.max(g, Math.min(r.left, window.innerWidth - w - g)) })
    }
    masoara()
    window.addEventListener('resize', masoara); window.addEventListener('scroll', masoara, true)
    return () => { window.removeEventListener('resize', masoara); window.removeEventListener('scroll', masoara, true) }
  }, [open, compact])

  const urm = mutaLuna(luna, 1), anMax = anAfisat(maxLuna)

  const grila = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setAn(a => a - 1)} aria-label="Anul anterior"><Icon name="chevronLeft" /></button>
        <b style={{ fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }}>{an}</b>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setAn(a => Math.min(anMax, a + 1))} disabled={an >= anMax} aria-label="Anul următor" style={{ opacity: an >= anMax ? .35 : 1 }}><Icon name="chevronRight" /></button>
      </div>
      {!calendar && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center' }}>Luna contabilă · se lucrează în luna următoare</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {LUNI_SHORT.slice(1).map((nume, i) => {
          const afis = `${an}-${String(i + 1).padStart(2, '0')}`, lucru = calendar ? afis : mutaLuna(afis, 1)
          if (lucru > maxLuna) return <span key={nume} className="month-chip" data-off="true" title="Prea departe — doar până la luna următoare">{nume}</span>
          return <Link key={nume} href={href(lucru)} onClick={() => setOpen(false)} className="month-chip" data-activa={lucru === luna} data-curenta={lucru === curenta}
            title={calendar ? workMonthLabel(lucru) : `${accountingPeriodLabel(lucru)} · ${accountingWorkLabel(lucru)}`}>{nume}</Link>
        })}
      </div>
      {luna !== curenta && <Link href={href(curenta)} onClick={() => setOpen(false)} className="btn btn-sm" style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}>↺ Luna curentă · {calendar ? workMonthLabel(curenta) : contabilaScurta(curenta)}</Link>}
    </>
  )

  return (
    <div ref={ref} style={compact
      ? { position: 'relative', display: 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%' }
      : { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', maxWidth: '100%' }}>
      {!compact && (
        <Link href={href(mutaLuna(luna, -1))} prefetch aria-label="Luna anterioară" title="Luna anterioară" className="btn btn-ghost btn-icon btn-sm">
          <Icon name="chevronLeft" />
        </Link>
      )}
      <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog" title="Alege luna"
        style={compact
          ? { display: 'flex', alignItems: 'center', gap: 6, height: '32px', padding: '0 8px', border: 0, borderRadius: 'var(--r-sm)', background: open ? 'var(--hover)' : 'transparent', cursor: 'pointer', minWidth: 0, color: 'var(--text-primary)', font: 'inherit', fontWeight: 600 }
          : { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px', border: 0, borderRadius: 'var(--r-sm)', background: open ? 'var(--hover)' : 'transparent', cursor: 'pointer', minWidth: 0, lineHeight: 1.2, textAlign: 'center', color: 'inherit', font: 'inherit' }}>
        {compact ? (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--fs-md)' }}>{etichetaLunaScurta(luna, calendar)}</span>
        ) : (
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{calendar ? workMonthLabel(luna) : accountingPeriodLabel(luna)}</span>
            {!calendar && <span style={{ display: 'block', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{accountingWorkLabel(luna)}</span>}
          </span>
        )}
        <Icon name="chevronDown" size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>
      {!compact && (urm > maxLuna
        ? <span className="btn btn-ghost btn-icon btn-sm" aria-disabled="true" title="Nu poți merge mai departe de luna următoare" style={{ opacity: .35, cursor: 'default' }}><Icon name="chevronRight" /></span>
        : <Link href={href(urm)} prefetch aria-label="Luna următoare" title="Luna următoare" className="btn btn-ghost btn-icon btn-sm"><Icon name="chevronRight" /></Link>)}

      {open && !compact && (
        <div role="dialog" aria-label="Alege luna" className="month-pop">{grila}</div>
      )}
      {open && compact && typeof document !== 'undefined' && createPortal(
        <div ref={popRef} role="dialog" aria-label="Alege luna" className="month-pop" style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto' }}>{grila}</div>,
        document.body,
      )}
    </div>
  )
}

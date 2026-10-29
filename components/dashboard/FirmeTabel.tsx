'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import CopyButton from '@/components/CopyButton'
import MarcheazaPlata from '@/components/MarcheazaPlata'
import Icon from '@/components/ui/Icon'
import Sparkline from '@/components/ui/Sparkline'
import { deschideDocument } from '@/lib/vizualizare'
import type { ItemDeFacut } from '@/lib/de-facut'
import css from './Dashboard.module.css'

// Firmele pe Dashboard, ca tabel: un rand pe firma cu informatiile generale (task-uri, restante, incasari,
// urmatorul pas, „Deschide luna”); click pe rand deschide dedesubt „De facut”, modulele lunii si datele firmei.
// Se deschide o singura firma odata; ultima deschisa se tine minte in browser.

export interface ModulRand { slug: string; label: string; href: string; stare: 'ok' | 'next' | 'todo' | 'none' }
export interface RandFirma {
  id: string; slug: string; nume: string; culoare: string; initiale: string
  done: number; total: number; lunaInceputa: boolean; restante: number; discrepante: number
  linkLuna: string; luna: string
  urmator: { label: string; detaliu: string; href: string } | null
  module: ModulRand[]
  deFacut: ItemDeFacut[]
  date: { label: string; value: string; mono?: boolean }[]
  acte: { id: string; nume: string; tip: string }[]
}

const CHEIE = 'cf:dashboard-firma-deschisa'
const fmt = (v: number) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(v || 0)

function Incasari({ f }: { f: RandFirma }) {
  const [serie, setSerie] = useState<number[] | null>(null)
  useEffect(() => {
    fetch(`/api/luna/istoric?firmaId=${encodeURIComponent(f.id)}&firmaSlug=${encodeURIComponent(f.slug)}&luna=${encodeURIComponent(f.luna)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setSerie((Array.isArray(d?.istoric) ? d.istoric : []).filter((p: { initializata: boolean; incasari: number; plati: number }) => p.initializata && (p.incasari > 0 || p.plati > 0)).map((p: { incasari: number }) => p.incasari)))
      .catch(() => setSerie([]))
  }, [f.id, f.slug, f.luna])
  if (serie === null) return <div className={css.inc}><span className="skeleton" style={{ height: 14, width: 60 }} /></div>
  if (serie.length < 2) return <div className={css.inc}><span className={css.n} data-ton="zero">—</span></div>
  return (
    <div className={css.inc} title="Încasări pe ultimele luni (lei + valută, echivalent lei)">
      <span className={css.n}>{fmt(serie[serie.length - 1])}</span>
      <Sparkline values={serie} color={f.culoare} title="Încasări pe ultimele luni" />
    </div>
  )
}

function termen(z: number | null | undefined) {
  if (z == null) return null
  if (z < 0) return { text: `depășit cu ${-z} ${-z === 1 ? 'zi' : 'zile'}`, ton: 'bad' }
  if (z === 0) return { text: 'termen azi', ton: 'bad' }
  return { text: `în ${z} ${z === 1 ? 'zi' : 'zile'}`, ton: z <= 5 ? 'warn' : 'mute' }
}

function Rand({ f, deschis, comuta }: { f: RandFirma; deschis: boolean; comuta: (slug: string) => void }) {
  const [toate, setToate] = useState(false)
  const vizibile = toate ? f.deFacut : f.deFacut.slice(0, 4)
  const pct = f.total ? Math.round(f.done / f.total * 100) : 0
  const stare = !f.lunaInceputa ? { t: 'Neîncepută', ton: 'mute' } : f.total && f.done >= f.total ? { t: 'Finalizată', ton: 'ok' } : f.done ? { t: 'În lucru', ton: 'warn' } : { t: 'Neîncepută', ton: 'mute' }
  return (
    <div className={css.row} id={`firma-${f.slug}`} data-open={deschis} style={{ ['--fc' as string]: f.culoare }}>
      <div className={`${css.rh} ${css.cols}`} role="button" tabIndex={0} aria-expanded={deschis} aria-controls={`detalii-${f.slug}`}
        onClick={() => comuta(f.slug)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); comuta(f.slug) } }}>
        <div className={css.fn}>
          <span className={css.glyph}>{f.initiale}</span>
          <div style={{ minWidth: 0 }}>
            <b>{f.nume}</b>
            <div className={css.badges}>
              <span className={css.pill} data-ton={stare.ton}>{stare.t}</span>
              {f.discrepante > 0 && <span className={css.pill} data-ton="warn">{f.discrepante} {f.discrepante === 1 ? 'discrepanță' : 'discrepanțe'} preț</span>}
            </div>
          </div>
        </div>
        <div className={css.prog}><div className={css.bar}><b style={{ width: `${pct}%` }} /></div><span>{f.done}/{f.total} · {pct}%</span></div>
        <div className={css.cRest}><span className={css.n} data-ton={f.restante ? 'bad' : 'zero'}>{f.restante || '—'}</span></div>
        <Incasari f={f} />
        <div className={css.nxt}>{f.urmator ? <>{f.urmator.label}<small>{f.urmator.detaliu}</small></> : <span style={{ color: 'var(--success)' }}>Totul bifat ✓</span>}</div>
        <div className={css.go}>
          <Link href={f.linkLuna} className={`btn btn-sm ${css.btnFirma}`} onClick={e => e.stopPropagation()}>{f.lunaInceputa ? 'Deschide luna' : 'Începe luna'}</Link>
          <span className={css.chev}><Icon name="chevronDown" size={16} /></span>
        </div>
      </div>

      {deschis && (
        <div className={css.rb} id={`detalii-${f.slug}`}>
          <div className={css.blk}>
            <h4>De făcut{f.deFacut.length ? ` · ${f.deFacut.length}` : ''}</h4>
            {f.deFacut.length === 0 ? <div className={css.empty}>Nimic urgent la firma asta.</div> : vizibile.map(it => {
              const t = termen(it.zile)
              return (
                <div key={it.id} className={css.task} data-ton={it.urgenta}>
                  <i />
                  <div style={{ minWidth: 0 }}>
                    <Link href={it.href} className={css.taskT}>{it.titlu}{t && <span className={css.pill} data-ton={t.ton}>{t.text}</span>}</Link>
                    {it.detaliu && <div className={css.taskD}>{it.detaliu}</div>}
                  </div>
                  {it.marcheaza ? <MarcheazaPlata lunaId={it.marcheaza.lunaId} taskKey={it.marcheaza.taskKey} /> : <Link href={it.href} className="btn btn-sm">Deschide</Link>}
                </div>
              )
            })}
            {f.deFacut.length > 4 && <button type="button" className={`btn btn-sm btn-ghost ${css.more}`} onClick={() => setToate(t => !t)}>{toate ? 'Arată mai puține' : `Arată toate (${f.deFacut.length})`}</button>}
          </div>
          <div className={css.blk}>
            <h4>Modulele lunii</h4>
            <div className={css.mods}>
              {f.module.map(m => <Link key={m.slug} href={m.href} className={css.mod} data-stare={m.stare} title={m.stare === 'ok' ? 'bifat' : m.stare === 'next' ? 'următorul' : undefined}>{m.label}</Link>)}
            </div>
          </div>
          <div className={css.blk}>
            <h4>Date firmă</h4>
            {f.date.length === 0 ? <div className={css.empty}>Proiectul nu are date de firmă proprii.</div> : (
              <div>
                {f.date.map(d => (
                  <div key={d.label} className={css.field}>
                    <span className={css.fK} title={d.label}>{d.label}</span>
                    <span className={`${css.fV} ${d.mono ? css.mono : ''}`} title={d.value}>{d.value || '—'}</span>
                    {d.value ? <CopyButton value={d.value} /> : <span />}
                  </div>
                ))}
              </div>
            )}
            {f.acte.length > 0 && (
              <div className={css.docs}>
                {f.acte.map(a => <span key={a.id} title={a.nume}>{a.tip === 'Altul' || a.tip === 'Act' ? (a.nume.length > 32 ? a.nume.slice(0, 30) + '…' : a.nume) : a.tip} · <button type="button" onClick={() => deschideDocument(`/api/firma-date/acte?firmaId=${f.id}&download=${a.id}`, a.nume)}>Vezi</button></span>)}
              </div>
            )}
            <div className={css.docs}><Link href={`/${f.slug}/date-personale`}>Toate datele și actele firmei →</Link></div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FirmeTabel({ firme, implicit }: { firme: RandFirma[]; implicit: string | null }) {
  const [deschis, setDeschis] = useState<string | null>(implicit)

  // Ultima firma deschisa (din browser) si saltul din bara lunii (#firma-<slug>)
  useEffect(() => {
    try { const s = localStorage.getItem(CHEIE); if (s !== null) setDeschis(s || null) } catch {}
    const dinHash = () => { const m = location.hash.match(/^#firma-(.+)$/); if (m && firme.some(f => f.slug === m[1])) setDeschis(m[1]) }
    dinHash(); window.addEventListener('hashchange', dinHash)
    return () => window.removeEventListener('hashchange', dinHash)
  }, [firme])

  const comuta = useCallback((slug: string) => setDeschis(d => {
    const urm = d === slug ? null : slug
    try { localStorage.setItem(CHEIE, urm || '') } catch {}
    return urm
  }), [])

  return (
    <section className={css.tbl} aria-label="Firme">
      <div className={`${css.th} ${css.cols}`} aria-hidden="true"><span>Firmă</span><span>Task-uri lunare</span><span>Restanțe</span><span>Încasări</span><span>Următorul pas</span><span /></div>
      {firme.map(f => <Rand key={f.id} f={f} deschis={deschis === f.slug} comuta={comuta} />)}
    </section>
  )
}

'use client'
import { useState } from 'react'
import Link from 'next/link'
import VeziButon from '@/components/ui/VeziButon'

interface Rezultat {
  id: string; fisierNume: string; furnizor: string; numar: string | null; suma: number | null; valuta: string; data: string | null
  firma: { nume: string; culoare: string; slug: string } | null; sursa: string; sectiune: string
  platita: { data: string | null; suma: number | null } | null; docUrl: string; href: string | null
}
interface Raspuns {
  rezumat: string; rezultate: Rezultat[]; alteSurse: Rezultat[]
  neprocesate: { id: string; fisierNume: string; status: string; motiv: string | null }[]
  filtre: Record<string, unknown>
}

const SURSA: Record<string, string> = { local: 'Folder local', gmail: 'Gmail', oblio: 'e-Factură', module: 'Modul', altele: 'Inbox' }
const EXEMPLE = ['Ce facturi sunt de la VMD în folderul local?', 'Facturile Jumbo din septembrie la ABXHomes', 'Ce facturi neplătite am peste 1000 lei?']
const zi = (d: string | null) => d ? d.split('-').reverse().join('.') : ''
const lei = (v: number | null, valuta = 'RON') => v == null ? '—' : `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} ${valuta}`

function Rand({ r, onSterge, sterge }: { r: Rezultat; onSterge?: (r: Rezultat) => void; sterge?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
      {r.firma && <span title={r.firma.nume} style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.firma.culoare, flexShrink: 0 }} />}
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.fisierNume}>
          {r.furnizor || r.fisierNume}{r.numar ? <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}> · nr. {r.numar}</span> : null}
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
          {[r.firma?.nume?.replace(/\s+S\.?R\.?L\.?$/i, ''), zi(r.data), SURSA[r.sursa] || r.sursa, r.sectiune].filter(Boolean).join(' · ')}
        </div>
      </div>
      <span className="num" style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{lei(r.suma, r.valuta)}</span>
      <span className={r.platita ? 'badge badge-success' : 'badge badge-warning'} title={r.platita?.data ? `Plătită pe ${zi(r.platita.data)}` : undefined}>
        {r.platita ? `plătită${r.platita.data ? ` ${zi(r.platita.data).slice(0, 5)}` : ''}` : 'neasociată'}
      </span>
      <VeziButon url={r.docUrl} nume={r.fisierNume} />
      {r.href && <Link href={r.href} prefetch={false} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--accent)' }}>Deschide</Link>}
      {onSterge && <button type="button" onClick={() => onSterge(r)} disabled={sterge} title={r.sursa === 'local' ? 'Șterge din platformă și din folderul local' : 'Șterge din platformă'} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--danger)', background: 'transparent', border: 'none', cursor: sterge ? 'wait' : 'pointer', padding: '2px 4px' }}>{sterge ? '…' : 'Șterge'}</button>}
    </div>
  )
}

// Cautare in limbaj natural prin facturi (folder local, Gmail, e-Factura, module) - AI-ul traduce
// intrebarea in filtre, cautarea se face exact, pe baza (vezi /api/inbox-facturi/ai-cauta).
export default function AiCautareFacturi() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [r, setR] = useState<Raspuns | null>(null)
  const [error, setError] = useState('')
  const [arataAlte, setArataAlte] = useState(false)
  const [stergeId, setStergeId] = useState<string | null>(null)
  const [mesaj, setMesaj] = useState('')

  // Sterge din platforma; daca factura a venit din folderul local, scriptul de pe Mac muta si
  // fisierul local in Cos (vezi /api/inbox-facturi/sterge si scripts/watch-facturi-locale.js).
  async function sterge(x: Rezultat) {
    const local = x.sursa === 'local'
    if (!confirm(`Ștergi „${x.furnizor || x.fisierNume}${x.numar ? ` nr. ${x.numar}` : ''}” (${lei(x.suma, x.valuta)})?\n\nSe șterge din ContaFlow${local ? ' și fișierul din folderul local e mutat în Coș (Trash) de pe Mac' : ''}.${x.platita ? '\nFactura e asociată unei plăți — plata rămâne fără document.' : ''}`)) return
    setStergeId(x.id); setMesaj('')
    const res = await fetch(`/api/inbox-facturi/sterge?id=${encodeURIComponent(x.id)}`, { method: 'DELETE' }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setStergeId(null)
    if (!res?.ok) { setMesaj(d.error || 'Ștergerea a eșuat'); return }
    setR(prev => prev ? { ...prev, rezultate: prev.rezultate.filter(y => y.id !== x.id), alteSurse: prev.alteSurse.filter(y => y.id !== x.id) } : prev)
    setMesaj(d.fisiereLocale?.length
      ? `Șters din ContaFlow. Fișierul local (${d.fisiereLocale.join(', ')}) va fi mutat în Coș de scriptul de pe Mac în câteva secunde (dacă „npm run watch:facturi” rulează; altfel la următoarea pornire).`
      : 'Șters din ContaFlow.')
  }

  async function cauta(intrebare = q) {
    if (intrebare.trim().length < 3) return
    setQ(intrebare); setBusy(true); setError(''); setArataAlte(false)
    try {
      const res = await fetch('/api/inbox-facturi/ai-cauta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intrebare }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'Căutarea a eșuat'); setR(null) } else setR(d)
    } catch { setError('Conexiunea s-a întrerupt') }
    setBusy(false)
  }

  return (
    <div style={{ marginTop: '14px', padding: '12px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>✨ Întreabă AI despre facturi</div>
      <form onSubmit={e => { e.preventDefault(); cauta() }} style={{ display: 'flex', gap: '8px' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="ex. Ce facturi sunt de la VMD în folderul local?"
          style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-md)', background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '9px 12px', color: 'var(--text-primary)', outline: 'none' }} />
        <button type="submit" className="btn btn-primary" disabled={busy || q.trim().length < 3}>{busy ? 'Caut…' : 'Caută'}</button>
      </form>
      {!r && !busy && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
          {EXEMPLE.map(e => <button key={e} type="button" className="btn btn-sm btn-ghost" onClick={() => cauta(e)} style={{ fontSize: 'var(--fs-xs)' }}>{e}</button>)}
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)', marginTop: '8px' }}>{error}</p>}
      {r && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{r.rezumat}</div>
          {mesaj && <div role="status" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', padding: '6px 8px', borderRadius: 'var(--r-sm)', background: 'var(--surface-secondary)' }}>{mesaj}</div>}
          {r.rezultate.map(x => <Rand key={x.id} r={x} onSterge={sterge} sterge={stergeId === x.id} />)}
          {r.neprocesate.length > 0 && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--warning)', marginTop: '4px' }}>
              În folderul local, încă neprocesate / de atribuit: {r.neprocesate.map(n => `${n.fisierNume}${n.motiv ? ` (${n.motiv})` : ''}`).join(' · ')}
            </div>
          )}
          {r.alteSurse.length > 0 && (
            <div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArataAlte(v => !v)} style={{ paddingLeft: 0 }}>
                {arataAlte ? '▾' : '▸'} Același furnizor, din alte surse sau mutate în alte module ({r.alteSurse.length})
              </button>
              {arataAlte && <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>{r.alteSurse.map(x => <Rand key={x.id} r={x} onSterge={sterge} sterge={stergeId === x.id} />)}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

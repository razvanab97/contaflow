'use client'
import { useCallback, useEffect, useState } from 'react'
import VeziButon from '@/components/ui/VeziButon'

interface Recomandare {
  id: string; fisierNume: string; furnizor: string; numar: string | null; suma: number | null; valuta: string
  data: string | null; tip: string | null; sursa: string; motive: string[]; sigur: boolean
}
const zi = (d: string | null) => d ? d.split('-').reverse().join('.') : 'fără dată'
const lei = (v: number | null, valuta: string) => v == null ? '—' : `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} ${valuta}`

// Facturi + chitanta: facturile din fisierele importate (folder local, Gmail, e-Factura) care par
// platite cash - recomandate aici cu motivul, ca sa fie mutate in modul cu un clic.
export default function RecomandariChitanta({ firmaId, lunaId, onAdaugat }: { firmaId: string; lunaId: string; onAdaugat: () => void }) {
  const [rec, setRec] = useState<Recomandare[] | null>(null)
  const [pos, setPos] = useState<Recomandare[]>([])
  const [arataPosibile, setArataPosibile] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/chitante/recomandari?firmaId=${encodeURIComponent(firmaId)}&lunaId=${encodeURIComponent(lunaId)}`, { cache: 'no-store' }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (!r?.ok) { setError(d.error || 'Recomandările nu au putut fi încărcate'); setRec([]); return }
    setRec(d.recomandate || []); setPos(d.posibile || [])
  }, [firmaId, lunaId])
  useEffect(() => { load() }, [load])

  async function adauga(x: Recomandare) {
    setBusy(x.id); setError('')
    const r = await fetch('/api/chitante/recomandari', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docId: x.id, lunaId }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(null)
    if (!r?.ok) { setError(d.error || 'Documentul nu a putut fi adăugat'); return }
    setRec(prev => (prev || []).filter(y => y.id !== x.id)); setPos(prev => prev.filter(y => y.id !== x.id))
    onAdaugat()
  }

  if (rec === null) return null
  if (!rec.length && !pos.length && !error) return null

  const Rand = ({ x }: { x: Recomandare }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.fisierNume}>
          {x.furnizor || x.fisierNume}{x.numar ? <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}> · nr. {x.numar}</span> : null}
          {x.tip === 'chitanta' && <span className="badge" style={{ marginLeft: '6px' }}>chitanță</span>}
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>{zi(x.data)} · {x.sursa}</div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
          {x.motive.map(m => <span key={m} className={m.startsWith('nicio') ? 'badge' : 'badge badge-success'} style={{ fontSize: 'var(--fs-xs)' }}>{m}</span>)}
        </div>
      </div>
      <span className="num" style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{lei(x.suma, x.valuta)}</span>
      <VeziButon url={`/api/chitante/document?id=${x.id}`} nume={x.fisierNume} />
      <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => adauga(x)}>{busy === x.id ? '…' : 'Adaugă aici'}</button>
    </div>
  )

  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div>
        <div style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--text-primary)' }}>Recomandate din fișiere ({rec.length})</div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Facturi din folderul local / Gmail / e-Factură, neasociate unei plăți bancare, care par plătite cash: au chitanță, furnizorul e plătit cash și în alte luni, sau extrasul nu are nicio plată cu acea sumă. „Adaugă aici” le mută din Inbox Facturi în Facturi + chitanță.
        </div>
      </div>
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)', margin: 0 }}>{error}</p>}
      {rec.length === 0 && <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: 0 }}>Nicio factură sigur plătită cash în această perioadă.</p>}
      {rec.map(x => <Rand key={x.id} x={x} />)}
      {pos.length > 0 && (
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArataPosibile(v => !v)} style={{ paddingLeft: 0 }}>
            {arataPosibile ? '▾' : '▸'} Posibil cash — fără plată cu aceeași sumă în extras ({pos.length})
          </button>
          {arataPosibile && <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>{pos.map(x => <Rand key={x.id} x={x} />)}</div>}
        </div>
      )}
    </div>
  )
}

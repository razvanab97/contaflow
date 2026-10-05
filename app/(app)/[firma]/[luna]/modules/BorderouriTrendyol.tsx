'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

interface Borderou { id: string; ordin: string | null; data: string | null; suma: number | null; valuta: string | null; fisier: string }

function bani(v: number) { return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) }
function zi(d: string | null) { if (!d) return '—'; const [y, m, z] = d.slice(0, 10).split('-'); return `${z}.${m}.${y}` }

// Borderourile Trendyol ale lunii (PaymentOrderDetail_<ordin>_….xlsx): se incarca toate odata, fiecare cu
// data borderoului = ziua in care Trendyol a platit (din extras), pentru introducerea in eCap. Fiecare se
// descarca separat sau toate intr-un .zip. Concluzia Trendyol se calculeaza din ele.
export default function BorderouriTrendyol({ firmaId, lunaId, culoare, onChange }: { firmaId: string; lunaId: string; culoare: string; onChange: () => void }) {
  const [lista, setLista] = useState<Borderou[] | null>(null)
  const [incarc, setIncarc] = useState(false)
  const [drag, setDrag] = useState(false)
  const [rez, setRez] = useState<{ fisier: string; ok: boolean; text: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/trendyol/borderou?lunaId=${encodeURIComponent(lunaId)}`, { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    setLista(d.borderouri || [])
  }, [lunaId])
  useEffect(() => { load() }, [load])

  async function incarca(files: FileList) {
    setIncarc(true); setRez([])
    const fd = new FormData()
    Array.from(files).forEach(f => fd.append('files', f))
    fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
    const res = await fetch('/api/trendyol/borderou', { method: 'POST', body: fd })
    const d = await res.json().catch(() => ({}))
    setRez(d.rezultate || [{ fisier: '', ok: false, text: d.error || 'Eroare la încărcare' }])
    setIncarc(false)
    await load(); onChange()
  }
  async function sterge(b: Borderou) {
    if (!confirm(`Ștergi borderoul ${b.ordin || ''}?`)) return
    await fetch(`/api/trendyol/borderou?id=${encodeURIComponent(b.id)}`, { method: 'DELETE' })
    await load(); onChange()
  }

  const total = (lista || []).reduce((s, b) => s + (b.suma || 0), 0)

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--text-primary)' }}>Borderouri Trendyol</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>Desfășurătoarele plăților (.xlsx) — cu data borderoului pentru eCap; din ele se face concluzia</div>
        </div>
        {!!lista?.length && <a className="btn btn-sm" href={`/api/trendyol/borderou?zip=${encodeURIComponent(lunaId)}`}>↓ Descarcă toate (.zip)</a>}
      </div>

      {lista === null ? <div className="skeleton" style={{ height: '60px' }} /> : lista.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(96px,auto) 1fr auto auto', gap: '4px 14px', alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
            <span className="eyebrow">Data borderou</span><span className="eyebrow">Ordin de plată</span><span className="eyebrow" style={{ textAlign: 'right' }}>Sumă</span><span />
            {lista.map(b => (
              <div key={b.id} style={{ display: 'contents' }}>
                <span className="num" style={{ fontWeight: 650, color: 'var(--text-primary)', padding: '5px 0', borderTop: '1px solid var(--border-subtle)' }}>{zi(b.data)}</span>
                <span style={{ color: 'var(--text-secondary)', padding: '5px 0', borderTop: '1px solid var(--border-subtle)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.fisier}>{b.ordin || '—'}</span>
                <span className="num" style={{ textAlign: 'right', fontWeight: 600, padding: '5px 0', borderTop: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>{b.suma != null ? `${bani(b.suma)} ${b.valuta || 'RON'}` : '—'}</span>
                <span style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', padding: '5px 0', borderTop: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>
                  <a href={`/api/trendyol/borderou?download=${encodeURIComponent(b.id)}`} style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 'var(--fs-xs)' }}>↓ .xlsx</a>
                  <button onClick={() => sterge(b)} aria-label="Șterge borderoul" style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'var(--fs-xs)' }}>✕</button>
                </span>
              </div>
            ))}
            <span style={{ padding: '6px 0', borderTop: '1px solid var(--border)', fontWeight: 650, color: 'var(--text-primary)' }}>Total</span>
            <span style={{ padding: '6px 0', borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>{lista.length} {lista.length === 1 ? 'borderou' : 'borderouri'}</span>
            <span className="num" style={{ textAlign: 'right', padding: '6px 0', borderTop: '1px solid var(--border)', fontWeight: 650 }}>{bani(total)} RON</span>
            <span style={{ borderTop: '1px solid var(--border)' }} />
          </div>
        </div>
      )}

      <div
        onClick={() => !incarc && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (!incarc && e.dataTransfer.files.length) incarca(e.dataTransfer.files) }}
        style={{ border: `1.5px dashed ${drag ? culoare : 'var(--border-hover)'}`, borderRadius: 'var(--r-md)', padding: '14px', textAlign: 'center', cursor: incarc ? 'default' : 'pointer', background: drag ? 'var(--accent-soft)' : 'transparent' }}
      >
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 650, color: incarc ? 'var(--text-muted)' : 'var(--accent)' }}>{incarc ? 'Se citesc borderourile…' : '+ Adaugă borderouri (.xlsx) — toate deodată'}</div>
        {!incarc && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>Trendyol Seller Center → Plăți → PaymentOrderDetail_….xlsx · același borderou încărcat din nou îl înlocuiește</div>}
      </div>
      <input ref={fileRef} type="file" multiple accept=".xlsx" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }} onChange={e => { if (e.target.files?.length) incarca(e.target.files); e.target.value = '' }} />
      {rez.length > 0 && (
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {rez.map((x, i) => <div key={i} style={{ fontSize: 'var(--fs-xs)', color: x.ok ? 'var(--text-muted)' : 'var(--danger)' }}>{x.ok ? '✓' : '✕'} {x.text}{x.fisier ? <span style={{ color: 'var(--text-muted)' }}> · {x.fisier}</span> : null}</div>)}
        </div>
      )}
    </div>
  )
}

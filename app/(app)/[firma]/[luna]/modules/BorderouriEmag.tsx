'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

interface Borderou {
  id: string; tip: string; eticheta: string; platforma: string | null; nr: string | null; data: string | null; suma: number | null; valuta: string; incasari: number | null; curs: number | null; sursaCurs: 'extras' | 'bnr' | null; sumaLei: number | null; incasariLei: number | null; detalii: Record<string, number>; fisier: string
  verificare: { stare: 'ok' | 'diferenta' | 'fara_aviz'; text: string }
}

function bani(v: number) { return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) }
function zi(d: string | null) { if (!d) return '—'; const [y, m, z] = d.slice(0, 10).split('-'); return `${z}.${m}.${y}` }
const CULOARE = { ok: 'var(--success)', diferenta: 'var(--danger)', fara_aviz: 'var(--warning)' } as const
const SEMN = { ok: '✓', diferenta: '✕', fara_aviz: '⚠' } as const

// Borderourile eMAG ale lunii = desfasuratoarele de plata (DP cash + DP card pe fiecare jumatate de luna):
// toate odata, data borderoului pentru eCap, descarcabile, fiecare verificat cu avizul lui.
export default function BorderouriEmag({ firmaId, lunaId, culoare, versiuneAvize = 0 }: { firmaId: string; lunaId: string; culoare: string; versiuneAvize?: number }) {
  const [lista, setLista] = useState<Borderou[] | null>(null)
  const [incarc, setIncarc] = useState(false)
  const [drag, setDrag] = useState(false)
  const [rez, setRez] = useState<{ fisier: string; ok: boolean; text: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/emag/borderou?lunaId=${encodeURIComponent(lunaId)}`, { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    setLista(d.borderouri || [])
  }, [lunaId])
  useEffect(() => { load() }, [load, versiuneAvize])

  async function incarca(files: FileList) {
    setIncarc(true); setRez([])
    const fd = new FormData()
    Array.from(files).forEach(f => fd.append('files', f))
    fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
    const res = await fetch('/api/emag/borderou', { method: 'POST', body: fd })
    const d = await res.json().catch(() => ({}))
    setRez(d.rezultate || [{ fisier: '', ok: false, text: d.error || 'Eroare la încărcare' }])
    setIncarc(false)
    await load()
  }
  async function stergeToate() {
    if (!lista?.length || !confirm(`Ștergi toate cele ${lista.length} desfășurătoare de plată din luna asta?`)) return
    await fetch(`/api/emag/borderou?toate=${encodeURIComponent(lunaId)}`, { method: 'DELETE' })
    setRez([]); await load()
  }
  async function sterge(b: Borderou) {
    if (!confirm(`Ștergi borderoul ${b.nr || ''}?`)) return
    await fetch(`/api/emag/borderou?id=${encodeURIComponent(b.id)}`, { method: 'DELETE' })
    await load()
  }

  const celula = { padding: '6px 0', borderTop: '1px solid var(--border-subtle)' } as const
  const verificate = (lista || []).filter(b => b.verificare.stare === 'ok').length

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--text-primary)' }}>Borderouri eMAG</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>Desfășurătoarele de plată (cash + card, pe fiecare jumătate de lună) — cu data pentru eCap, verificate cu avizele</div>
        </div>
        {!!lista?.length && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <a className="btn btn-sm" href={`/api/emag/borderou?zip=${encodeURIComponent(lunaId)}`}>↓ Descarcă toate (.zip)</a>
            <button className="btn btn-sm" onClick={stergeToate} style={{ color: 'var(--danger)' }}>✕ Șterge toate</button>
          </div>
        )}
      </div>

      {lista === null ? <div className="skeleton" style={{ height: '60px' }} /> : lista.length > 0 && (
        <div style={{ marginBottom: '10px', overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(92px,auto) minmax(220px,1.4fr) auto auto minmax(180px,2fr) auto', gap: '0 14px', alignItems: 'start', fontSize: 'var(--fs-sm)', minWidth: '760px' }}>
            <span className="eyebrow">Data borderou</span><span className="eyebrow">Platformă · tip · ID</span><span className="eyebrow" style={{ textAlign: 'right' }}>Total borderou</span><span className="eyebrow" style={{ textAlign: 'right' }}>Încasări (în aviz)</span><span className="eyebrow">Verificare cu avizul</span><span />
            {lista.map((b, i) => (
              <div key={b.id} style={{ display: 'contents' }}>
                {(i === 0 || lista[i - 1].platforma !== b.platforma) && (
                  <div style={{ gridColumn: '1 / -1', padding: i === 0 ? '8px 0 4px' : '18px 0 4px', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                    {b.platforma || 'eMAG — platformă necunoscută'}
                    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 500, color: 'var(--text-muted)' }}>{b.valuta === 'RON' ? 'lei' : `în lei — eMAG plătește în RON; sumele din fișier (${b.valuta}) convertite la cursul încasării din extras`}</span>
                  </div>
                )}
                <span className="num" style={{ ...celula, fontWeight: 650, color: 'var(--text-primary)' }}>{zi(b.data)}</span>
                <span style={{ ...celula, color: 'var(--text-secondary)', minWidth: 0 }} title={b.fisier}>
                  <span className="badge" style={{ marginRight: '6px', fontWeight: 700, color: b.platforma ? 'var(--accent)' : 'var(--text-muted)' }}>{b.platforma || 'eMAG ?'}</span>
                  {b.eticheta}{b.nr ? <span style={{ color: 'var(--text-muted)' }}> · {b.nr}</span> : null}
                  {Object.keys(b.detalii).length > 1 && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>{Object.entries(b.detalii).map(([k, v]) => `${k} ${bani(v)}`).join(' · ')}</div>}
                </span>
                <span className="num" style={{ ...celula, textAlign: 'right', fontWeight: 650, whiteSpace: 'nowrap' }} title={Object.entries(b.detalii).map(([k, v]) => `${k}: ${bani(v)}`).join('\n')}>
                  {b.valuta === 'RON' ? (b.suma != null ? `${bani(b.suma)} RON` : '—') : (b.sumaLei != null ? `${bani(b.sumaLei)} RON` : 'fără curs')}
                  {b.valuta !== 'RON' && <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 500, color: 'var(--text-muted)' }}>{b.suma != null ? `${bani(b.suma)} ${b.valuta}` : ''}{b.curs ? ` × ${b.curs.toFixed(4)} ${b.sursaCurs === 'extras' ? '(curs încasare)' : '(BNR)'}` : ''}</div>}
                </span>
                <span className="num" style={{ ...celula, textAlign: 'right', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {b.valuta === 'RON' ? (b.incasari != null ? bani(b.incasari) : '—') : (b.incasariLei != null ? bani(b.incasariLei) : '—')}
                  {b.valuta !== 'RON' && b.incasari != null && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{bani(b.incasari)} {b.valuta}</div>}
                </span>
                <span style={{ ...celula, fontSize: 'var(--fs-xs)', color: CULOARE[b.verificare.stare] }}>{SEMN[b.verificare.stare]} {b.verificare.text}</span>
                <span style={{ ...celula, display: 'flex', gap: '12px', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                  <a href={`/api/emag/borderou?download=${encodeURIComponent(b.id)}`} style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 'var(--fs-xs)' }}>↓ .xlsx</a>
                  <button onClick={() => sterge(b)} aria-label="Șterge borderoul" style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'var(--fs-xs)' }}>✕</button>
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '6px', fontSize: 'var(--fs-xs)', color: verificate === lista.length ? 'var(--success)' : 'var(--text-muted)' }}>
            {verificate}/{lista.length} borderouri se potrivesc cu avizele
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
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 650, color: incarc ? 'var(--text-muted)' : 'var(--accent)' }}>{incarc ? 'Se citesc borderourile…' : '+ Adaugă desfășurătoare de plată (.xlsx) — toate deodată'}</div>
        {!incarc && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>Fișierele …_dp_….xlsx din eMAG → Financiar — cash și card, pe fiecare jumătate de lună; cash / card se recunoaște singur</div>}
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

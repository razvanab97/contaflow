'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConcluzieTrendyol as Concluzie, TaxaTrendyol } from '@/lib/trendyol-concluzie'

function lei(v: number, semn = false) {
  const s = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v))
  return `${semn ? (v < 0 ? '−' : v > 0 ? '+' : '') : v < 0 ? '−' : ''}${s}`
}
function zi(d: string | null) { if (!d) return '—'; const [y, m, z] = d.slice(0, 10).split('-'); return `${z}.${m}.${y}` }

function Rand({ label, valoare, detaliu, tare, ton, evidentiat }: { label: string; valoare: number; detaliu?: React.ReactNode; tare?: boolean; ton?: 'plus' | 'minus' | 'total'; evidentiat?: boolean }) {
  const culoare = ton === 'plus' ? 'var(--success)' : ton === 'minus' ? 'var(--danger)' : 'var(--text-primary)'
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: '12px', padding: evidentiat ? '10px 12px' : tare ? '10px 0' : '6px 0',
      borderTop: tare ? '1px solid var(--border)' : undefined,
      ...(evidentiat ? { margin: '6px -12px', borderRadius: 'var(--r-md)', background: 'var(--accent-soft)', border: '1.5px solid var(--accent)' } : {}),
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: tare ? 'var(--fs-base)' : 'var(--fs-md)', fontWeight: tare || evidentiat ? 650 : 500, color: 'var(--text-primary)' }}>{label}</div>
        {detaliu && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '1px' }}>{detaliu}</div>}
      </div>
      <div className="num" style={{ fontSize: tare ? 'var(--fs-lg)' : 'var(--fs-md)', fontWeight: tare ? 650 : 600, color: culoare, whiteSpace: 'nowrap' }}>
        {lei(valoare, ton !== 'total')} <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>lei</span>
      </div>
    </div>
  )
}

function ListaTaxe({ titlu, lista }: { titlu: string; lista: TaxaTrendyol[] }) {
  if (!lista.length) return null
  const total = lista.reduce((s, f) => s + f.suma, 0)
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}><span>{titlu}</span><span className="num">{lei(total)} lei</span></div>
      {lista.map(f => (
        <div key={f.nr + f.ordin} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--fs-sm)' }}>
          <span style={{ color: 'var(--text-secondary)', minWidth: 0 }}>
            {f.nr} <span style={{ color: 'var(--text-muted)' }}>· {zi(f.data)}{f.tip && !/shipping/i.test(f.tip) ? ` · ${f.tip.replace(/ - BV RO$/i, '').toLowerCase()}` : ''}</span>
          </span>
          <span className="num" style={{ whiteSpace: 'nowrap', color: f.facturaIncarcata ? 'var(--text-primary)' : 'var(--warning)' }} title={f.facturaIncarcata ? 'Factura e încărcată' : 'Factura nu e încărcată în Trendyol · Documente'}>
            {lei(f.suma)} {f.facturaIncarcata ? '✓' : '⚠'}
          </span>
        </div>
      ))}
    </div>
  )
}

// Concluzia Trendyol a lunii, ca o cascada (pe modelul eMAG): vanzari -> retururi / reduceri -> comision
// Trendyol -> TRANSPORT (facturi TYD retinute din plata, aratat separat) -> alte taxe -> virat conform
// borderourilor -> incasat in extras -> diferenta de curs -> rezultat net. In dreapta: fiecare incasare
// Trendyol din extras cu borderoul ei (.xlsx) — se incarca aici, toate odata.
export default function ConcluzieTrendyol({ firmaId, lunaId, culoare }: { firmaId: string; lunaId: string; culoare: string }) {
  const [c, setC] = useState<Concluzie | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [incarc, setIncarc] = useState(false)
  const [drag, setDrag] = useState(false)
  const [rez, setRez] = useState<{ fisier: string; ok: boolean; text: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/trendyol/concluzie?lunaId=${encodeURIComponent(lunaId)}`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) setError(d.error || 'Concluzia nu a putut fi calculată')
      else setC(d.concluzie)
    } catch { setError('Conexiunea s-a întrerupt') }
    setLoading(false)
  }, [lunaId])
  useEffect(() => { load() }, [load])

  async function incarca(lista: FileList) {
    setIncarc(true); setRez([])
    const fd = new FormData()
    Array.from(lista).forEach(f => fd.append('files', f))
    fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
    const res = await fetch('/api/trendyol/borderou', { method: 'POST', body: fd })
    const d = await res.json().catch(() => ({ rezultate: [{ fisier: '', ok: false, text: 'Eroare la încărcare' }] }))
    setRez(d.rezultate || [{ fisier: '', ok: false, text: d.error || 'Eroare la încărcare' }])
    setIncarc(false)
    await load()
  }
  async function sterge(id: string) {
    if (!confirm('Ștergi borderoul?')) return
    await fetch(`/api/trendyol/borderou?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    await load()
  }

  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--text-primary)' }}>Concluzia Trendyol</div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>De la vânzări (borderouri) până la banii încasați în extras — cu transportul separat</div>
      </div>
      <button className="btn btn-sm" onClick={load} disabled={loading}>{loading ? 'Se calculează…' : 'Recalculează'}</button>
    </div>
  )

  const zona = (
    <div style={{ marginTop: '10px' }}>
      <div
        onClick={() => !incarc && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (!incarc && e.dataTransfer.files.length) incarca(e.dataTransfer.files) }}
        style={{ border: `1.5px dashed ${drag ? culoare : 'var(--border-hover)'}`, borderRadius: 'var(--r-md)', padding: '12px', textAlign: 'center', cursor: incarc ? 'default' : 'pointer', background: drag ? 'var(--accent-soft)' : 'transparent' }}
      >
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 650, color: incarc ? 'var(--text-muted)' : 'var(--accent)' }}>{incarc ? 'Se citesc borderourile…' : '+ Încarcă borderourile (.xlsx) — toate deodată'}</div>
        {!incarc && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>Fișierele PaymentOrderDetail_….xlsx din Trendyol Seller Center → Plăți; fiecare se leagă singur de încasarea lui</div>}
      </div>
      <input ref={fileRef} type="file" multiple accept=".xlsx" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }} onChange={e => { if (e.target.files?.length) incarca(e.target.files); e.target.value = '' }} />
      {rez.length > 0 && (
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {rez.map((x, i) => <div key={i} style={{ fontSize: 'var(--fs-xs)', color: x.ok ? 'var(--text-muted)' : 'var(--danger)' }}>{x.ok ? '✓' : '✕'} {x.text}{x.fisier ? <span style={{ color: 'var(--text-muted)' }}> · {x.fisier}</span> : null}</div>)}
        </div>
      )}
    </div>
  )

  if (loading && !c) return <div className="card card-pad">{header}<div className="skeleton" style={{ height: '220px' }} /></div>
  if (error) return <div className="card card-pad">{header}<p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{error}</p></div>
  if (!c) return null

  const pct = (v: number) => c.vanzari ? `${Math.round((Math.abs(v) / c.vanzari) * 1000) / 10}% din vânzări` : ''
  const areBorderouri = c.plati.some(p => p.borderou)

  return (
    <div className="card card-pad">
      {header}
      {c.avertismente.length > 0 && (
        <div role="alert" style={{ marginBottom: '12px', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--warning-soft)', color: 'var(--warning)', fontSize: 'var(--fs-sm)' }}>
          {c.avertismente.map((a, i) => <div key={i}>⚠ {a}</div>)}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: '24px' }}>
        <div>
          {areBorderouri ? <>
            <Rand label="Vânzări Trendyol" valoare={c.vanzari} ton="plus" detaliu="Prețul plătit de clienți, din borderourile încasărilor lunii" />
            {c.retururi !== 0 && <Rand label="Retururi" valoare={c.retururi} ton="minus" detaliu={pct(c.retururi)} />}
            {c.reduceri !== 0 && <Rand label="Reduceri / cupoane" valoare={c.reduceri} ton="minus" detaliu={`${pct(c.reduceri)} · reducerile din coș suportate de vânzător`} />}
            <Rand label="Comision Trendyol" valoare={c.comision} ton="minus" detaliu={`${pct(c.comision)} · reținut din fiecare vânzare (facturat lunar, TYC)`} />
            <Rand evidentiat label="🚚 Transport (facturi TYD)" valoare={c.transport} ton="minus" detaliu={`${pct(c.transport)} · ${c.facturiTransport.length} facturi de transport reținute din plăți`} />
            {c.taxe !== 0 && <Rand label="Alte taxe Trendyol" valoare={c.taxe} ton="minus" detaliu={`${c.facturiTaxe.length} facturi · produs nelivrat / lipsă / defect`} />}
            <Rand tare label="Virat de Trendyol (conform borderourilor)" valoare={c.virat} ton="total" detaliu={`încasat în extras ${lei(c.incasatLei)} lei`} />
            {c.diferentaCurs !== 0 && <Rand label="Diferență de curs / transfer" valoare={c.diferentaCurs} ton={c.diferentaCurs >= 0 ? 'plus' : 'minus'} detaliu={`${c.virat ? `${Math.round((Math.abs(c.diferentaCurs) / c.virat) * 1000) / 10}%` : ''} · Trendyol plătește în EUR, banca convertește în lei`} />}
            <Rand tare label="Rezultat net Trendyol" valoare={c.rezultat} ton="total" detaliu={c.vanzari ? `${Math.round((c.rezultat / c.vanzari) * 1000) / 10}% din vânzări rămân după comision, transport, taxe și curs (înainte de costul mărfii)` : undefined} />
            {c.incasariFaraBorderou > 0 && <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--warning)', marginTop: '6px' }}>Neinclus încă: {lei(c.incasariFaraBorderou)} lei încasați fără borderou încărcat.</p>}
          </> : (
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Încarcă borderourile Trendyol (.xlsx) ale încasărilor din dreapta — concluzia se calculează din ele.</p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: '6px' }}>Încasări Trendyol din extras · borderouri</div>
            {!c.plati.length && <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>Nicio încasare Trendyol în extrasele lunii.</p>}
            {c.plati.map((p, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--fs-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{zi(p.data)} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· ordin {p.ordin || '—'}{p.valuta !== 'RON' ? ` · ${lei(p.suma)} ${p.valuta}${p.curs ? ` × ${p.curs}` : ''}` : ''}</span></span>
                  <span className="num" style={{ fontWeight: 600, whiteSpace: 'nowrap', color: p.borderou ? 'var(--text-primary)' : 'var(--warning)' }}>{lei(p.lei)} {p.borderou ? '✓' : '⚠'}</span>
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: p.borderou ? 'var(--text-muted)' : 'var(--warning)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {p.borderou ? <>
                    <span>borderou: {lei(p.borderou.totalVanzator)} lei</span>
                    <a href={`/api/trendyol/borderou?download=${encodeURIComponent(p.borderou.documentId)}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>↓ .xlsx</a>
                    <button onClick={() => sterge(p.borderou!.documentId)} style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>✕</button>
                  </> : <span>lipsește borderoul {p.ordin ? `PaymentOrderDetail_${p.ordin}_….xlsx` : ''}</span>}
                </div>
              </div>
            ))}
            {c.borderouriFaraIncasare.map(b => (
              <div key={b.documentId} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--fs-xs)', color: 'var(--warning)', display: 'flex', gap: '10px' }}>
                <span>borderou {b.ordin} ({lei(b.totalVanzator)} lei) — fără încasare în extrasul lunii</span>
                <button onClick={() => sterge(b.documentId)} style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>✕</button>
              </div>
            ))}
            {zona}
          </div>
          <ListaTaxe titlu="🚚 Transport (facturi TYD)" lista={c.facturiTransport} />
          <ListaTaxe titlu="Alte taxe Trendyol" lista={c.facturiTaxe} />
          {c.facturiComision.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: '6px' }}>Facturi de comision (TYC)</div>
              {c.facturiComision.map(f => (
                <div key={f.nr} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                  <span>{f.nr} · {zi(f.data)}</span><span className="num">{f.suma != null ? lei(f.suma) : '—'}</span>
                </div>
              ))}
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Documentul fiscal al comisionului deja reținut din plăți — nu e un cost în plus.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

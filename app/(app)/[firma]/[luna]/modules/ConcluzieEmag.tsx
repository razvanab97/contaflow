'use client'
import { useCallback, useEffect, useState } from 'react'
import type { ConcluzieEmag as Concluzie } from '@/lib/emag-concluzie'

function lei(v: number, semn = false) {
  const s = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v))
  return `${semn ? (v < 0 ? '−' : v > 0 ? '+' : '') : v < 0 ? '−' : ''}${s}`
}
function zi(d: string | null) { if (!d) return '—'; const [y, m, z] = d.split('-'); return `${z}.${m}.${y}` }

function Rand({ label, valoare, detaliu, tare, ton }: { label: string; valoare: number; detaliu?: React.ReactNode; tare?: boolean; ton?: 'plus' | 'minus' | 'total' }) {
  const culoare = ton === 'plus' ? 'var(--success)' : ton === 'minus' ? 'var(--danger)' : 'var(--text-primary)'
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', padding: tare ? '10px 0' : '6px 0', borderTop: tare ? '1px solid var(--border)' : undefined }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: tare ? 'var(--fs-base)' : 'var(--fs-md)', fontWeight: tare ? 650 : 500, color: 'var(--text-primary)' }}>{label}</div>
        {detaliu && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '1px' }}>{detaliu}</div>}
      </div>
      <div className="num" style={{ fontSize: tare ? 'var(--fs-lg)' : 'var(--fs-md)', fontWeight: tare ? 650 : 600, color: culoare, whiteSpace: 'nowrap' }}>
        {lei(valoare, ton !== 'total')} <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>lei</span>
      </div>
    </div>
  )
}

// Concluzia eMAG a lunii, ca o "cascada": ce s-a vandut prin eMAG -> ce a retinut eMAG din aviz ->
// ce s-a virat (verificat cu extrasul) -> ce s-a mai platit separat (facturi Dante, PayU, curierat)
// -> rezultatul net. Fiecare suma are sub ea de unde vine.
export default function ConcluzieEmag({ lunaId }: { lunaId: string }) {
  const [c, setC] = useState<Concluzie | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/emag/concluzie?lunaId=${encodeURIComponent(lunaId)}`, { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) setError(d.error || 'Concluzia nu a putut fi calculată')
      else setC(d.concluzie)
    } catch { setError('Conexiunea s-a întrerupt') }
    setLoading(false)
  }, [lunaId])
  useEffect(() => { load() }, [load])

  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--text-primary)' }}>Concluzia eMAG</div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px' }}>De la vânzări (avize) până la banii încasați în extras și ce s-a dus pe drum</div>
      </div>
      <button className="btn btn-sm" onClick={load} disabled={loading}>{loading ? 'Se calculează…' : 'Recalculează'}</button>
    </div>
  )

  if (loading && !c) return <div className="card card-pad">{header}<div className="skeleton" style={{ height: '260px' }} /><p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '8px' }}>Prima dată avizele se citesc integral cu AI — durează câteva secunde.</p></div>
  if (error) return <div className="card card-pad">{header}<p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{error}</p></div>
  if (!c) return null

  const r = c.retineri
  const pct = (v: number) => c.vanzari ? `${Math.round((Math.abs(v) / c.vanzari) * 1000) / 10}% din vânzări` : ''
  const platiEmag = c.platiEmagFaraFactura.reduce((s, p) => s + p.suma, 0)
  const diferenta = Math.round((c.netAviz - c.incasat) * 100) / 100

  return (
    <div className="card card-pad">
      {header}
      {c.avertismente.length > 0 && (
        <div role="alert" style={{ marginBottom: '12px', padding: '8px 10px', borderRadius: 'var(--r-md)', background: 'var(--warning-soft)', color: 'var(--warning)', fontSize: 'var(--fs-sm)' }}>
          {c.avertismente.map((a, i) => <div key={i}>⚠ {a}</div>)}
        </div>
      )}
      {c.avize.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: '24px' }}>
          <div>
            <Rand label="Vânzări încasate prin eMAG" valoare={c.vanzari} ton="plus" detaliu="Încasări ramburs + card online, din toate avizele (RO, BG, HU)" />
            <Rand label="Comisioane eMAG" valoare={r.comision} ton="minus" detaliu={pct(r.comision)} />
            {r.transport !== 0 && <Rand label="Transport / rețineri curier (easybox)" valoare={r.transport} ton="minus" detaliu={pct(r.transport)} />}
            {r.voucher !== 0 && <Rand label="Vouchere" valoare={r.voucher} ton={r.voucher >= 0 ? 'plus' : 'minus'} detaliu="Decontate de eMAG" />}
            {r.retur !== 0 && <Rand label="Retururi / stornări" valoare={r.retur} ton="minus" />}
            {r.alte !== 0 && <Rand label="Alte facturi eMAG din aviz" valoare={r.alte} ton={r.alte >= 0 ? 'plus' : 'minus'} detaliu={pct(r.alte)} />}
            <Rand tare label="Virat de eMAG (conform avizelor)" valoare={c.netAviz} ton="total"
              detaliu={diferenta === 0 ? `✓ încasat integral în extras (${lei(c.incasat)} lei)` : `încasat în extras ${lei(c.incasat)} lei · diferență ${lei(diferenta)} lei`} />
            {c.dante.totalSeparat !== 0 && <Rand label="Facturi Dante plătite separat" valoare={-c.dante.totalSeparat} ton="minus" detaliu={`${c.dante.separat.length} facturi${c.dante.inAviz ? ` · ${c.dante.inAviz} deja reținute în aviz, nenumărate de două ori` : ''}`} />}
            {platiEmag > 0 && <Rand label="Plăți directe către eMAG fără factură" valoare={-platiEmag} ton="minus" detaliu={c.platiEmagFaraFactura.map(p => `${zi(p.data)} ${lei(p.suma)}`).join(' · ')} />}
            {c.curierat.total > 0 && <Rand label="Curierat" valoare={-c.curierat.total} ton="minus" detaliu={`${c.curierat.peCurier.map(x => x.curier).join(', ')} · ${pct(c.curierat.total)}`} />}
            <Rand tare label="Rezultat net eMAG" valoare={c.rezultat} ton="total" detaliu={c.vanzari ? `${Math.round((c.rezultat / c.vanzari) * 1000) / 10}% din vânzări rămân după toate costurile eMAG și de curierat (înainte de costul mărfii)` : undefined} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: '6px' }}>Avize de plată</div>
              {c.avize.map(a => (
                <div key={a.documentId} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--fs-sm)' }}>
                  <span style={{ color: 'var(--text-secondary)', minWidth: 0 }}>
                    {a.label} <span style={{ color: 'var(--text-muted)' }}>· {zi(a.data)}</span>
                    {a.valuta !== 'RON' && <span style={{ color: 'var(--text-muted)' }}> · {lei(a.total)} {a.valuta} × {a.curs.toFixed(4)}{a.sursaCurs === 'extras' ? ' (curs efectiv din extras)' : ' (BNR)'}</span>}
                  </span>
                  <span className="num" style={{ whiteSpace: 'nowrap', color: a.incasare ? 'var(--text-primary)' : 'var(--warning)' }} title={a.incasare ? `Încasat ${zi(a.incasare.data)}: ${a.incasare.descriere}` : 'Nu am găsit încasarea în extras'}>
                    {lei(a.totalLei)} {a.incasare ? '✓' : '⚠'}
                  </span>
                </div>
              ))}
              {c.incasariFaraAviz.length > 0 && (
                <div style={{ marginTop: '6px', fontSize: 'var(--fs-xs)', color: 'var(--warning)' }}>
                  Încasări eMAG în extras fără aviz încărcat: {c.incasariFaraAviz.map(i => `${zi(i.data)} ${lei(i.suma)} lei`).join(' · ')}
                </div>
              )}
            </div>

            {c.curierat.peCurier.length > 0 && (
              <div>
                <div className="eyebrow" style={{ marginBottom: '6px' }}>Curierat</div>
                {c.curierat.peCurier.map(x => (
                  <div key={x.curier} style={{ padding: '5px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--fs-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{x.curier}</span>
                      <span className="num" style={{ fontWeight: 600 }}>{lei(x.cost)}</span>
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                      {x.plati.length ? `plătit în extras: ${x.plati.map(p => `${zi(p.data)} ${lei(p.suma)}`).join(', ')}` : 'nicio plată în extras — cost luat din facturi'}
                      {x.facturi.length ? ` · ${x.facturi.length} ${x.facturi.length === 1 ? 'factură' : 'facturi'} (${lei(x.facturat)} lei)` : ' · fără factură încărcată'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {c.dante.separat.length > 0 && (
              <div>
                <div className="eyebrow" style={{ marginBottom: '6px' }}>Facturi Dante separate</div>
                {c.dante.separat.map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                    <span>{f.categorie} · {f.numar || '—'} · {zi(f.data)}</span>
                    <span className="num">{lei(f.suma)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

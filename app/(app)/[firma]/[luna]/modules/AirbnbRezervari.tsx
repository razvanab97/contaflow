'use client'
import { useCallback, useEffect, useState } from 'react'
import CopyButton from '@/components/CopyButton'

interface Rezervare {
  id: string
  cod_confirmare: string
  oaspete?: string | null
  anunt?: string | null
  data_start?: string | null
  data_sfarsit?: string | null
  data_tranzactie?: string | null
  moneda?: string | null
  suma?: number | null
  taxa_servicii?: number | null
  castiguri_brute?: number | null
  factura_document_id?: string | null
  asociere_metoda?: string | null
  documente?: { fisier_nume?: string | null } | null
}

function zi(d?: string | null) { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}` : '' }
function bani(v?: number | null, moneda?: string | null) {
  if (v == null) return '—'
  return `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))} ${moneda || ''}`.trim()
}

// Rezervarile din borderoul Airbnb al lunii, cu codul de rezervare de copiat si starea facturii de
// comision. Flux: 1) Borderou: incarci CSV-ul -> apar rezervarile; 2) Facturi: atasezi facturile de
// comision (se potrivesc automat dupa cod/suma) -> aici vezi exact care factura lipseste ca s-o aduci.
export default function AirbnbRezervari({ firmaId, lunaId, mod }: { firmaId: string; lunaId: string; mod: 'borderou' | 'facturi' }) {
  const [items, setItems] = useState<Rezervare[] | null>(null)
  const [error, setError] = useState('')
  const [doarLipsa, setDoarLipsa] = useState(false)
  const [copiat, setCopiat] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/airbnb/facturi-asteptate?lunaId=${encodeURIComponent(lunaId)}&firmaId=${encodeURIComponent(firmaId)}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setItems(data.items || []); setError('') } else setError(data.error || 'Nu pot citi rezervările din borderou')
  }, [firmaId, lunaId])

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('cf:airbnb-refresh', on)
    return () => window.removeEventListener('cf:airbnb-refresh', on)
  }, [load])

  if (items === null && !error) return <div className="card card-pad"><div className="skeleton" style={{ height: '120px' }} /></div>
  if (error) return <div className="card card-pad" role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{error}</div>
  const lista = items || []
  const lipsa = lista.filter(i => !i.factura_document_id)
  const atasate = lista.length - lipsa.length
  // In Facturi tabelul arata doar ce lipseste (lista completa, cu atasare manuala, e in panoul de mai jos).
  const vizibile = mod === 'facturi' ? lipsa : doarLipsa ? lipsa : lista
  const pct = lista.length ? Math.round((atasate / lista.length) * 100) : 0

  async function copiazaLipsa() {
    try {
      await navigator.clipboard.writeText(lipsa.map(i => i.cod_confirmare).join('\n'))
      setCopiat(true); setTimeout(() => setCopiat(false), 1600)
    } catch {}
  }

  if (!lista.length) {
    return (
      <div className="empty-state">
        <strong>{mod === 'borderou' ? 'Încă nu există rezervări pentru luna aceasta' : 'Încarcă întâi borderoul Airbnb'}</strong>
        <span style={{ fontSize: 'var(--fs-sm)' }}>
          {mod === 'borderou'
            ? 'Încarcă mai jos raportul CSV din Airbnb (Câștiguri → Exportă CSV). Fiecare rezervare va apărea aici, cu codul de copiat.'
            : 'Pasul 1 este modulul „Airbnb · Borderou”: din CSV se creează lista rezervărilor, iar aici apoi se potrivesc facturile de comision.'}
        </span>
      </div>
    )
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {mod === 'borderou' ? `Rezervări din borderou · ${lista.length}` : 'Facturi de comision Airbnb'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
            <div className={`progress${pct === 100 ? ' is-done' : ''}`} style={{ flex: 1, maxWidth: '220px' }}><span style={{ width: `${pct}%` }} /></div>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
              <b style={{ color: 'var(--text-primary)' }}>{atasate}/{lista.length}</b> facturi atașate
              {lipsa.length > 0 && <> · <b style={{ color: 'var(--warning)' }}>{lipsa.length} {lipsa.length === 1 ? 'lipsă' : 'lipsă'}</b></>}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {lipsa.length > 0 && (
            <>
              {mod === 'borderou' && <button className="btn btn-sm" aria-pressed={doarLipsa} onClick={() => setDoarLipsa(v => !v)}
                style={doarLipsa ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
                {doarLipsa ? 'Arată toate' : `Doar cele lipsă (${lipsa.length})`}
              </button>}
              <button className="btn btn-sm" onClick={copiazaLipsa} title="Copiază codurile rezervărilor fără factură, unul pe rând">
                {copiat ? '✓ Copiat' : 'Copiază codurile lipsă'}
              </button>
            </>
          )}
        </div>
      </div>

      {mod === 'facturi' && lipsa.length === 0 && (
        <div style={{ padding: '10px 16px', fontSize: 'var(--fs-sm)', color: 'var(--success)', background: 'var(--success-soft)' }}>
          ✓ Toate rezervările din borderou au factura de comision atașată — nicio factură sărită.
        </div>
      )}
      {mod === 'facturi' && lipsa.length > 0 && (
        <div style={{ padding: '10px 16px', fontSize: 'var(--fs-sm)', color: 'var(--warning)', background: 'var(--warning-soft)' }}>
          ⚠ {lipsa.length === 1 ? 'O factură a fost sărită' : `${lipsa.length} facturi au fost sărite`} — caută în Airbnb după codul rezervării și încarc-o mai jos; se asociază automat.
        </div>
      )}

      {vizibile.length > 0 && <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 'var(--fs-sm)', minWidth: '640px' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <th style={{ padding: '8px 16px', fontWeight: 600 }}>Cod rezervare</th>
              <th style={{ padding: '8px', fontWeight: 600 }}>Oaspete</th>
              <th style={{ padding: '8px', fontWeight: 600 }}>Perioadă</th>
              <th style={{ padding: '8px', fontWeight: 600, textAlign: 'right' }}>Câștig brut</th>
              <th style={{ padding: '8px', fontWeight: 600, textAlign: 'right' }}>Comision</th>
              <th style={{ padding: '8px 16px', fontWeight: 600 }}>Factură comision</th>
            </tr>
          </thead>
          <tbody>
            {vizibile.map(i => {
              const ok = !!i.factura_document_id
              return (
                <tr key={i.id} style={{ borderTop: '1px solid var(--border-subtle)', background: ok ? undefined : 'color-mix(in srgb, var(--warning) 5%, transparent)' }}>
                  <td style={{ padding: '7px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <CopyButton value={i.cod_confirmare} />
                      <span className="num" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{i.cod_confirmare}</span>
                    </span>
                  </td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.anunt || undefined}>{i.oaspete || '—'}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{i.data_start ? `${zi(i.data_start)} – ${zi(i.data_sfarsit)}` : zi(i.data_tranzactie)}</td>
                  <td className="num" style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{bani(i.castiguri_brute ?? i.suma, i.moneda)}</td>
                  <td className="num" style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{bani(i.taxa_servicii, i.moneda)}</td>
                  <td style={{ padding: '7px 16px', whiteSpace: 'nowrap' }}>
                    {ok
                      ? <span className="badge badge-success" title={i.documente?.fisier_nume || undefined}>✓ atașată{i.asociere_metoda === 'cod_rezervare' ? ' · cod' : i.asociere_metoda === 'taxa_servicii_exacta' ? ' · sumă' : ''}</span>
                      : <span className="badge badge-warning">lipsă</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>}
    </div>
  )
}

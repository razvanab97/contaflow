'use client'
import { useCallback, useEffect, useState } from 'react'
import CopyButton from '@/components/CopyButton'
import VeziButon from '@/components/ui/VeziButon'
import type { RandRh, FacturaRhLista } from '@/lib/cazare-rh-verificare'

// Facturile de cazare RH (Oblio, emise din ApartPro) fata de rezervarile din CSV-ul Airbnb al lunii - la firmele
// care nu factureaza cazarea in 5StarDesk (AB Textile). Se reincarca la fiecare CSV nou (cf:airbnb-refresh).
interface VerificareRh { perioada: { de: string; pana: string }; randuri: RandRh[]; faraRezervare: FacturaRhLista[]; anulate: number; pdfuri?: Record<string, { id: string; numar: string; suma: number | null }>; pdfTotal?: number }

const zi = (d?: string | null) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}` : '' }
const bani = (v?: number | null) => v == null ? '—' : `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))} RON`
const ETICHETA: Record<RandRh['stare'], [string, string, string]> = {
  ok: ['badge-success', '✓ facturată', 'Aceeași sumă și același client'],
  nume: ['badge-warning', 'alt client', 'Aceeași sumă, dar alt nume pe factură (ex. factură pe firmă) — verifică dacă e rezervarea asta'],
  suma: ['badge-warning', 'sumă diferită', 'Clientul se potrivește, suma de pe factură nu e câștigul brut din borderou'],
  lipsa: ['badge-danger', 'fără factură', 'Nicio factură RH cu suma și clientul acestei rezervări'],
}

export default function FacturiRhVerificare({ firmaId, lunaId }: { firmaId: string; lunaId: string }) {
  const [d, setD] = useState<VerificareRh | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [doarProbleme, setDoarProbleme] = useState(false)
  const [incarc, setIncarc] = useState('')

  // PDF-urile facturilor RH (exportul din Oblio, una sau mai multe facturi intr-un fisier) - impartite si
  // salvate ca facturi de vanzare, fiecare legata de rezervarea Airbnb scrisa pe ea.
  async function incarcaPdf(files: FileList | null) {
    if (!files?.length) return
    setIncarc('Se împart și se salvează facturile…')
    const fd = new FormData(); fd.set('firmaId', firmaId); fd.set('lunaId', lunaId)
    for (const f of Array.from(files)) fd.append('file', f)
    const res = await fetch('/api/airbnb/facturi-rh', { method: 'POST', body: fd }).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    setIncarc(res?.ok ? `✓ ${j.salvate?.length || 0} facturi RH salvate${j.erori?.length ? ` · ${j.erori.join('; ')}` : ''}` : (j.error || 'Încărcarea a eșuat'))
    load()
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/airbnb/facturi-rh?lunaId=${encodeURIComponent(lunaId)}&firmaId=${encodeURIComponent(firmaId)}`, { cache: 'no-store' }).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    if (res?.ok) { setD(j); setError('') } else setError(j.error || 'Nu pot verifica facturile RH')
    setLoading(false)
  }, [firmaId, lunaId])

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('cf:airbnb-refresh', on)
    return () => window.removeEventListener('cf:airbnb-refresh', on)
  }, [load])

  if (!d && !error) return <div className="card card-pad"><div className="skeleton" style={{ height: '90px' }} /></div>
  if (!d) return (
    <div className="card card-pad" role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: 'var(--fs-sm)' }}>
      <span style={{ color: 'var(--danger)' }}>{error}</span>
      <button className="btn btn-sm" onClick={load} disabled={loading}>{loading ? 'Se verifică…' : 'Reîncearcă'}</button>
    </div>
  )
  if (!d.randuri.length && !d.faraRezervare.length) return null

  const probleme = d.randuri.filter(r => r.stare !== 'ok')
  const ok = d.randuri.length - probleme.length
  const vizibile = doarProbleme ? probleme : d.randuri
  const pct = d.randuri.length ? Math.round((ok / d.randuri.length) * 100) : 0
  const totalBrut = d.randuri.reduce((s, r) => s + (r.brut || 0), 0)
  const totalFacturat = d.randuri.reduce((s, r) => s + (r.factura?.total || 0), 0)

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)' }}>Facturi de cazare RH (Oblio) ↔ borderou</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
            <div className={`progress${pct === 100 ? ' is-done' : ''}`} style={{ flex: '1 1 120px', maxWidth: '220px' }}><span style={{ width: `${pct}%` }} /></div>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
              <b style={{ color: 'var(--text-primary)' }}>{ok}/{d.randuri.length}</b> rezervări facturate corect
              {probleme.length > 0 && <> · <b style={{ color: 'var(--warning)' }}>{probleme.length} de verificat</b></>}
            </span>
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
            Brut în borderou {bani(totalBrut)} · facturat RH {bani(totalFacturat)} · factura RH = câștigul brut (încasare + comision Airbnb)
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {probleme.length > 0 && <button className="btn btn-sm" aria-pressed={doarProbleme} onClick={() => setDoarProbleme(v => !v)}
            style={doarProbleme ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
            {doarProbleme ? 'Arată toate' : `Doar de verificat (${probleme.length})`}
          </button>}
          <label className="btn btn-sm" title="PDF-ul exportat din Oblio cu facturile RH ale lunii - se împarte pe facturi și se leagă de rezervări">
            ↑ PDF facturi RH{d.pdfTotal ? ` (${d.pdfTotal})` : ''}
            <input type="file" accept="application/pdf" multiple hidden onChange={e => { incarcaPdf(e.target.files); e.target.value = '' }} />
          </label>
          <button className="btn btn-sm" onClick={load} disabled={loading} title="Recitește facturile RH din Oblio">{loading ? 'Se verifică…' : '↻ Oblio'}</button>
        </div>
      </div>

      {incarc && <div role="status" style={{ padding: '8px 16px', fontSize: 'var(--fs-sm)', color: incarc.startsWith('✓') ? 'var(--success)' : 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>{incarc}</div>}
      {vizibile.length > 0 && <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 'var(--fs-sm)', minWidth: '680px' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <th style={{ padding: '8px 16px', fontWeight: 600 }}>Cod rezervare</th>
              <th style={{ padding: '8px', fontWeight: 600 }}>Oaspete</th>
              <th style={{ padding: '8px', fontWeight: 600 }}>Check-out</th>
              <th style={{ padding: '8px', fontWeight: 600, textAlign: 'right' }}>Brut borderou</th>
              <th style={{ padding: '8px', fontWeight: 600 }}>Factură RH</th>
              <th style={{ padding: '8px', fontWeight: 600 }}>PDF</th>
              <th style={{ padding: '8px 16px', fontWeight: 600 }}>Stare</th>
            </tr>
          </thead>
          <tbody>
            {vizibile.map(r => {
              const [cls, txt, tip] = ETICHETA[r.stare]
              return (
                <tr key={r.rezervare.id} style={{ borderTop: '1px solid var(--border-subtle)', background: r.stare === 'ok' ? undefined : 'color-mix(in srgb, var(--warning) 5%, transparent)' }}>
                  <td style={{ padding: '7px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <CopyButton value={r.rezervare.cod_confirmare} />
                      <span className="num" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.rezervare.cod_confirmare}</span>
                    </span>
                  </td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-secondary)', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.rezervare.oaspete || '—'}</td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{zi(r.rezervare.data_sfarsit)}</td>
                  <td className="num" style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{bani(r.brut)}</td>
                  <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                    {r.factura ? <>
                      {r.factura.link ? <a href={r.factura.link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{r.factura.numar}</a> : <b>{r.factura.numar}</b>}
                      {' '}· {zi(r.factura.data)} · <span className="num">{bani(r.factura.total)}</span>
                      {r.stare === 'nume' && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.factura.client}</div>}
                    </> : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>
                    {d.pdfuri?.[r.rezervare.cod_confirmare]
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><VeziButon url={`/api/chitante/document?id=${d.pdfuri[r.rezervare.cod_confirmare].id}`} nume={d.pdfuri[r.rezervare.cod_confirmare].numar} /></span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '7px 16px', whiteSpace: 'nowrap' }}>
                    <span className={`badge ${cls}`} title={tip}>{txt}{r.stare === 'suma' && r.diferenta != null ? ` ${r.diferenta > 0 ? '+' : ''}${r.diferenta.toFixed(2)}` : ''}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>}

      {d.faraRezervare.length > 0 && (
        // Fara CSV inca: un rand neutru (facturile asteapta borderoul); cu CSV: avertisment. Lista - la click.
        <details open={d.randuri.length > 0 && d.faraRezervare.length <= 5} style={{ padding: '10px 16px', borderTop: '1px solid var(--border-subtle)', fontSize: 'var(--fs-sm)', background: d.randuri.length ? 'var(--warning-soft)' : undefined }}>
          <summary style={{ cursor: 'pointer', color: d.randuri.length ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: 600 }}>
            {d.randuri.length ? '⚠ ' : ''}{d.faraRezervare.length === 1 ? 'O factură RH emisă' : `${d.faraRezervare.length} facturi RH emise`} între {zi(d.perioada.de)} și {zi(d.perioada.pana)}
            {' '}({bani(d.faraRezervare.reduce((s, f) => s + (f.total || 0), 0))}){d.randuri.length ? ' fără rezervare în borderou' : ' — se verifică după ce încarci CSV-ul Airbnb'}
          </summary>
          <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
            {d.faraRezervare.map(f => <span key={f.numar}>{f.link ? <a href={f.link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)' }}>{f.numar}</a> : f.numar} · {zi(f.data)} · {f.client || '—'} · <span className="num">{bani(f.total)}</span></span>)}
          </div>
          {d.randuri.length > 0 && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 4 }}>Poate fi o rezervare Booking / directă, sau una din alt borderou — verifică în ApartPro.</div>}
        </details>
      )}
      {d.anulate > 0 && <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-subtle)', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{d.anulate} {d.anulate === 1 ? 'factură RH anulată' : 'facturi RH anulate'} în perioadă — nu intră în potrivire.</div>}
    </div>
  )
}

'use client'
import { useState, useRef } from 'react'
import { tint } from '@/lib/colors'
import CopyButton from '@/components/CopyButton'

interface Extras { id: string; nr_tranzactii: number; nr_documentate: number; procesat_ai?: boolean; sold_final?: number; valuta?: string; iban?: string | null; pdf_path?: string | null; pdf_nume?: string | null }

export default function UploadExtras({ valuta, extrasId, firmaId, lunaId, extras, culoare, onDone, unlockCode }: {
  valuta: string; extrasId?: string; firmaId: string; lunaId: string
  extras: Extras | null; culoare: string; onDone: () => void
  unlockCode?: string
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('')
  const [savingPdf, setSavingPdf] = useState(false)
  const csvRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)
  const savePdfRef = useRef<HTMLInputElement>(null)
  const r = `${parseInt(culoare.slice(1,3),16)},${parseInt(culoare.slice(3,5),16)},${parseInt(culoare.slice(5,7),16)}`

  async function handleCSV(file: File) {
    setLoading(true); setErr(''); setStatus('Se procesează CSV-ul...')
    const fd = new FormData()
    fd.append('csv', file); fd.append('firmaId', firmaId); fd.append('lunaId', lunaId); fd.append('valuta', valuta)
    if (extrasId) fd.append('extrasId', extrasId)
    const res = await fetch('/api/extras/upload-csv', { method: 'POST', body: fd })
    const d = await res.json()
    if (res.ok && d.ok) { setStatus(`✓ ${(d.results || []).reduce((n: number, x: { count?: number }) => n + (x.count || 0), 0)} tranzacții importate din CSV · acum atașează PDF-ul extrasului (pentru contabil)`); onDone() }
    else setErr(d.error || 'Eroare')
    setLoading(false)
  }

  async function handlePDF(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { setErr('Selectează PDF'); return }
    // Citirea cu AI din PDF e doar rezerva cand nu exista CSV - inlocuieste tranzactiile deja importate.
    if (extras?.nr_tranzactii && !confirm(`Contul are deja ${extras.nr_tranzactii} tranzacții (din CSV). Citirea PDF-ului cu AI le înlocuiește. Continui?\n\nDacă vrei doar să păstrezi PDF-ul pentru contabil, folosește „Atașează PDF”.`)) return
    setLoading(true); setErr(''); setStatus('AI extrage tranzacțiile... (30-60s)')
    const fd = new FormData()
    fd.append('pdf', file); fd.append('firmaId', firmaId)
    fd.append('lunaId', lunaId); fd.append('valuta', valuta)
    if (extrasId) fd.append('extrasId', extrasId)
    const res = await fetch('/api/extras/upload', { method: 'POST', body: fd })
    const d = await res.json()
    if (res.ok && d.ok) {
      const details = Array.isArray(d.results) && d.results.length > 1
        ? d.results.map((result: { count:number; valuta:string }) => `${result.count} ${result.valuta}`).join(' + ')
        : `${d.count} tranzacții · ${d.valuta || valuta}`
      // Textul complet al fiecarei tranzactii (comerciant, oras, nr. comanda) se citeste separat,
      // pe bucati de pagini in paralel - in acelasi apel cu importul ar depasi limita de timp.
      setStatus(`✓ ${details} · citesc detaliile din extras...`)
      const ids: string[] = Array.isArray(d.results) ? d.results.map((result: { extrasId: string }) => result.extrasId) : [d.extrasId]
      await Promise.all(ids.filter(Boolean).map(id => fetch('/api/extras/detalii', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ extrasId: id }) }).catch(() => null)))
      setStatus(`✓ ${details}`)
      onDone()
    }
    else setErr(d.error || 'Eroare')
    setLoading(false)
  }

  async function handleSavePdf(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { setErr('Selectează PDF'); return }
    if (!extrasId) return
    setSavingPdf(true); setErr('')
    const fd = new FormData()
    fd.append('pdf', file); fd.append('extrasId', extrasId)
    fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
    const res = await fetch('/api/extras/save-pdf', { method: 'POST', body: fd })
    const d = await res.json()
    if (res.ok && d.ok) onDone()
    else setErr(d.error || 'Eroare salvare PDF')
    setSavingPdf(false)
  }

  const hasPdf = !!extras?.pdf_path
  const areCsv = !!extras?.nr_tranzactii
  const titlu = valuta === 'AUTO' ? 'Alt cont' : `Extras ${extras?.valuta || valuta}`
  const pas = (nr: number, gata: boolean, eticheta: string, detaliu: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <span style={{ flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 'var(--fs-xs)', fontWeight: 700, background: gata ? 'var(--success-soft)' : 'var(--surface-sunken)', color: gata ? 'var(--success)' : 'var(--text-muted)', border: `1px solid ${gata ? 'var(--success)' : 'var(--border)'}` }}>{gata ? '✓' : nr}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{eticheta}</div>
        <div style={{ fontSize: 'var(--fs-xs)', color: gata ? 'var(--success)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detaliu}</div>
      </div>
    </div>
  )

  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${tint(r,.25)}`, borderRadius: 'var(--r-lg)', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: areCsv && hasPdf ? 'var(--success)' : areCsv ? 'var(--warning)' : 'var(--border-strong)' }} />
        <span style={{ fontSize: 'var(--fs-base)', fontWeight: 650, color: 'var(--text-primary)' }}>{titlu}{extras?.iban ? <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}> · ····{extras.iban.slice(-4)}</span> : null}</span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)', fontWeight: 600, color: areCsv && hasPdf ? 'var(--success)' : areCsv ? 'var(--warning)' : 'var(--text-muted)' }}>
          {areCsv && hasPdf ? '✓ complet' : areCsv ? 'lipsește PDF-ul' : 'neîncărcat'}
        </span>
      </div>

      {unlockCode && (
        <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--r-md)', background:'var(--surface-sunken)' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.08em' }}>Cod deblocare PDF</div>
            <div style={{ fontSize:'var(--fs-md)', fontWeight:700, color:'var(--text-primary)', fontFamily:'monospace', marginTop:'2px' }}>{unlockCode}</div>
          </div>
          <CopyButton value={unlockCode} />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ width: '18px', height: '18px', border: `2px solid ${culoare}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>{status}</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Pasul 1: tranzactiile, din CSV-ul BT (textul complet al bancii, asocieri automate) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--surface-sunken)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>{pas(1, areCsv, 'Tranzacții — CSV din bancă', areCsv ? `${extras!.nr_tranzactii} tranzacții · ${extras!.nr_documentate} documentate` : 'pentru lucru: din el se fac asocierile automate')}</div>
            <button onClick={() => csvRef.current?.click()} className={areCsv ? 'btn btn-sm' : 'btn btn-sm btn-primary'} style={{ flexShrink: 0 }}>{areCsv ? 'Reîncarcă CSV' : '↑ Import CSV'}</button>
          </div>
          {/* Pasul 2: PDF-ul original al bancii - doar pastrat, merge in ZIP-ul pentru contabil */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--surface-sunken)', opacity: extrasId ? 1 : .55 }}>
            <div style={{ flex: 1, minWidth: 0 }}>{pas(2, hasPdf, 'PDF extras — pentru contabil', hasPdf ? (extras?.pdf_nume || 'PDF salvat') : extrasId ? 'se păstrează și intră în ZIP-ul lunii' : 'după importul CSV')}</div>
            {hasPdf && extrasId && <a href={`/api/extras/pdf-download?extrasId=${extrasId}`} className="btn btn-sm btn-ghost" title="Descarcă PDF-ul">↓</a>}
            <button onClick={() => savePdfRef.current?.click()} disabled={!extrasId || savingPdf} className={hasPdf || !areCsv ? 'btn btn-sm' : 'btn btn-sm btn-primary'} style={{ flexShrink: 0 }}>
              {savingPdf ? 'Se salvează...' : hasPdf ? 'Înlocuiește' : '📎 Atașează PDF'}
            </button>
          </div>
          {status && !err && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--success)' }}>{status}</div>}
          <button onClick={() => pdfRef.current?.click()} style={{ alignSelf: 'flex-start', padding: 0, border: 0, background: 'none', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', textDecoration: 'underline', cursor: 'pointer' }}>
            Nu ai CSV? Citește tranzacțiile din PDF cu AI
          </button>
        </div>
      )}

      {err && (
        <div style={{ marginTop: '10px', padding: '8px 12px', background: 'light-dark(rgba(220,38,38,.25), rgba(248,113,113,.1))', border: '1px solid light-dark(rgba(220,38,38,.45), rgba(248,113,113,.3))', borderRadius: 'var(--r-md)' }}>
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', wordBreak: 'break-all' as const }}>{err}</p>
        </div>
      )}

      <input ref={csvRef} type="file" accept=".csv" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => { if (e.target.files?.[0]) handleCSV(e.target.files[0]); e.target.value = '' }} />
      <input ref={pdfRef} type="file" accept=".pdf" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => { if (e.target.files?.[0]) handlePDF(e.target.files[0]); e.target.value = '' }} />
      <input ref={savePdfRef} type="file" accept=".pdf" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => { if (e.target.files?.[0]) handleSavePdf(e.target.files[0]); e.target.value = '' }} />
    </div>
  )
}

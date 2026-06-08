'use client'
import { useState, useRef } from 'react'

interface Extras { id: string; nr_tranzactii: number; nr_documentate: number; procesat_ai?: boolean; sold_final?: number; valuta?: string }

export default function UploadExtras({ valuta, firmaId, lunaId, extras, culoare, onDone }: {
  valuta: string; firmaId: string; lunaId: string
  extras: Extras | null; culoare: string; onDone: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('')
  const csvRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)
  const r = `${parseInt(culoare.slice(1,3),16)},${parseInt(culoare.slice(3,5),16)},${parseInt(culoare.slice(5,7),16)}`

  async function handleCSV(file: File) {
    setLoading(true); setErr(''); setStatus('Se procesează CSV-ul...')
    const fd = new FormData()
    fd.append('csv', file); fd.append('firmaId', firmaId); fd.append('lunaId', lunaId); fd.append('valuta', valuta)
    const res = await fetch('/api/extras/upload-csv', { method: 'POST', body: fd })
    const d = await res.json()
    if (res.ok && d.ok) { setStatus('✓ Import reușit'); onDone() }
    else setErr(d.error || 'Eroare')
    setLoading(false)
  }

  async function handlePDF(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { setErr('Selectează PDF'); return }
    setLoading(true); setErr(''); setStatus('AI extrage tranzacțiile... (30-60s)')
    const fd = new FormData()
    fd.append('pdf', file); fd.append('firmaId', firmaId)
    fd.append('lunaId', lunaId); fd.append('valuta', valuta)
    const res = await fetch('/api/extras/upload', { method: 'POST', body: fd })
    const d = await res.json()
    if (res.ok && d.ok) { setStatus(`✓ ${d.count} tranzacții · ${d.valuta || valuta}`); onDone() }
    else setErr(d.error || 'Eroare')
    setLoading(false)
  }

  return (
    <div style={{ background: '#161616', border: `1px solid rgba(${r},.2)`, borderRadius: '14px', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: extras?.nr_tranzactii ? '#4ADE80' : '#333' }} />
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFF' }}>{valuta === 'AUTO' ? 'Citire extras cu AI' : `Extras ${valuta}`}</span>
        {extras?.nr_tranzactii ? (
          <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: 'rgba(74,222,128,.15)', color: '#4ADE80' }}>
            {extras.nr_tranzactii} tx ✓
          </span>
        ) : (
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#555' }}>neîncărcat</span>
        )}
      </div>

      {valuta === 'AUTO' && (
        <p style={{ margin: '0 0 14px', fontSize: '11px', lineHeight: 1.5, color: '#777' }}>
          Încarcă extrasul PDF, iar AI identifică automat moneda și tranzacțiile.
        </p>
      )}

      {extras?.nr_tranzactii ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
          {[{ l: 'Tranzacții', v: extras.nr_tranzactii }, { l: 'Documentate', v: extras.nr_documentate }].map(s => (
            <div key={s.l} style={{ background: '#111', borderRadius: '9px', padding: '10px 12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', marginBottom: '4px', textTransform: 'uppercase' as const }}>{s.l}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#FFF' }}>{s.v}</div>
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ width: '18px', height: '18px', border: `2px solid ${culoare}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 8px' }} />
          <p style={{ fontSize: '12px', color: '#CCC' }}>{status}</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px' }}>
          {valuta !== 'AUTO' && (
            <button onClick={() => csvRef.current?.click()} style={{ flex: 1, padding: '9px', borderRadius: '9px', border: 'none', background: culoare, color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
              ↑ Import CSV
            </button>
          )}
          <button onClick={() => pdfRef.current?.click()} style={{ flex: valuta === 'AUTO' ? 1 : undefined, padding: '9px 14px', borderRadius: '9px', border: `1px solid rgba(${r},.3)`, background: 'transparent', color: culoare, fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            {valuta === 'AUTO' ? 'Alege PDF · AI detectează moneda' : 'PDF + citire AI'}
          </button>
        </div>
      )}

      {err && (
        <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: '8px' }}>
          <p style={{ fontSize: '11px', color: '#F87171', wordBreak: 'break-all' as const }}>{err}</p>
        </div>
      )}

      <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleCSV(e.target.files[0]); e.target.value = '' }} />
      <input ref={pdfRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handlePDF(e.target.files[0]); e.target.value = '' }} />
    </div>
  )
}

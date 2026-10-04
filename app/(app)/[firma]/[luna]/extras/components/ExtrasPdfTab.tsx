'use client'
import { useRef, useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'
import type { Extras } from './types'

// Extrasul de cont original (PDF-ul bancii), separat de documentele tranzactiilor - ca sa poata fi
// vazut sau descarcat doar el, cate unul pe fiecare cont/moneda. Fluxul obisnuit: extrasul se importa
// din CSV (are textul complet al tranzactiilor), iar PDF-ul bancii doar se ATASEAZA aici, fara sa
// reimporte/inlocuiasca tranzactiile.
export default function ExtrasPdfTab({ extrase, lunaLabel, firmaId, lunaId, onImport, onChanged }: {
  extrase: Extras[]; lunaLabel: string; firmaId: string; lunaId: string; onImport: () => void; onChanged: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [tinta, setTinta] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [eroare, setEroare] = useState<string | null>(null)

  async function ataseaza(file: File, extrasId: string) {
    setBusy(extrasId); setEroare(null)
    const fd = new FormData()
    fd.append('pdf', file); fd.append('extrasId', extrasId); fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
    const r = await fetch('/api/extras/save-pdf', { method: 'POST', body: fd }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(null)
    if (!r?.ok) { setEroare(d.error || 'PDF-ul nu a putut fi atașat'); return }
    onChanged()
  }

  if (!extrase.length) {
    return (
      <div className="empty-state" style={{ padding:'48px 16px' }}>
        <strong>Niciun extras încărcat pentru {lunaLabel}</strong>
        <button onClick={onImport} className="btn btn-sm" style={{ marginTop:'10px' }}>Importă extras</button>
      </div>
    )
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
      <input ref={input} type="file" accept="application/pdf,.pdf" style={{ display:'none' }}
        onChange={ev => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f && tinta) ataseaza(f, tinta) }} />
      {eroare && <div style={{ fontSize:'var(--fs-sm)', color:'var(--danger)' }}>{eroare}</div>}
      {extrase.map(e => {
        const url = `/api/extras/pdf-download?extrasId=${encodeURIComponent(e.id)}`
        const arePdf = !!e.pdf_path
        return (
          <div key={e.id} style={{ display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap', padding:'16px 18px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)' }}>
            <svg width="28" height="28" fill="none" stroke="var(--danger)" strokeWidth="1.6" viewBox="0 0 24 24" style={{ flexShrink:0 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
            <div style={{ flex:1, minWidth:'200px' }}>
              <div style={{ fontSize:'var(--fs-md)', fontWeight:700, color:'var(--text-primary)' }}>
                Extras {e.valuta}{e.iban ? ` · ····${e.iban.slice(-6)}` : ''} · {lunaLabel}
              </div>
              <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-muted)', marginTop:'3px', wordBreak:'break-all' }}>
                {arePdf ? e.pdf_nume : 'PDF-ul extrasului nu a fost încărcat încă - extrasul e importat din CSV'}
                {` · ${e.nr_tranzactii} tranzacții`}
                {e.sold_final != null ? ` · sold final ${Number(e.sold_final).toFixed(2)} ${e.valuta}` : ''}
              </div>
            </div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {arePdf && <button onClick={() => deschideDocument(`${url}&inline=1`, e.pdf_nume)} className="btn btn-sm">Vezi</button>}
              {arePdf && <a href={url} className="btn btn-sm btn-primary">Descarcă PDF ↓</a>}
              <button onClick={() => { setTinta(e.id); input.current?.click() }} disabled={busy === e.id} className={arePdf ? 'btn btn-sm btn-ghost' : 'btn btn-sm btn-primary'}>
                {busy === e.id ? 'Se încarcă...' : arePdf ? 'Înlocuiește PDF' : 'Atașează PDF-ul'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

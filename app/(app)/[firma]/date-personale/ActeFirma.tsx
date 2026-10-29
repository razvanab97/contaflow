'use client'
import { deschideDocument } from '@/lib/vizualizare'
import { useEffect, useRef, useState } from 'react'

// Actele firmei (certificat de înregistrare, act constitutiv, constatator...): mai multe fișiere, fiecare cu tipul lui,
// redenumibile, de văzut / descărcat / șters. API: /api/firma-date/acte.

interface Act { id: string; fisier_nume: string; fisier_tip: string | null; fisier_marime: number | null; furnizor: string | null; data_document: string | null; created_at: string }

const previzualizabil = (a: Act) => /pdf|image/.test(a.fisier_tip || '') || /\.(pdf|jpe?g|png|webp)$/i.test(a.fisier_nume)
const marime = (b: number | null) => !b ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
const btnText: React.CSSProperties = { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'none' }

export default function ActeFirma({ firmaId }: { firmaId: string }) {
  const [acte, setActe] = useState<Act[]>([])
  const [tipuri, setTipuri] = useState<string[]>([])
  const [incarcat, setIncarcat] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/firma-date/acte?firmaId=${encodeURIComponent(firmaId)}`).then(r => r.json())
      .then(d => { setActe(d.acte || []); setTipuri(d.tipuri || []) }).catch(() => setMesaj('Actele nu s-au putut încărca')).finally(() => setIncarcat(true))
  }, [firmaId])

  async function incarca(files: File[]) {
    if (!files.length) return
    setBusy(true); setMesaj('')
    const fd = new FormData(); fd.append('firmaId', firmaId); files.forEach(f => fd.append('file', f))
    const r = await fetch('/api/firma-date/acte', { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    setBusy(false); if (inputRef.current) inputRef.current.value = ''
    if (d.acte?.length) setActe(prev => [...prev, ...d.acte])
    setMesaj((d.erori || []).join(' · ') || (r.ok ? '' : d.error || 'Încărcarea a eșuat'))
  }

  async function modifica(id: string, patch: Record<string, string>) {
    const vechi = acte
    setActe(prev => prev.map(a => a.id === id ? { ...a, ...(patch.tip ? { furnizor: patch.tip } : {}), ...(patch.fisier_nume ? { fisier_nume: patch.fisier_nume } : {}) } : a))
    const r = await fetch('/api/firma-date/acte', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, id, ...patch }) })
    if (!r.ok) { setActe(vechi); setMesaj('Modificarea nu s-a salvat') }
  }

  async function sterge(a: Act) {
    if (!confirm(`Ștergi „${a.fisier_nume}”?`)) return
    const r = await fetch(`/api/firma-date/acte?firmaId=${encodeURIComponent(firmaId)}&id=${a.id}`, { method: 'DELETE' })
    if (r.ok) setActe(prev => prev.filter(x => x.id !== a.id)); else setMesaj('Documentul nu s-a putut șterge')
  }

  const url = (a: Act, preview = false) => `/api/firma-date/acte?firmaId=${encodeURIComponent(firmaId)}&download=${a.id}${preview ? '&preview=1' : ''}`

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); incarca(Array.from(e.dataTransfer.files)) }}
      style={{ borderRadius: 'var(--r-md)', outline: drag ? '2px dashed var(--accent)' : 'none', outlineOffset: 6 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-888888)' }}>Acte firmă{acte.length ? ` · ${acte.length}` : ''}</span>
        <input ref={inputRef} type="file" multiple accept="application/pdf,image/*,.doc,.docx" style={{ display: 'none' }} onChange={e => incarca(Array.from(e.target.files || []))} />
        <button onClick={() => inputRef.current?.click()} disabled={busy} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}>{busy ? 'Se încarcă…' : '+ Adaugă acte'}</button>
      </div>

      {incarcat && acte.length === 0 && (
        <button onClick={() => inputRef.current?.click()} style={{ width: '100%', padding: '18px', border: '1px dashed var(--c-2a2a2a)', borderRadius: 'var(--r-md)', background: 'transparent', color: 'var(--c-777777)', fontSize: 'var(--fs-md)', cursor: 'pointer' }}>
          Trage aici actele firmei sau apasă pentru a alege (certificat de înregistrare, act constitutiv, constatator, contract sediu…). Poți încărca mai multe deodată.
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {acte.map((a, i) => (
          <div key={a.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 210px) minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: i ? '1px solid var(--c-1e1e1e)' : 'none' }} className="act-firma-row">
            <select value={a.furnizor || 'Altul'} onChange={e => modifica(a.id, { tip: e.target.value })} aria-label="Tipul actului"
              style={{ minWidth: 0, background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: 'var(--r-sm)', padding: '5px 8px', fontSize: 'var(--fs-sm)', color: 'var(--c-dddddd)' }}>
              {(tipuri.length ? tipuri : [a.furnizor || 'Altul']).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ minWidth: 0 }}>
              <input defaultValue={a.fisier_nume} aria-label="Numele documentului" title="Click pentru a redenumi"
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== a.fisier_nume) modifica(a.id, { fisier_nume: v }); else e.target.value = a.fisier_nume }}
                style={{ width: '100%', fontSize: 'var(--fs-md)', color: 'var(--c-dddddd)', background: 'transparent', border: 'none', outline: 'none', padding: 0, textOverflow: 'ellipsis' }} />
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-555555)', marginTop: 2 }}>adăugat {new Date(a.created_at).toLocaleDateString('ro-RO')}{a.fisier_marime ? ` · ${marime(a.fisier_marime)}` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {previzualizabil(a) && <button onClick={() => deschideDocument(url(a), a.fisier_nume)} style={{ ...btnText, color: 'var(--accent)' }}>Vezi</button>}
              <a href={url(a)} style={{ ...btnText, color: 'var(--accent-blue)' }}>Descarcă</a>
              <button onClick={() => sterge(a)} title="Șterge" aria-label={`Șterge ${a.fisier_nume}`} style={{ ...btnText, color: 'var(--c-777777)', fontSize: 'var(--fs-base)' }}>×</button>
            </div>
          </div>
        ))}
      </div>
      {mesaj && <div style={{ marginTop: 8, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{mesaj}</div>}
      <style>{`@media (max-width: 640px) { .act-firma-row { grid-template-columns: minmax(0, 1fr) auto !important; } .act-firma-row > select { grid-column: 1 / -1; } }`}</style>
    </div>
  )
}

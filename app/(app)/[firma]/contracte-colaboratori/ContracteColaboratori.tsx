'use client'
import { deschideDocument } from '@/lib/vizualizare'
import { useEffect, useRef, useState } from 'react'

// Contracte colaboratori: contractele primite de la colaboratori, fiecare salvat cu numele colaboratorului și
// data contractului. Mai multe fișiere, redenumibile, de văzut / descărcat / șters. API: /api/firma-date/contracte-colaboratori.

interface Contract { id: string; fisier_nume: string; fisier_tip: string | null; fisier_marime: number | null; furnizor: string | null; data_document: string | null; created_at: string }

const previzualizabil = (c: Contract) => /pdf|image/.test(c.fisier_tip || '') || /\.(pdf|jpe?g|png|webp)$/i.test(c.fisier_nume)
const marime = (b: number | null) => !b ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
const btnText: React.CSSProperties = { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'none' }

export default function ContracteColaboratori({ firmaId }: { firmaId: string }) {
  const [contracte, setContracte] = useState<Contract[]>([])
  const [incarcat, setIncarcat] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/firma-date/contracte-colaboratori?firmaId=${encodeURIComponent(firmaId)}`).then(r => r.json())
      .then(d => setContracte(d.contracte || [])).catch(() => setMesaj('Contractele nu s-au putut încărca')).finally(() => setIncarcat(true))
  }, [firmaId])

  // Direct din browser in storage (URL semnat), ca fisierele mari - contracte scanate de 8-20 MB - sa nu loveasca
  // limita de 4,5 MB a cererilor pe Vercel; serverul doar pregateste URL-urile si inregistreaza contractele.
  async function incarca(files: File[]) {
    if (!files.length) return
    setBusy(true); setMesaj('')
    const erori: string[] = []
    try {
      const r = await fetch('/api/firma-date/contracte-colaboratori', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, fisiere: files.map(f => ({ nume: f.name, tip: f.type, marime: f.size })) }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Pregătirea încărcării a eșuat (${r.status})`)
      const incarcate: { path: string; nume: string; tip: string; marime: number }[] = []
      await Promise.all((d.fisiere || []).map(async (x: { nume: string; path?: string; url?: string; eroare?: string }, i: number) => {
        if (x.eroare || !x.url || !x.path) { erori.push(`${x.nume}: ${x.eroare || 'eroare'}`); return }
        const f = files[i]
        const up = await fetch(x.url, { method: 'PUT', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f }).catch(() => null)
        if (!up?.ok) { erori.push(`${x.nume}: încărcarea în storage a eșuat${up ? ` (${up.status})` : ''}`); return }
        incarcate.push({ path: x.path, nume: f.name, tip: f.type, marime: f.size })
      }))
      if (incarcate.length) {
        const r2 = await fetch('/api/firma-date/contracte-colaboratori', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, incarcate }) })
        const d2 = await r2.json().catch(() => ({}))
        if (d2.contracte?.length) setContracte(prev => [...d2.contracte, ...prev])
        erori.push(...(d2.erori || []), ...(!r2.ok && !d2.erori ? [d2.error || 'Înregistrarea contractelor a eșuat'] : []))
      }
    } catch (e) { erori.push(e instanceof Error ? e.message : 'Încărcarea a eșuat') }
    setBusy(false); if (inputRef.current) inputRef.current.value = ''
    setMesaj(erori.join(' · '))
  }

  async function modifica(id: string, patch: Record<string, string>) {
    const vechi = contracte
    setContracte(prev => prev.map(c => c.id === id ? { ...c, ...(patch.colaborator !== undefined ? { furnizor: patch.colaborator } : {}), ...(patch.data_document !== undefined ? { data_document: patch.data_document || null } : {}), ...(patch.fisier_nume ? { fisier_nume: patch.fisier_nume } : {}) } : c))
    const r = await fetch('/api/firma-date/contracte-colaboratori', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, id, ...patch }) })
    if (!r.ok) { setContracte(vechi); setMesaj('Modificarea nu s-a salvat') }
  }

  async function sterge(c: Contract) {
    if (!confirm(`Ștergi contractul „${c.fisier_nume}”${c.furnizor ? ` (${c.furnizor})` : ''}?`)) return
    const r = await fetch(`/api/firma-date/contracte-colaboratori?firmaId=${encodeURIComponent(firmaId)}&id=${c.id}`, { method: 'DELETE' })
    if (r.ok) setContracte(prev => prev.filter(x => x.id !== c.id)); else setMesaj('Contractul nu s-a putut șterge')
  }

  const url = (c: Contract, preview = false) => `/api/firma-date/contracte-colaboratori?firmaId=${encodeURIComponent(firmaId)}&download=${c.id}${preview ? '&preview=1' : ''}`

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); incarca(Array.from(e.dataTransfer.files)) }}
      style={{ borderRadius: 'var(--r-md)', outline: drag ? '2px dashed var(--accent)' : 'none', outlineOffset: 6 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-888888)' }}>Contracte colaboratori{contracte.length ? ` · ${contracte.length}` : ''}</span>
        <input ref={inputRef} type="file" multiple accept="application/pdf,image/*,.doc,.docx" style={{ display: 'none' }} onChange={e => incarca(Array.from(e.target.files || []))} />
        <button onClick={() => inputRef.current?.click()} disabled={busy} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}>{busy ? 'Se încarcă…' : '+ Adaugă contract'}</button>
      </div>

      {incarcat && contracte.length === 0 && (
        <button onClick={() => inputRef.current?.click()} style={{ width: '100%', padding: '18px', border: '1px dashed var(--c-2a2a2a)', borderRadius: 'var(--r-md)', background: 'transparent', color: 'var(--c-777777)', fontSize: 'var(--fs-md)', cursor: 'pointer' }}>
          Trage aici contractele de la colaboratori sau apasă pentru a alege (PDF, imagini, Word). Poți încărca mai multe deodată; după încărcare scrii numele colaboratorului și data contractului.
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {contracte.map((c, i) => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 230px) minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: i ? '1px solid var(--c-1e1e1e)' : 'none' }} className="contract-colab-row">
            <input defaultValue={c.furnizor || ''} aria-label="Numele colaboratorului" placeholder="Nume colaborator" title="Numele colaboratorului"
              onBlur={e => { const v = e.target.value.trim(); if (v !== (c.furnizor || '')) modifica(c.id, { colaborator: v }) }}
              style={{ minWidth: 0, background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: 'var(--r-sm)', padding: '6px 9px', fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--c-dddddd)' }} />
            <div style={{ minWidth: 0 }}>
              <input defaultValue={c.fisier_nume} aria-label="Numele documentului" title="Click pentru a redenumi"
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.fisier_nume) modifica(c.id, { fisier_nume: v }); else e.target.value = c.fisier_nume }}
                style={{ width: '100%', fontSize: 'var(--fs-md)', color: 'var(--c-dddddd)', background: 'transparent', border: 'none', outline: 'none', padding: 0, textOverflow: 'ellipsis' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', color: 'var(--c-888888)' }}>
                  Data
                  <input type="date" defaultValue={c.data_document || ''} aria-label="Data contractului" title="Data contractului"
                    onChange={e => modifica(c.id, { data_document: e.target.value })}
                    style={{ background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: 'var(--r-sm)', padding: '3px 6px', fontSize: 'var(--fs-xs)', color: 'var(--c-dddddd)', colorScheme: 'dark' }} />
                </label>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-555555)' }}>adăugat {new Date(c.created_at).toLocaleDateString('ro-RO')}{c.fisier_marime ? ` · ${marime(c.fisier_marime)}` : ''}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {previzualizabil(c) && <button onClick={() => deschideDocument(url(c, true), c.fisier_nume)} style={{ ...btnText, color: 'var(--accent)' }}>Vezi</button>}
              <a href={url(c)} style={{ ...btnText, color: 'var(--accent-blue)' }}>Descarcă</a>
              <button onClick={() => sterge(c)} title="Șterge" aria-label={`Șterge ${c.fisier_nume}`} style={{ ...btnText, color: 'var(--c-777777)', fontSize: 'var(--fs-base)' }}>×</button>
            </div>
          </div>
        ))}
      </div>
      {mesaj && <div style={{ marginTop: 8, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{mesaj}</div>}
      <style>{`@media (max-width: 640px) { .contract-colab-row { grid-template-columns: minmax(0, 1fr) auto !important; } .contract-colab-row > input:first-child { grid-column: 1 / -1; } }`}</style>
    </div>
  )
}

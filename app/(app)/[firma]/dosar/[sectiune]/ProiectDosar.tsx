'use client'
import { deschideDocument } from '@/lib/vizualizare'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DosarConfig } from '@/lib/proiect-dosar'

// O sectiune din dosarul proiectului (Angajati / Activitate / Social): repository de documente pe tot proiectul,
// fiecare cu un tip (din config) si o bifa „ce cere vizita” (tipurile `cerut`). Incarcare din browser direct in
// storage (URL semnat), ca fisierele mari sa nu loveasca limita de 4,5 MB a Vercel. API: /api/proiect-dosar.

interface Doc { id: string; fisier_nume: string; fisier_tip: string | null; fisier_marime: number | null; furnizor: string | null; data_document: string | null; tip_document: string | null; created_at: string }

const previzualizabil = (d: Doc) => /pdf|image/.test(d.fisier_tip || '') || /\.(pdf|jpe?g|png|webp)$/i.test(d.fisier_nume)
const marime = (b: number | null) => !b ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
const btnText: React.CSSProperties = { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'none' }
const camp: React.CSSProperties = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 9px', fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }

export default function ProiectDosar({ firmaId, cfg }: { firmaId: string; cfg: DosarConfig }) {
  const api = `/api/proiect-dosar?sectiune=${cfg.sectiune}`
  const [docs, setDocs] = useState<Doc[]>([])
  const [incarcat, setIncarcat] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const [bun, setBun] = useState('')
  const [drag, setDrag] = useState(false)
  const [tipImplicit, setTipImplicit] = useState(cfg.tipuri[0].tip)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${api}&firmaId=${encodeURIComponent(firmaId)}`).then(r => r.json())
      .then(d => setDocs(d.documente || [])).catch(() => setMesaj('Documentele nu s-au putut încărca')).finally(() => setIncarcat(true))
  }, [api, firmaId])

  // Cate documente are fiecare tip - pentru bifa „ce cere vizita”.
  const peTip = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of docs) m[d.tip_document || ''] = (m[d.tip_document || ''] || 0) + 1
    return m
  }, [docs])
  const cerute = cfg.tipuri.filter(t => t.cerut)
  const avem = cerute.filter(t => peTip[t.tip]).length

  async function incarca(files: File[]) {
    if (!files.length) return
    setBusy(true); setMesaj(''); setBun('')
    const erori: string[] = []
    try {
      const r = await fetch(api, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, fisiere: files.map(f => ({ nume: f.name, tip: f.type, marime: f.size })) }) })
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
        const r2 = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, tip: tipImplicit, incarcate }) })
        const d2 = await r2.json().catch(() => ({}))
        if (d2.documente?.length) setDocs(prev => [...d2.documente, ...prev])
        erori.push(...(d2.erori || []), ...(!r2.ok && !d2.erori ? [d2.error || 'Înregistrarea documentelor a eșuat'] : []))
      }
    } catch (e) { erori.push(e instanceof Error ? e.message : 'Încărcarea a eșuat') }
    setBusy(false); if (inputRef.current) inputRef.current.value = ''
    setMesaj(erori.join(' · '))
  }

  async function modifica(id: string, patch: Record<string, string>) {
    const vechi = docs
    setDocs(prev => prev.map(d => d.id === id ? { ...d, ...(patch.nume !== undefined ? { furnizor: patch.nume } : {}), ...(patch.data_document !== undefined ? { data_document: patch.data_document || null } : {}), ...(patch.tip !== undefined ? { tip_document: patch.tip } : {}), ...(patch.fisier_nume ? { fisier_nume: patch.fisier_nume } : {}) } : d))
    const r = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, id, ...patch }) })
    if (!r.ok) { setDocs(vechi); setMesaj('Modificarea nu s-a salvat') }
  }

  async function sterge(d: Doc) {
    if (!confirm(`Ștergi documentul „${d.fisier_nume}”${d.furnizor ? ` (${d.furnizor})` : ''}?`)) return
    const r = await fetch(`${api}&firmaId=${encodeURIComponent(firmaId)}&id=${d.id}`, { method: 'DELETE' })
    if (r.ok) setDocs(prev => prev.filter(x => x.id !== d.id)); else setMesaj('Documentul nu s-a putut șterge')
  }

  async function copiazaDinFirma() {
    setBusy(true); setMesaj(''); setBun('')
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'copiaza-din-firma' }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Copierea a eșuat')
      const g = await fetch(`${api}&firmaId=${encodeURIComponent(firmaId)}`).then(x => x.json()).catch(() => null)
      if (g?.documente) setDocs(g.documente)
      setBun(d.copiate ? `${d.copiate} document(e) copiate din ${d.firma || 'firmă'}${d.sarite ? ` · ${d.sarite} erau deja aici` : ''}` : `Nimic nou de copiat${d.sarite ? ` · ${d.sarite} erau deja aici` : ''}`)
      if (d.erori?.length) setMesaj(d.erori.join(' · '))
    } catch (e) { setMesaj(e instanceof Error ? e.message : 'Copierea a eșuat') }
    setBusy(false)
  }

  const url = (d: Doc, preview = false) => `${api}&firmaId=${encodeURIComponent(firmaId)}&download=${d.id}${preview ? '&preview=1' : ''}`

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); incarca(Array.from(e.dataTransfer.files)) }}
      style={{ borderRadius: 'var(--r-md)', outline: drag ? '2px dashed var(--accent)' : 'none', outlineOffset: 6 }}
    >
      {/* Bifa „ce cere vizita” */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <strong style={{ fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }}>Ce cere vizita din 24.11</strong>
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: avem === cerute.length ? 'var(--success)' : 'var(--text-secondary)' }}>{avem}/{cerute.length}</span>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {cerute.map(t => {
            const n = peTip[t.tip] || 0
            return (
              <div key={t.tip} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 'var(--fs-sm)' }}>
                <span aria-hidden style={{ color: n ? 'var(--success)' : 'var(--text-muted)', fontWeight: 700, width: 16, flexShrink: 0 }}>{n ? '✓' : '○'}</span>
                <span style={{ color: n ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {t.label}
                  {t.hint && <span style={{ color: 'var(--text-muted)' }}> · {t.hint}</span>}
                </span>
                <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--fs-xs)', fontWeight: 600, color: n ? 'var(--success)' : 'var(--text-muted)' }}>{n ? `${n} doc.` : 'lipsește'}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bara de incarcare */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{cfg.label}{docs.length ? ` · ${docs.length} documente` : ''}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            Tip
            <select value={tipImplicit} onChange={e => setTipImplicit(e.target.value)} title="Tipul documentelor pe care le încarci acum" style={{ ...camp, padding: '4px 6px', fontSize: 'var(--fs-xs)' }}>
              {cfg.tipuri.map(t => <option key={t.tip} value={t.tip}>{t.label}</option>)}
            </select>
          </label>
          {cfg.copiazaDinFirma && (
            <button onClick={copiazaDinFirma} disabled={busy} title="Aduce copii ale balanțelor și extraselor din firma AB Textile"
              style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '5px 9px', cursor: 'pointer' }}>
              ⧉ Copiază din firmă
            </button>
          )}
          <input ref={inputRef} type="file" multiple accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={e => incarca(Array.from(e.target.files || []))} />
          <button onClick={() => inputRef.current?.click()} disabled={busy} style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}>{busy ? 'Se încarcă…' : '+ Adaugă document'}</button>
        </div>
      </div>

      {incarcat && docs.length === 0 && (
        <button onClick={() => inputRef.current?.click()} style={{ width: '100%', padding: 18, border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 'var(--fs-md)', cursor: 'pointer' }}>
          Trage aici documentele sau apasă pentru a alege (PDF, imagini, Word, Excel). Poți încărca mai multe deodată; alege „Tip” înainte, apoi corectezi numele și data pe fiecare rând.
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {docs.map((d, i) => (
          <div key={d.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 210px) minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: i ? '1px solid var(--border-subtle)' : 'none' }} className="dosar-row">
            <input defaultValue={d.furnizor || ''} aria-label={cfg.numeLabel} placeholder={cfg.numePlaceholder} title={cfg.numeLabel}
              onBlur={e => { const v = e.target.value.trim(); if (v !== (d.furnizor || '')) modifica(d.id, { nume: v }) }}
              style={{ ...camp, minWidth: 0, fontWeight: 600 }} />
            <div style={{ minWidth: 0 }}>
              <input defaultValue={d.fisier_nume} aria-label="Numele fișierului" title="Click pentru a redenumi"
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== d.fisier_nume) modifica(d.id, { fisier_nume: v }); else e.target.value = d.fisier_nume }}
                style={{ width: '100%', fontSize: 'var(--fs-md)', color: 'var(--text-primary)', background: 'transparent', border: 'none', outline: 'none', padding: 0, textOverflow: 'ellipsis' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                <select value={d.tip_document || cfg.tipuri[0].tip} onChange={e => modifica(d.id, { tip: e.target.value })} aria-label="Tipul documentului"
                  style={{ ...camp, padding: '3px 6px', fontSize: 'var(--fs-xs)' }}>
                  {cfg.tipuri.map(t => <option key={t.tip} value={t.tip}>{t.label}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                  Data
                  <input type="date" defaultValue={d.data_document || ''} aria-label="Data documentului" title="Data documentului"
                    onChange={e => modifica(d.id, { data_document: e.target.value })}
                    style={{ ...camp, padding: '3px 6px', fontSize: 'var(--fs-xs)' }} />
                </label>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>adăugat {new Date(d.created_at).toLocaleDateString('ro-RO')}{d.fisier_marime ? ` · ${marime(d.fisier_marime)}` : ''}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {previzualizabil(d) && <button onClick={() => deschideDocument(url(d, true), d.fisier_nume)} style={{ ...btnText, color: 'var(--accent)' }}>Vezi</button>}
              <a href={url(d)} style={{ ...btnText, color: 'var(--accent-blue)' }}>Descarcă</a>
              <button onClick={() => sterge(d)} title="Șterge" aria-label={`Șterge ${d.fisier_nume}`} style={{ ...btnText, color: 'var(--text-muted)', fontSize: 'var(--fs-base)' }}>×</button>
            </div>
          </div>
        ))}
      </div>
      {bun && <div style={{ marginTop: 8, fontSize: 'var(--fs-sm)', color: 'var(--success)' }}>{bun}</div>}
      {mesaj && <div style={{ marginTop: 8, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{mesaj}</div>}
      <style>{`@media (max-width: 640px) { .dosar-row { grid-template-columns: minmax(0, 1fr) auto !important; } .dosar-row > input:first-child { grid-column: 1 / -1; } }`}</style>
    </div>
  )
}

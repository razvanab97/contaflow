'use client'
import { useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'
import { printeazaDocxPdf } from '@/lib/docxPrint'

// Card pentru un document „pus în lucru" (copie editabilă dintr-un draft), folosit atât în Registrul
// activității (GeneratorSocial), cât și direct într-o zonă (DocumenteZona). Oferă:
//  • stare Emis ↔ În lucru, Vezi / Word / PDF, ștergere;
//  • „✨ Pregătește" (AI găsește spațiile de completat, umple ce deduce din datele interne);
//  • o ZONĂ DE EDITARE pentru câmpurile rămase manuale + butonul „📥 Du în document" care le scrie în Word.

export interface DocLucru {
  id: string; fisier_nume: string; fisier_tip: string | null; furnizor: string | null
  tip_document: string | null; data_document?: string | null; stare?: string | null; nr_inregistrare?: number | null
}
interface CampManual { nr: number; eticheta: string }
interface RezPregatire { completate: number; total: number; manuale: CampManual[] }

const disp: React.CSSProperties = { fontFamily: 'var(--font-bricolage), var(--font-geist), system-ui, sans-serif' }
const mono: React.CSSProperties = { fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }
const roData = (iso?: string | null) => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : ''
const ico: React.CSSProperties = { width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 13, flexShrink: 0 }
const word: React.CSSProperties = { fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '7px 13px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', textDecoration: 'none', cursor: 'pointer', flexShrink: 0 }
const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, border: 'none', cursor: 'pointer' }

export default function DocLucruCard({ firmaId, api, doc, activitati, onActualizat, onSters, onMutaInActivitate, disabled }: {
  firmaId: string; api: string; doc: DocLucru; activitati?: { id: string; denumire: string }[]
  onActualizat: (d: DocLucru) => void; onSters: (id: string) => void; onMutaInActivitate?: (d: DocLucru) => void; disabled?: boolean
}) {
  const [busy, setBusy] = useState('')
  const [rez, setRez] = useState<RezPregatire | null>(null)
  const [valori, setValori] = useState<Record<string, string>>({})
  const [mesaj, setMesaj] = useState('')
  const inLucru = doc.stare === 'in_lucru'
  const titlu = doc.furnizor || doc.fisier_nume
  const urlDoc = (preview = false) => `${api}&download=${doc.id}${preview ? '&preview=1' : ''}`

  async function pregateste() {
    setBusy('p'); setMesaj('')
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'pregateste-doc', docId: doc.id }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.document) { onActualizat(d.document); setRez({ completate: d.completate || 0, total: d.total || 0, manuale: d.manuale || [] }); setValori({}) }
      else setMesaj(d.error || 'Nu s-a putut pregăti documentul')
    } catch { setMesaj('Pregătirea a eșuat') } finally { setBusy('') }
  }
  async function duInDocument() {
    if (!rez) return
    const campuri = rez.manuale.map(m => ({ nr: m.nr, eticheta: m.eticheta, valoare: (valori[m.nr] || '').trim() }))
    if (!campuri.some(c => c.valoare)) { setMesaj('Completează cel puțin un câmp.'); return }
    setBusy('c'); setMesaj('')
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'completeaza-manual', docId: doc.id, campuri }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.document) { onActualizat(d.document); setRez({ completate: d.completate || 0, total: d.total || 0, manuale: d.manuale || [] }); setValori({}) }
      else setMesaj(d.error || 'Nu s-a putut completa')
    } catch { setMesaj('Completarea a eșuat') } finally { setBusy('') }
  }
  async function schimbaStare() {
    setBusy('s')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'stare-doc', docId: doc.id, stare: inLucru ? 'emis' : 'in_lucru' }) })
    const d = await r.json().catch(() => ({})); setBusy('')
    if (r.ok && d.document) onActualizat(d.document); else setMesaj(d.error || 'Nu s-a putut schimba starea')
  }
  async function sterge() {
    if (!confirm(`Scoți din lucru documentul „${titlu}"?`)) return
    const r = await fetch(`${api}&doc=${doc.id}`, { method: 'DELETE' })
    if (r.ok) onSters(doc.id); else setMesaj('Nu s-a putut șterge')
  }
  async function muta(actId: string) {
    setBusy('m'); setMesaj('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'muta-doc-activitate', docId: doc.id, activitateId: actId }) })
    const d = await r.json().catch(() => ({})); setBusy('')
    if (r.ok && d.document) onMutaInActivitate?.(d.document); else setMesaj(d.error || 'Nu s-a putut muta')
  }

  return (
    <div style={{ border: '1px solid color-mix(in srgb, var(--accent) 22%, var(--border))', borderRadius: 'var(--r-md)', background: 'color-mix(in srgb, var(--accent) 4%, var(--surface))', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px' }}>
        <span style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center', border: '1px solid var(--border)', background: 'var(--surface)', ...mono, fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--accent)' }}>
          {doc.nr_inregistrare != null ? doc.nr_inregistrare : '✦'}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...disp, fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titlu}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 3 }}>
            {doc.data_document && <span style={{ ...mono, fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>{roData(doc.data_document)}</span>}
            <button onClick={schimbaStare} disabled={busy === 's'} title="Apasă pentru a comuta: Emis ↔ În lucru"
              style={{ ...pill, color: inLucru ? 'var(--accent-amber, #e0a84a)' : 'var(--accent-green)', background: inLucru ? 'color-mix(in srgb, var(--accent-amber, #e0a84a) 15%, transparent)' : 'color-mix(in srgb, var(--accent-green) 13%, transparent)', opacity: busy === 's' ? 0.5 : 1 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: inLucru ? 'var(--accent-amber, #e0a84a)' : 'var(--accent-green)' }} />{inLucru ? 'În lucru' : 'Emis'}</button>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>pus în lucru dintr-un draft</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!disabled && onMutaInActivitate && (activitati?.length ?? 0) > 0 && (
            <select value="" onChange={e => { if (e.target.value) muta(e.target.value) }} disabled={busy === 'm'} title="Mută documentul în cadrul unei activități"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 7px', fontSize: 'var(--fs-xs)', color: 'var(--accent)', fontWeight: 700, maxWidth: 150, cursor: 'pointer' }}>
              <option value="">→ activitate…</option>
              {activitati!.map(a => <option key={a.id} value={a.id}>{a.denumire}</option>)}
            </select>
          )}
          {!disabled && <button onClick={pregateste} disabled={busy === 'p'} className="gsoc-solid" title="AI identifică ce lipsește, completează din datele interne și pregătește ce rămâne de completat manual"
            style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '7px 13px', borderRadius: 999, cursor: 'pointer', opacity: busy === 'p' ? 0.6 : 1 }}>{busy === 'p' ? 'Se pregătește…' : '✨ Pregătește'}</button>}
          <button onClick={() => deschideDocument(urlDoc(true), doc.fisier_nume)} style={ico} title="Vezi">👁</button>
          <a href={urlDoc()} style={word} title="Descarcă Word (editabil)">Word</a>
          <button onClick={() => printeazaDocxPdf(urlDoc(), doc.fisier_nume)} style={{ ...word, cursor: 'pointer' }} title="PDF (pregătit de semnare)">PDF</button>
          {!disabled && <button onClick={sterge} title="Scoate din lucru" aria-label={`Șterge ${titlu}`} style={{ ...ico, fontSize: 15 }}>×</button>}
        </div>
      </div>

      {rez && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '11px 13px', fontSize: 'var(--fs-xs)' }}>
          <div style={{ fontWeight: 700, color: 'var(--accent-green)' }}>✓ Am completat {rez.completate} {rez.completate === 1 ? 'câmp' : 'câmpuri'} din datele interne{rez.total ? ` (din ${rez.total})` : ''}.</div>
          {rez.manuale.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>Completează aici ce lipsește, apoi trimite în document ({rez.manuale.length}):</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
                {rez.manuale.map(m => (
                  <label key={m.nr} style={{ display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--text-muted)' }}>
                    {m.eticheta}
                    <input value={valori[m.nr] || ''} onChange={e => setValori(v => ({ ...v, [m.nr]: e.target.value }))} placeholder="completează…"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 9px', fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box' }} /></label>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
                <button onClick={duInDocument} disabled={busy === 'c'} className="gsoc-solid" style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, padding: '8px 15px', borderRadius: 999, cursor: 'pointer', opacity: busy === 'c' ? 0.6 : 1 }}>{busy === 'c' ? 'Se scrie…' : '📥 Du în document'}</button>
                <span style={{ color: 'var(--text-muted)' }}>Câmpurile lăsate goale rămân linii „______" în Word.</span>
              </div>
            </div>
          ) : <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>Nu a mai rămas nimic de completat. Deschide documentul (Word / Vezi).</div>}
        </div>
      )}
      {mesaj && <div style={{ padding: '0 13px 10px', fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{mesaj}</div>}
    </div>
  )
}

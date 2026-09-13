'use client'
import { useRef, useState } from 'react'
import { legibil, tint } from '@/lib/colors'

interface ProiectDoc { id: string; fisier_nume: string; fisier_tip: string | null; fisier_marime: number | null; updated_at: string }

function rgb(h: string) { return `${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)}` }
function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function fmtData(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  doc: ProiectDoc | null
  culoare: string
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
}

// Gestiunea fisierului brut (.docx/.pdf) - functionalitate existenta, mutata aici dintr-un
// singur card monolitic, ca sa nu mai concureze vizual cu editorul de campuri.
export default function ReportFiles({ doc, culoare, uploading, onUpload, onRemove }: Props) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const r = rgb(culoare)

  return (
    <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px', maxWidth: '640px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>
        Document unic — se înlocuiește, nu se acumulează
      </div>
      <p style={{ fontSize: '12px', color: 'var(--c-666666)', marginBottom: '14px' }}>
        Descarcă documentul, completează-l în Word dacă preferi editarea directă, apoi reîncarcă-l aici — versiunea nouă o înlocuiește pe cea veche.
      </p>

      {doc ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--c-161616)', border: '1px solid var(--c-262626)', borderRadius: '8px', flexWrap: 'wrap' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: culoare, flexShrink: 0 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', color: 'var(--c-dddddd)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.fisier_nume}</div>
            <div style={{ fontSize: '11px', color: 'var(--c-666666)', marginTop: '2px' }}>{fmtSize(doc.fisier_marime)} · actualizat {fmtData(doc.updated_at)}</div>
          </div>
          <a href={`/api/proiect-documente/download?id=${doc.id}`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)', textDecoration: 'none', flexShrink: 0 }}>Descarcă</a>
          <button onClick={() => inputRef.current?.click()} disabled={uploading} style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '7px', border: `1px solid ${culoare}`, background: 'transparent', color: legibil(culoare), cursor: 'pointer', flexShrink: 0, opacity: uploading ? .6 : 1 }}>
            {uploading ? 'Se încarcă...' : 'Încarcă versiune nouă'}
          </button>
          <button onClick={onRemove} title="Șterge" style={{ width: '26px', height: '26px', flexShrink: 0, background: 'var(--c-1a1a1a)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', cursor: 'pointer', color: 'var(--accent-red)', fontSize: '13px', lineHeight: 1 }}>×</button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onUpload(e.dataTransfer.files[0]) }}
          style={{ border: `1.5px dashed ${drag ? culoare : 'var(--c-2a2a2a)'}`, borderRadius: '10px', padding: '20px', textAlign: 'center', cursor: 'pointer', background: drag ? `${tint(r, .04)}` : 'var(--c-0d0d0d)' }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-888888)' }}>{uploading ? 'Se încarcă...' : '+ Adaugă raportul lunar'}</div>
          <div style={{ fontSize: '12px', color: 'var(--c-666666)', marginTop: '3px' }}>Word (.doc, .docx) sau PDF</div>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".doc,.docx,application/pdf" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }} onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }}/>
    </div>
  )
}

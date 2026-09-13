'use client'
import { useEffect, useRef, useState } from 'react'
import TaskSection, { TaskItem } from './TaskSection'
import { legibil, tint } from '@/lib/colors'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string; tasks: TaskItem[] }
interface ProiectDoc { id: string; fisier_nume: string; fisier_tip: string | null; fisier_marime: number | null; updated_at: string }
interface Campuri { perioada: string; autorizatii: string; obiective: string; activitati: string }

const SECTIUNE = 'raport_lunar'

const TEXTAREA_STYLE: React.CSSProperties = { width: '100%', minHeight: '64px', fontSize: '13px', color: 'var(--c-dddddd)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '8px 10px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }
const LABEL_STYLE: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--c-999999)', marginBottom: '5px', display: 'block' }

function RaportCampuriForm({ firma, onGenerated }: { firma: Firma; onGenerated: () => void }) {
  const [loading, setLoading] = useState(true)
  const [sablonConfigurat, setSablonConfigurat] = useState(false)
  const [campuri, setCampuri] = useState<Campuri>({ perioada: '', autorizatii: '', obiective: '', activitati: '' })
  const [configuring, setConfiguring] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function load() {
    fetch(`/api/proiect-documente/campuri?firmaId=${encodeURIComponent(firma.id)}`)
      .then(res => res.json())
      .then(data => {
        setSablonConfigurat(!!data.sablonConfigurat)
        if (data.campuri) setCampuri({ perioada: data.campuri.perioada, autorizatii: data.campuri.autorizatii, obiective: data.campuri.obiective, activitati: data.campuri.activitati })
        setLoading(false)
      }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [firma.id])

  async function configureaza() {
    setConfiguring(true); setError('')
    const res = await fetch('/api/proiect-documente/configureaza-sablon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Configurarea a eșuat')
    else { setSablonConfigurat(true); setCampuri({ perioada: data.campuri.perioada, autorizatii: data.campuri.autorizatii, obiective: data.campuri.obiective, activitati: data.campuri.activitati }) }
    setConfiguring(false)
  }

  async function genereaza() {
    setGenerating(true); setError(''); setSuccess(false)
    const res = await fetch('/api/proiect-documente/genereaza', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id, ...campuri }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Generarea a eșuat')
    else { setSuccess(true); setTimeout(() => setSuccess(false), 3000); onGenerated() }
    setGenerating(false)
  }

  if (loading) return null

  return (
    <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>
        Completare rapidă (fără Word)
      </div>

      {!sablonConfigurat ? (
        <>
          <p style={{ fontSize: '12px', color: 'var(--c-666666)', marginBottom: '14px' }}>
            Detectez automat, în documentul de mai sus, secțiunile care se schimbă lunar (perioadă, autorizații, obiective, activități) — o singură dată, apoi le completezi dintr-un formular, fără să mai deschizi Word.
          </p>
          <button onClick={configureaza} disabled={configuring} style={{ fontSize: '12px', fontWeight: 600, padding: '8px 16px', borderRadius: '8px', border: 'none', background: firma.culoare, color: 'var(--c-ffffff)', cursor: 'pointer', opacity: configuring ? .6 : 1 }}>
            {configuring ? 'Se configurează...' : 'Configurează formularul din documentul curent'}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: '12px', color: 'var(--c-666666)', marginBottom: '14px' }}>
            Completează pentru luna curentă și generează — documentul de mai sus se actualizează automat, cu formatarea originală păstrată.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={LABEL_STYLE}>Perioada de raportare</label>
              <input value={campuri.perioada} onChange={e => setCampuri(c => ({ ...c, perioada: e.target.value }))} placeholder="01.06.2026 – 30.06.2026" style={{ ...TEXTAREA_STYLE, minHeight: 'auto' }}/>
            </div>
            <div>
              <label style={LABEL_STYLE}>Autorizații necesare (o linie per autorizație)</label>
              <textarea value={campuri.autorizatii} onChange={e => setCampuri(c => ({ ...c, autorizatii: e.target.value }))} style={TEXTAREA_STYLE}/>
            </div>
            <div>
              <label style={LABEL_STYLE}>Obiective realizate în lună (o linie per obiectiv)</label>
              <textarea value={campuri.obiective} onChange={e => setCampuri(c => ({ ...c, obiective: e.target.value }))} style={TEXTAREA_STYLE}/>
            </div>
            <div>
              <label style={LABEL_STYLE}>Activități derulate în lună (o linie per activitate)</label>
              <textarea value={campuri.activitati} onChange={e => setCampuri(c => ({ ...c, activitati: e.target.value }))} style={TEXTAREA_STYLE}/>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={genereaza} disabled={generating} style={{ fontSize: '12px', fontWeight: 600, padding: '8px 16px', borderRadius: '8px', border: 'none', background: firma.culoare, color: 'var(--c-ffffff)', cursor: 'pointer', opacity: generating ? .6 : 1 }}>
              {generating ? 'Se generează...' : 'Generează raportul'}
            </button>
            {success && <span style={{ fontSize: '12px', color: 'var(--accent-mint)' }}>✓ Raport generat și actualizat mai sus</span>}
          </div>
        </>
      )}
      {error && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '10px' }}>{error}</p>}
    </div>
  )
}

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }
function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function fmtData(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
}

export default function RaportLunarProiectModule({ firma, lunaId, tasks }: Props) {
  const [doc, setDoc] = useState<ProiectDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewIsPdf, setPreviewIsPdf] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const r = rgb(firma.culoare)

  function load() {
    fetch(`/api/proiect-documente?firmaId=${encodeURIComponent(firma.id)}&sectiune=${SECTIUNE}`)
      .then(res => res.json())
      .then(data => { setDoc(data.doc || null); setLoading(false) })
      .catch(() => { setError('Eroare la încărcare'); setLoading(false) })
  }

  useEffect(() => { load() }, [firma.id])

  function handleGenerated() {
    load()
    setPreviewOpen(false); setPreviewHtml(null); setPreviewIsPdf(false)
  }

  async function togglePreview() {
    if (previewOpen) { setPreviewOpen(false); return }
    if (!doc) return
    setPreviewOpen(true)
    if (previewHtml || previewIsPdf) return
    setPreviewLoading(true); setPreviewError('')
    const res = await fetch(`/api/proiect-documente/preview?id=${doc.id}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setPreviewError(data.error || 'Previzualizarea a eșuat')
    else if (data.pdf) setPreviewIsPdf(true)
    else setPreviewHtml(data.html || '')
    setPreviewLoading(false)
  }

  async function upload(file: File) {
    setUploading(true); setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('firmaId', firma.id)
    fd.append('sectiune', SECTIUNE)
    const res = await fetch('/api/proiect-documente', { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Eroare upload')
    else { setDoc(data.doc); setPreviewOpen(false); setPreviewHtml(null); setPreviewIsPdf(false) }
    setUploading(false)
  }

  async function removeDoc() {
    if (!doc || !confirm('Ștergi documentul curent? Va trebui reîncărcat de la zero.')) return
    setDoc(null)
    setPreviewOpen(false); setPreviewHtml(null); setPreviewIsPdf(false)
    await fetch(`/api/proiect-documente?firmaId=${encodeURIComponent(firma.id)}&sectiune=${SECTIUNE}`, { method: 'DELETE' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <TaskSection tasks={tasks} lunaId={lunaId} culoare={firma.culoare}/>

      <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>
          Document unic — se înlocuiește, nu se acumulează
        </div>
        <p style={{ fontSize: '12px', color: 'var(--c-666666)', marginBottom: '14px' }}>
          Descarcă documentul, completează-l în Word pentru luna curentă, apoi reîncarcă-l aici — versiunea nouă o înlocuiește pe cea veche.
        </p>

        {loading ? (
          <p style={{ fontSize: '13px', color: 'var(--c-555555)' }}>Se încarcă...</p>
        ) : error && !doc ? (
          <p style={{ fontSize: '12px', color: 'var(--accent-red)' }}>{error}</p>
        ) : doc ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--c-161616)', border: '1px solid var(--c-262626)', borderRadius: '8px', flexWrap: 'wrap' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: firma.culoare, flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--c-dddddd)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.fisier_nume}</div>
                <div style={{ fontSize: '11px', color: 'var(--c-666666)', marginTop: '2px' }}>{fmtSize(doc.fisier_marime)} · actualizat {fmtData(doc.updated_at)}</div>
              </div>
              <button onClick={togglePreview} style={{ fontSize: '12px', fontWeight: 600, color: previewOpen ? 'var(--c-dddddd)' : 'var(--accent-mint)', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                {previewOpen ? 'Ascunde' : 'Previzualizează'}
              </button>
              <a href={`/api/proiect-documente/download?id=${doc.id}`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)', textDecoration: 'none', flexShrink: 0 }}>Descarcă</a>
              <button onClick={() => inputRef.current?.click()} disabled={uploading} style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '7px', border: `1px solid ${firma.culoare}`, background: 'transparent', color: legibil(firma.culoare), cursor: 'pointer', flexShrink: 0, opacity: uploading ? .6 : 1 }}>
                {uploading ? 'Se încarcă...' : 'Încarcă versiune nouă'}
              </button>
              <button onClick={removeDoc} title="Șterge" style={{ width: '26px', height: '26px', flexShrink: 0, background: 'var(--c-1a1a1a)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', cursor: 'pointer', color: 'var(--accent-red)', fontSize: '13px', lineHeight: 1 }}>×</button>
            </div>

            {previewOpen && (
              previewLoading ? (
                <p style={{ fontSize: '12px', color: 'var(--c-666666)', marginTop: '8px' }}>Se randează previzualizarea...</p>
              ) : previewError ? (
                <p style={{ fontSize: '12px', color: 'var(--accent-red)', marginTop: '8px' }}>{previewError}</p>
              ) : previewIsPdf ? (
                <iframe src={`/api/proiect-documente/download?id=${doc.id}&preview=1`} style={{ width: '100%', height: '75vh', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '8px', background: 'var(--c-ffffff)' }}/>
              ) : previewHtml != null ? (
                <div
                  className="docx-preview"
                  style={{ background: 'var(--c-ffffff)', color: '#1a1a1a', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '8px', padding: '32px 40px', maxHeight: '75vh', overflowY: 'auto', fontSize: '14px', lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : null
            )}
          </div>
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]) }}
            style={{ border: `1.5px dashed ${drag ? firma.culoare : 'var(--c-2a2a2a)'}`, borderRadius: '10px', padding: '20px', textAlign: 'center', cursor: 'pointer', background: drag ? `${tint(r,.04)}` : 'var(--c-0d0d0d)' }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-888888)' }}>
              {uploading ? 'Se încarcă...' : '+ Adaugă raportul lunar'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--c-666666)', marginTop: '3px' }}>Word (.doc, .docx) sau PDF</div>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".doc,.docx,application/pdf" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}/>
        {error && doc && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '8px' }}>{error}</p>}
      </div>

      {doc && <RaportCampuriForm firma={firma} onGenerated={handleGenerated}/>}
    </div>
  )
}

'use client'
import { useState, useRef, useCallback } from 'react'

interface Doc {
  id: string
  fisier_nume: string
  tip_document?: string
  furnizor?: string
}

interface Props {
  firmaId: string
  lunaId: string
  section: string
  culoare: string
  title: string
  description?: string
  showLinkImport?: boolean
  linkPlaceholder?: string
  documentTypeOptions?: { value: string; label: string }[]
}

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

export default function UploadPanel({
  firmaId, lunaId, section, culoare, title, description,
  showLinkImport = false, linkPlaceholder, documentTypeOptions,
}: Props) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [supplier, setSupplier] = useState('')
  const [documentType, setDocumentType] = useState(documentTypeOptions?.[0]?.value || 'altul')
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(culoare)
  const INP: React.CSSProperties = { fontSize: '12px', background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '9px 12px', color: '#BBB', outline: 'none', width: '100%' }

  const load = useCallback(async () => {
    const res = await fetch(`/api/chitante?lunaId=${encodeURIComponent(lunaId)}&section=${section}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDocs(data.docs || [])
    setLoaded(true)
  }, [lunaId, section])

  useState(() => { load() })

  async function upload(files: FileList) {
    setBusy(true); setError('')
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('firmaId', firmaId)
      fd.append('lunaId', lunaId)
      fd.append('section', section)
      fd.append('category', 'altul')
      fd.append('documentType', documentType)
      fd.append('supplier', supplier)
      const res = await fetch('/api/chitante', { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json().catch(()=>({})); setError(d.error || 'Eroare upload'); break }
    }
    await load()
    setBusy(false)
  }

  async function importLink() {
    if (!link) return
    setBusy(true); setError('')
    const res = await fetch('/api/chitante/import-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: link, firmaId, lunaId, section, supplier, documentType }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Importul nu a reușit')
    else { setLink(''); await load() }
    setBusy(false)
  }

  async function deleteDoc(doc: Doc) {
    if (!confirm(`Ștergi „${doc.fisier_nume}"?`)) return
    const res = await fetch(`/api/chitante/document?id=${encodeURIComponent(doc.id)}`, { method: 'DELETE' })
    if (res.ok) setDocs(prev => prev.filter(d => d.id !== doc.id))
    else setError('Documentul nu a putut fi șters')
  }

  return (
    <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid #1A1A1A' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#E0E0E0', marginBottom: '2px' }}>{title}</div>
        {description && <div style={{ fontSize: '11px', color: '#444' }}>{description}</div>}
      </div>

      <div style={{ padding: '18px 22px' }}>
        {/* Document list */}
        {loaded && docs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {docs.map(doc => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: '#161616', border: '1px solid #222', borderRadius: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: culoare, flexShrink: 0 }}/>
                <span style={{ flex: 1, fontSize: '12px', color: '#CCC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.fisier_nume}</span>
                {doc.tip_document && <span style={{ fontSize: '10px', color: '#444' }}>{doc.tip_document}</span>}
                <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize: '11px', fontWeight: 600, color: culoare }}>↓</a>
                <button onClick={() => deleteDoc(doc)} style={{ fontSize: '10px', color: '#F87171', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        )}
        {!loaded && <div style={{ fontSize: '12px', color: '#444', marginBottom: '12px' }}>Se încarcă...</div>}

        {/* Options row */}
        <div style={{ display: 'grid', gridTemplateColumns: supplier !== undefined ? '1fr' + (documentTypeOptions ? ' 1fr' : '') : '1fr', gap: '8px', marginBottom: '10px' }}>
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Furnizor / descriere (opțional)" style={INP}/>
          {documentTypeOptions && (
            <select value={documentType} onChange={e => setDocumentType(e.target.value)} style={INP}>
              {documentTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>

        {/* Link import */}
        {showLinkImport && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', marginBottom: '10px' }}>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder={linkPlaceholder || 'Link PDF (HTTPS)'} style={INP}/>
            <button onClick={importLink} disabled={busy || !link} style={{ padding: '9px 14px', border: 'none', borderRadius: '8px', background: culoare, color: '#FFF', cursor: 'pointer', fontSize: '12px', fontWeight: 600, opacity: busy || !link ? .5 : 1 }}>
              Import
            </button>
          </div>
        )}

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}
          style={{
            border: `1.5px dashed ${drag ? culoare : '#252525'}`,
            borderRadius: '10px', padding: '18px',
            textAlign: 'center', cursor: 'pointer',
            background: drag ? `rgba(${r},.04)` : '#0D0D0D',
            transition: 'all .15s',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#666', marginBottom: '3px' }}>
            {busy ? 'Se încarcă...' : 'Adaugă fișiere'}
          </div>
          <div style={{ fontSize: '11px', color: '#333' }}>PDF, JPG, PNG · drag & drop sau click</div>
        </div>
        <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => e.target.files && upload(e.target.files)}/>

        {error && <p style={{ fontSize: '11px', color: '#F87171', marginTop: '8px' }}>{error}</p>}
      </div>
    </div>
  )
}

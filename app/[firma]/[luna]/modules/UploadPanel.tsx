'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { legibil, tint } from '@/lib/colors'

interface Doc {
  id: string
  fisier_nume: string
  tip_document?: string
  furnizor?: string
  platit?: boolean
  data_platii?: string|null
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
  showPaidToggle?: boolean
}

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

export default function UploadPanel({
  firmaId, lunaId, section, culoare, title, description,
  showLinkImport = false, linkPlaceholder, documentTypeOptions, showPaidToggle = false,
}: Props) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [link, setLink] = useState('')
  const [supplier, setSupplier] = useState('')
  const [documentType, setDocumentType] = useState(documentTypeOptions?.[0]?.value || 'altul')
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(culoare)
  const INP: React.CSSProperties = { fontSize: '12px', background: 'var(--c-0f0f0f)', border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '9px 12px', color: 'var(--c-bbbbbb)', outline: 'none', width: '100%' }

  const load = useCallback(async () => {
    const res = await fetch(`/api/chitante?lunaId=${encodeURIComponent(lunaId)}&firmaId=${encodeURIComponent(firmaId)}&section=${section}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDocs(data.docs || [])
    setLoaded(true)
  }, [lunaId, firmaId, section])

  useEffect(() => { load() }, [load])

  async function upload(files: FileList) {
    setBusy(true); setError('')
    const documentTypeLabel = documentTypeOptions?.find(o => o.value === documentType)?.label || ''
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('firmaId', firmaId)
      fd.append('lunaId', lunaId)
      fd.append('section', section)
      fd.append('category', 'altul')
      fd.append('documentType', documentType)
      fd.append('documentTypeLabel', documentTypeLabel)
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

  async function savePdf() {
    setPdfBusy(true)
    try {
      const res = await fetch('/api/export/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lunaId, title, scope:{ section } }) })
      if (res.ok) { const b=await res.blob(); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`${title.replace(/[^a-zA-Z0-9]+/g,'_')}.pdf`; a.click(); URL.revokeObjectURL(u) }
      else { const e=await res.json().catch(()=>({error:'Eroare server'})); alert(e.error||'Eroare la generare PDF') }
    } catch(e) { alert('Eroare conexiune: '+String(e)) }
    setPdfBusy(false)
  }

  async function deleteDoc(doc: Doc) {
    if (!confirm(`Ștergi „${doc.fisier_nume}"?`)) return
    const res = await fetch(`/api/chitante/document?id=${encodeURIComponent(doc.id)}`, { method: 'DELETE' })
    if (res.ok) setDocs(prev => prev.filter(d => d.id !== doc.id))
    else { const d = await res.json().catch(() => ({})); setError(d.error || 'Documentul nu a putut fi șters') }
  }

  async function togglePaid(doc: Doc) {
    const next = !doc.platit
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, platit: next } : d))
    const res = await fetch('/api/chitante/plata', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: doc.id, platit: next }) })
    if (!res.ok) setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, platit: doc.platit } : d))
  }

  return (
    <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--c-1a1a1a)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-e0e0e0)', marginBottom: '2px' }}>{title}</div>
          {description && <div style={{ fontSize: '11px', color: 'var(--c-888888)' }}>{description}</div>}
        </div>
        {loaded && docs.length > 0 && (
          <button onClick={savePdf} disabled={pdfBusy} style={{ flexShrink:0, fontSize:'11px', fontWeight:600, padding:'6px 12px', borderRadius:'7px', border:`1px solid ${culoare}`, background:'transparent', color:legibil(culoare), cursor:'pointer', opacity:pdfBusy?.6:1 }}>
            {pdfBusy ? '...' : '↓ PDF'}
          </button>
        )}
      </div>

      <div style={{ padding: '18px 22px' }}>
        {/* Document list */}
        {loaded && docs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {(showPaidToggle ? [...docs].sort((a, b) => Number(!!a.platit) - Number(!!b.platit)) : docs).map(doc => {
              const isPaid = showPaidToggle && !!doc.platit
              return (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: isPaid ? 'var(--c-141414)' : 'var(--c-161616)', border: `1px solid ${isPaid ? 'var(--c-1e1e1e)' : 'var(--c-222222)'}`, borderRadius: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isPaid ? 'var(--c-333333)' : culoare, flexShrink: 0 }}/>
                  <span style={{ flex: 1, fontSize: '12px', color: isPaid ? 'var(--c-666666)' : 'var(--c-cccccc)', textDecoration: isPaid ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.fisier_nume}</span>
                  {doc.tip_document && <span style={{ fontSize: '10px', color: 'var(--c-888888)' }}>{doc.tip_document}</span>}
                  {showPaidToggle && (
                    <button onClick={() => togglePaid(doc)} style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', border: `1px solid ${isPaid ? 'var(--c-2a2a2a)' : 'light-dark(rgba(5,150,105,.525), rgba(110,231,176,.35))'}`, background: isPaid ? 'var(--c-1a1a1a)' : 'light-dark(rgba(5,150,105,.2), rgba(110,231,176,.08))', color: isPaid ? 'var(--c-888888)' : 'var(--accent-mint)', cursor: 'pointer', flexShrink: 0 }}>
                      {isPaid ? 'Anulează' : 'Marchează achitat'}
                    </button>
                  )}
                  <a href={`/api/chitante/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize: '11px', fontWeight: 600, color: legibil(culoare) }}>↓</a>
                  <button onClick={() => deleteDoc(doc)} style={{ fontSize: '10px', color: 'var(--accent-red)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              )
            })}
          </div>
        )}
        {!loaded && <div style={{ fontSize: '12px', color: 'var(--c-999999)', marginBottom: '12px' }}>Se încarcă...</div>}

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
            <button onClick={importLink} disabled={busy || !link} style={{ padding: '9px 14px', border: 'none', borderRadius: '8px', background: culoare, color: 'var(--c-ffffff)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, opacity: busy || !link ? .5 : 1 }}>
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
            border: `1.5px dashed ${drag ? culoare : 'var(--c-252525)'}`,
            borderRadius: '10px', padding: '18px',
            textAlign: 'center', cursor: 'pointer',
            background: drag ? `${tint(r,.04)}` : 'var(--c-0d0d0d)',
            transition: 'all .15s',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-666666)', marginBottom: '3px' }}>
            {busy ? 'Se încarcă...' : 'Adaugă fișiere'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--c-888888)' }}>PDF, JPG, PNG · drag & drop sau click</div>
        </div>
        <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => e.target.files && upload(e.target.files)}/>

        {error && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '8px' }}>{error}</p>}
      </div>
    </div>
  )
}

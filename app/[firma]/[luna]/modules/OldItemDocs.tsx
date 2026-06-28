'use client'
import { useState, useCallback, useRef } from 'react'
import { legibil } from '@/lib/colors'

export interface ChecklistItem {
  id: string
  completat: boolean
  checklist_templates?: { titlu: string; descriere?: string; modul: string; ordine: number }
}

interface OldDoc { id: string; fisier_nume: string; tip_document?: string }

interface Props {
  item: ChecklistItem
  firmaId: string
  lunaId: string
  culoare: string
}

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

export default function OldItemDocs({ item, firmaId, lunaId, culoare }: Props) {
  const [open, setOpen] = useState(false)
  const [docs, setDocs] = useState<OldDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const r = rgb(culoare)
  const t = item.checklist_templates

  const loadDocs = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/checklist/docs?itemId=${item.id}`)
    if (res.ok) { const d = await res.json(); setDocs(d.docs || []) }
    setLoading(false)
  }, [item.id])

  async function toggle() { if (!open) await loadDocs(); setOpen(v => !v) }

  async function upload(files: FileList) {
    setUploading(true); setError('')
    for (const f of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', f); fd.append('itemId', item.id)
      fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
      fd.append('tip', 'factura'); fd.append('desc', t?.titlu || '')
      const res = await fetch('/api/checklist/upload', { method: 'POST', body: fd })
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Eroare upload'); break }
    }
    await loadDocs(); setUploading(false)
  }

  async function deleteDoc(id: string) {
    const res = await fetch('/api/checklist/docs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: item.id, ids: [id] }) })
    if (res.ok) setDocs(prev => prev.filter(d => d.id !== id))
  }

  return (
    <div style={{ background: '#111', border: `1px solid ${open ? `rgba(${r},.25)` : '#1E1E1E'}`, borderRadius: '10px', overflow: 'hidden' }}>
      <button onClick={toggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: docs.length > 0 ? '#6EE7B0' : '#2A2A2A' }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#E0E0E0' }}>{t?.titlu}</div>
          {t?.descriere && <div style={{ fontSize: '11px', color: '#777', marginTop: '2px' }}>{t.descriere}</div>}
        </div>
        {docs.length > 0 && <span style={{ fontSize: '11px', fontWeight: 600, color: '#6EE7B0', flexShrink: 0 }}>{docs.length} doc{docs.length > 1 ? 'umente' : ''}</span>}
        <svg width="14" height="14" fill="none" stroke="#555" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {open && (
        <div style={{ padding: '0 18px 16px', borderTop: '1px solid #1A1A1A' }}>
          {loading && <p style={{ fontSize: '12px', color: '#777', padding: '12px 0 4px' }}>Se încarcă...</p>}
          {docs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '12px 0 10px' }}>
              {docs.map(doc => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#161616', borderRadius: '7px' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: culoare, flexShrink: 0 }}/>
                  <span style={{ flex: 1, fontSize: '12px', color: '#CCC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.fisier_nume}</span>
                  <a href={`/api/checklist/docs?docId=${encodeURIComponent(doc.id)}`} style={{ fontSize: '11px', fontWeight: 600, color: legibil(culoare) }}>↓</a>
                  <button onClick={() => deleteDoc(doc.id)} style={{ fontSize: '11px', color: '#F87171', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div onClick={() => fileRef.current?.click()} onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); e.dataTransfer.files.length && upload(e.dataTransfer.files) }}
            style={{ border: `1.5px dashed ${drag ? culoare : '#252525'}`, borderRadius: '8px', padding: '14px', textAlign: 'center', cursor: 'pointer', background: drag ? `rgba(${r},.04)` : '#0D0D0D', marginTop: docs.length > 0 ? '4px' : '12px' }}>
            <p style={{ fontSize: '12px', color: uploading ? '#777' : '#888', fontWeight: 600 }}>{uploading ? 'Se încarcă...' : '+ Adaugă document'}</p>
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => e.target.files && upload(e.target.files)}/>
          {error && <p style={{ fontSize: '11px', color: '#F87171', marginTop: '6px' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

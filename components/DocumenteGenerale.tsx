'use client'
import { useEffect, useRef, useState } from 'react'

type Doc = { id: string; fisier_nume: string; fisier_tip: string; fisier_marime: number; created_at: string }

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumenteGenerale() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/documente-generale')
    const data = await res.json()
    setDocs(data.docs || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleUpload = async (file: File) => {
    setUploading(true)
    const fd = new FormData()
    fd.set('file', file)
    const res = await fetch('/api/documente-generale', { method: 'POST', body: fd })
    setUploading(false)
    if (!res.ok) { const e = await res.json(); alert('Eroare: ' + e.error); return }
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ștergi acest document?')) return
    const res = await fetch('/api/documente-generale', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (!res.ok) { const e = await res.json(); alert('Eroare: ' + e.error); return }
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  return (
    <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: '16px', padding: '24px 28px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#EFEFEF', letterSpacing: '-0.2px' }}>Documente generale</div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Fișiere care nu țin de o firmă anume</div>
        </div>
        <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
        <button onClick={() => inputRef.current?.click()} disabled={uploading} style={{
          fontSize: '12px', fontWeight: 600, color: '#DDD', padding: '7px 16px', borderRadius: '8px',
          border: '1px solid #2A2A2A', background: '#1A1A1A', cursor: uploading ? 'not-allowed' : 'pointer',
        }}>
          {uploading ? 'Se încarcă...' : '+ Adaugă document'}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: '12px', color: '#666' }}>Se încarcă...</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#666' }}>Niciun document general încă</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {docs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', background: '#161616', border: '1px solid #222' }}>
              <span style={{ flex: 1, fontSize: '13px', color: '#CCC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fisier_nume}</span>
              <span style={{ fontSize: '11px', color: '#666', flexShrink: 0 }}>{formatSize(d.fisier_marime)}</span>
              <a href={`/api/documente-generale?download=${d.id}`} style={{ fontSize: '12px', fontWeight: 600, color: '#9DB9F6', flexShrink: 0 }}>↓</a>
              <button onClick={() => handleDelete(d.id)} style={{ fontSize: '12px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

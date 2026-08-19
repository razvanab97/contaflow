'use client'
import { useEffect, useRef, useState } from 'react'

type Doc = { id: string; fisier_nume: string; fisier_tip: string; fisier_marime: number; created_at: string }

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isPreviewable(tip: string, nume: string): 'pdf' | 'image' | null {
  if (tip === 'application/pdf' || nume.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (tip?.startsWith('image/')) return 'image'
  return null
}

export default function DocumenteGenerale() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  function togglePreview(id: string) {
    setPreviewIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/documente-generale')
      const data = await res.json()
      setDocs(data.docs || [])
    } catch (e) {
      console.error('Eroare la încărcarea documentelor generale:', e)
      setDocs([])
    } finally {
      setLoading(false)
    }
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

  const handleRename = async (id: string, fisier_nume: string) => {
    if (!fisier_nume.trim()) return
    setDocs(prev => prev.map(d => d.id === id ? { ...d, fisier_nume } : d))
    await fetch('/api/documente/rename', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, fisier_nume }) })
  }

  return (
    <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '16px', padding: '24px 28px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--c-efefef)', letterSpacing: '-0.2px' }}>Documente generale</div>
          <div style={{ fontSize: '12px', color: 'var(--c-888888)', marginTop: '2px' }}>Fișiere care nu țin de o firmă anume</div>
        </div>
        <input ref={inputRef} type="file" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
        <button onClick={() => inputRef.current?.click()} disabled={uploading} style={{
          fontSize: '12px', fontWeight: 600, color: 'var(--c-dddddd)', padding: '7px 16px', borderRadius: '8px',
          border: '1px solid var(--c-2a2a2a)', background: 'var(--c-1a1a1a)', cursor: uploading ? 'not-allowed' : 'pointer',
        }}>
          {uploading ? 'Se încarcă...' : '+ Adaugă document'}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: '12px', color: 'var(--c-666666)' }}>Se încarcă...</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--c-666666)' }}>Niciun document general încă</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {docs.map(d => {
            const kind = isPreviewable(d.fisier_tip, d.fisier_nume)
            const open = previewIds.has(d.id)
            return (
              <div key={d.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', background: 'var(--c-161616)', border: '1px solid var(--c-222222)' }}>
                  <input
                    defaultValue={d.fisier_nume}
                    onBlur={e => handleRename(d.id, e.target.value.trim())}
                    style={{ flex: 1, minWidth: 0, fontSize: '13px', color: 'var(--c-cccccc)', background: 'transparent', border: 'none', outline: 'none', padding: 0 }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--c-666666)', flexShrink: 0 }}>{formatSize(d.fisier_marime)}</span>
                  {kind && <button onClick={() => togglePreview(d.id)} style={{ fontSize: '12px', fontWeight: 600, color: open ? 'var(--c-dddddd)' : 'var(--accent-mint)', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>{open ? 'Ascunde' : 'Vezi'}</button>}
                  <a href={`/api/documente-generale?download=${d.id}`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)', flexShrink: 0 }}>↓</a>
                  <button onClick={() => handleDelete(d.id)} style={{ fontSize: '12px', color: 'var(--c-888888)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
                {open && kind === 'pdf' && (
                  <iframe src={`/api/documente-generale?download=${d.id}&preview=1`} style={{ width: '100%', height: '65vh', border: '1px solid var(--c-222222)', borderRadius: '8px', marginTop: '6px', background: 'var(--c-ffffff)' }} />
                )}
                {open && kind === 'image' && (
                  <img src={`/api/documente-generale?download=${d.id}&preview=1`} alt={d.fisier_nume} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', border: '1px solid var(--c-222222)', borderRadius: '8px', marginTop: '6px', background: 'var(--c-ffffff)' }} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

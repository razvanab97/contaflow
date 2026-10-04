'use client'
import { deschideDocument } from '@/lib/vizualizare'
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
    // Vezi -> vizualizatorul pop-up global (rapid, direct din storage)
    deschideDocument(`/api/documente-generale?download=${id}`)
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
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)' }}>Documente generale</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px' }}>Fișiere care nu țin de o firmă anume</div>
        </div>
        <input ref={inputRef} type="file" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
        <button onClick={() => inputRef.current?.click()} disabled={uploading} className="btn" style={{ flexShrink: 0 }}>
          {uploading ? 'Se încarcă...' : '+ Adaugă document'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{[0, 1].map(i => <div key={i} className="skeleton" style={{ height: '38px' }} />)}</div>
      ) : docs.length === 0 ? (
        <div className="empty-state" style={{ padding: '20px 16px' }}><strong>Niciun document general încă</strong><span style={{ fontSize: 'var(--fs-sm)' }}>Adaugă contracte, acte sau alte fișiere comune tuturor firmelor.</span></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {docs.map(d => {
            const kind = isPreviewable(d.fisier_tip, d.fisier_nume)
            const open = previewIds.has(d.id)
            return (
              <div key={d.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 6px 6px 12px', borderRadius: 'var(--r-md)', background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                  <input
                    defaultValue={d.fisier_nume}
                    onBlur={e => handleRename(d.id, e.target.value.trim())}
                    title="Click pentru a redenumi"
                    style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-md)', color: 'var(--text-primary)', background: 'transparent', border: 'none', outline: 'none', padding: 0 }}
                  />
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{formatSize(d.fisier_marime)}</span>
                  {kind && <button onClick={() => togglePreview(d.id)} className="btn btn-sm btn-ghost" style={{ color: open ? 'var(--text-primary)' : 'var(--accent)' }}>{open ? 'Ascunde' : 'Vezi'}</button>}
                  <a href={`/api/documente-generale?download=${d.id}`} className="btn btn-sm btn-ghost btn-icon" title="Descarcă" aria-label={`Descarcă ${d.fisier_nume}`}>↓</a>
                  <button onClick={() => handleDelete(d.id)} className="btn btn-sm btn-ghost btn-icon" title="Șterge" aria-label={`Șterge ${d.fisier_nume}`}>✕</button>
                </div>
                {open && kind === 'pdf' && (
                  <iframe src={`/api/documente-generale?download=${d.id}&preview=1`} style={{ width: '100%', height: '65vh', border: '1px solid var(--c-222222)', borderRadius: 'var(--r-md)', marginTop: '6px', background: 'var(--c-ffffff)' }} />
                )}
                {open && kind === 'image' && (
                  <img src={`/api/documente-generale?download=${d.id}&preview=1`} alt={d.fisier_nume} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', border: '1px solid var(--c-222222)', borderRadius: 'var(--r-md)', marginTop: '6px', background: 'var(--c-ffffff)' }} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

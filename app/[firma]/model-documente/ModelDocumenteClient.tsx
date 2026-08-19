'use client'
import { useEffect, useRef, useState } from 'react'

interface ModelDoc {
  id: string; sectiune: string; fisier_nume: string; fisier_tip: string | null; fisier_marime: number | null; created_at: string
}

const SECTIUNI: { key: string; titlu: string; hint: string; accept: string }[] = [
  { key: 'raport_lunar', titlu: 'Raport lunar', hint: 'Word + PDF', accept: '.doc,.docx,application/pdf' },
  { key: 'stat_plata_angajati', titlu: 'Stat plată angajați', hint: 'PDF-uri + Excel', accept: '.xls,.xlsx,application/pdf' },
  { key: 'acte_contabile', titlu: 'Acte contabile', hint: 'orice document', accept: '' },
]

const hiddenInputStyle: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }

function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isPreviewable(tip: string | null, nume: string) {
  if (tip === 'application/pdf' || nume.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (tip?.startsWith('image/')) return 'image'
  return null
}

export default function ModelDocumenteClient({ firmaId }: { firmaId: string }) {
  const [fisiere, setFisiere] = useState<Record<string, ModelDoc[]>>({})
  const [notite, setNotite] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function togglePreview(id: string) {
    setPreviewIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function load() {
    fetch(`/api/model-documente?firmaId=${encodeURIComponent(firmaId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        const bySectiune: Record<string, ModelDoc[]> = {}
        for (const d of data.fisiere || []) {
          if (!bySectiune[d.sectiune]) bySectiune[d.sectiune] = []
          bySectiune[d.sectiune].push(d)
        }
        setFisiere(bySectiune)
        setNotite(data.notite || {})
        setLoading(false)
      }).catch(() => { setError('Eroare la încărcare'); setLoading(false) })
  }

  useEffect(() => { load() }, [firmaId])

  async function uploadFiles(sectiune: string, files: FileList) {
    setUploading(u => ({ ...u, [sectiune]: true }))
    const uploaded: ModelDoc[] = []
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('firmaId', firmaId)
      fd.append('sectiune', sectiune)
      const res = await fetch('/api/model-documente', { method: 'POST', body: fd })
      if (res.ok) uploaded.push(await res.json())
    }
    setUploading(u => ({ ...u, [sectiune]: false }))
    load()
    // deschide automat previzualizarea fiecărui fișier încărcat acum, ca sa vezi imediat cum arată —
    // se adaugă la cele deja deschise, nu le înlocuiește
    const newlyPreviewable = uploaded.filter(d => isPreviewable(d.fisier_tip, d.fisier_nume))
    if (newlyPreviewable.length) {
      setPreviewIds(prev => {
        const next = new Set(prev)
        for (const d of newlyPreviewable) next.add(d.id)
        return next
      })
    }
  }

  async function deleteFile(id: string, sectiune: string) {
    if (!confirm('Ștergi acest document?')) return
    setFisiere(f => ({ ...f, [sectiune]: (f[sectiune] || []).filter(d => d.id !== id) }))
    setPreviewIds(prev => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next })
    await fetch(`/api/model-documente?id=${id}`, { method: 'DELETE' })
  }

  async function renameFile(id: string, sectiune: string, fisier_nume: string) {
    setFisiere(f => ({ ...f, [sectiune]: (f[sectiune] || []).map(d => d.id === id ? { ...d, fisier_nume } : d) }))
    await fetch('/api/model-documente', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, fisier_nume }) })
  }

  async function saveNotite(sectiune: string, continut: string) {
    await fetch('/api/model-documente/notite', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, sectiune, continut }) })
  }

  if (loading) return <div style={{ color: 'var(--c-555555)', fontSize: '14px', padding: '32px 0' }}>Se încarcă...</div>
  if (error) return <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '24px 0' }}>{error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {SECTIUNI.map(s => {
        const docs = fisiere[s.key] || []
        return (
          <div key={s.key} style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em' }}>{s.titlu}</span>
              <button onClick={() => inputRefs.current[s.key]?.click()} disabled={!!uploading[s.key]} style={{
                fontSize: '12px', fontWeight: 600, color: 'var(--accent-mint)', background: 'transparent', border: 'none', cursor: 'pointer',
              }}>{uploading[s.key] ? 'Se încarcă...' : '+ Adaugă fișier'}</button>
              <input
                ref={el => { inputRefs.current[s.key] = el }}
                type="file" multiple accept={s.accept || undefined} style={hiddenInputStyle}
                onChange={e => e.target.files?.length && uploadFiles(s.key, e.target.files)}
              />
            </div>
            <p style={{ fontSize: '12px', color: 'var(--c-555555)', marginBottom: '14px' }}>{s.hint}</p>

            {docs.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--c-555555)', padding: '4px 0 8px' }}>Niciun fișier încărcat încă.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {docs.map(d => {
                  const kind = isPreviewable(d.fisier_tip, d.fisier_nume)
                  const open = previewIds.has(d.id)
                  return (
                    <div key={d.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--c-161616)', border: '1px solid var(--c-262626)', borderRadius: '8px', padding: '8px 12px' }}>
                        <input
                          defaultValue={d.fisier_nume}
                          onBlur={e => e.target.value.trim() && e.target.value !== d.fisier_nume && renameFile(d.id, s.key, e.target.value.trim())}
                          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: 'var(--c-dddddd)', minWidth: 0 }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--c-555555)', flexShrink: 0 }}>{fmtSize(d.fisier_marime)}</span>
                        {kind && (
                          <button onClick={() => togglePreview(d.id)} style={{
                            fontSize: '12px', fontWeight: 600, color: open ? 'var(--c-dddddd)' : 'var(--accent-mint)',
                            background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0,
                          }}>{open ? 'Ascunde' : 'Previzualizează'}</button>
                        )}
                        <a href={`/api/model-documente/download?id=${d.id}`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)', textDecoration: 'none', flexShrink: 0 }}>Descarcă</a>
                        <button onClick={() => deleteFile(d.id, s.key)} title="Șterge" style={{
                          width: '24px', height: '24px', flexShrink: 0, background: 'var(--c-1a1a1a)', border: '1px solid var(--c-2a2a2a)',
                          borderRadius: '6px', cursor: 'pointer', color: 'var(--accent-red)', fontSize: '13px', lineHeight: 1,
                        }}>×</button>
                      </div>
                      {open && kind === 'pdf' && (
                        <iframe src={`/api/model-documente/download?id=${d.id}&preview=1`} style={{ width: '100%', height: '70vh', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '8px', background: 'var(--c-ffffff)' }} />
                      )}
                      {open && kind === 'image' && (
                        <img src={`/api/model-documente/download?id=${d.id}&preview=1`} alt={d.fisier_nume} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '8px', background: 'var(--c-ffffff)' }} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ marginTop: docs.length === 0 ? '4px' : '14px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', display: 'block', marginBottom: '8px' }}>Notițe generale</span>
              <textarea
                defaultValue={notite[s.key] || ''}
                onBlur={e => e.target.value !== (notite[s.key] || '') && saveNotite(s.key, e.target.value)}
                placeholder="Informații generale..."
                rows={4}
                style={{ width: '100%', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: 'var(--c-dddddd)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

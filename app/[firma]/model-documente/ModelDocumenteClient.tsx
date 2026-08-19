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

export default function ModelDocumenteClient({ firmaId }: { firmaId: string }) {
  const [fisiere, setFisiere] = useState<Record<string, ModelDoc[]>>({})
  const [notite, setNotite] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

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
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('firmaId', firmaId)
      fd.append('sectiune', sectiune)
      await fetch('/api/model-documente', { method: 'POST', body: fd })
    }
    setUploading(u => ({ ...u, [sectiune]: false }))
    load()
  }

  async function deleteFile(id: string, sectiune: string) {
    if (!confirm('Ștergi acest document?')) return
    setFisiere(f => ({ ...f, [sectiune]: (f[sectiune] || []).filter(d => d.id !== id) }))
    await fetch(`/api/model-documente?id=${id}`, { method: 'DELETE' })
  }

  async function renameFile(id: string, sectiune: string, fisier_nume: string) {
    setFisiere(f => ({ ...f, [sectiune]: (f[sectiune] || []).map(d => d.id === id ? { ...d, fisier_nume } : d) }))
    await fetch('/api/model-documente', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, fisier_nume }) })
  }

  async function saveNotite(sectiune: string, continut: string) {
    await fetch('/api/model-documente/notite', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, sectiune, continut }) })
  }

  if (loading) return <div style={{ color: '#555', fontSize: '14px', padding: '32px 0' }}>Se încarcă...</div>
  if (error) return <div style={{ color: '#F87171', fontSize: '13px', padding: '24px 0' }}>{error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {SECTIUNI.map(s => {
        const docs = fisiere[s.key] || []
        return (
          <div key={s.key} style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: '12px', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: '.1em' }}>{s.titlu}</span>
              <button onClick={() => inputRefs.current[s.key]?.click()} disabled={!!uploading[s.key]} style={{
                fontSize: '12px', fontWeight: 600, color: '#6EE7B0', background: 'transparent', border: 'none', cursor: 'pointer',
              }}>{uploading[s.key] ? 'Se încarcă...' : '+ Adaugă fișier'}</button>
              <input
                ref={el => { inputRefs.current[s.key] = el }}
                type="file" multiple accept={s.accept || undefined} style={hiddenInputStyle}
                onChange={e => e.target.files?.length && uploadFiles(s.key, e.target.files)}
              />
            </div>
            <p style={{ fontSize: '12px', color: '#555', marginBottom: '14px' }}>{s.hint}</p>

            {docs.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#555', padding: '4px 0 8px' }}>Niciun fișier încărcat încă.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: s.key === 'stat_plata_angajati' ? '16px' : 0 }}>
                {docs.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#161616', border: '1px solid #262626', borderRadius: '8px', padding: '8px 12px' }}>
                    <input
                      defaultValue={d.fisier_nume}
                      onBlur={e => e.target.value.trim() && e.target.value !== d.fisier_nume && renameFile(d.id, s.key, e.target.value.trim())}
                      style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: '#DDD', minWidth: 0 }}
                    />
                    <span style={{ fontSize: '11px', color: '#555', flexShrink: 0 }}>{fmtSize(d.fisier_marime)}</span>
                    <a href={`/api/model-documente/download?id=${d.id}`} style={{ fontSize: '12px', fontWeight: 600, color: '#60A5FA', textDecoration: 'none', flexShrink: 0 }}>Descarcă</a>
                    <button onClick={() => deleteFile(d.id, s.key)} title="Șterge" style={{
                      width: '24px', height: '24px', flexShrink: 0, background: '#1A1A1A', border: '1px solid #2A2A2A',
                      borderRadius: '6px', cursor: 'pointer', color: '#F87171', fontSize: '13px', lineHeight: 1,
                    }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {s.key === 'stat_plata_angajati' && (
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: '.1em', display: 'block', marginBottom: '8px' }}>Notițe generale</span>
                <textarea
                  defaultValue={notite[s.key] || ''}
                  onBlur={e => e.target.value !== (notite[s.key] || '') && saveNotite(s.key, e.target.value)}
                  placeholder="Informații generale despre statele de plată..."
                  rows={4}
                  style={{ width: '100%', background: '#0D0D0D', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#DDD', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

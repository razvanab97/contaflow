'use client'
import { useRef, useState } from 'react'
import { tint } from '@/lib/colors'

export default function DocumentUpload({ mode, txId, firmaId, lunaId, tip, furnizor, numDoc, addFurnizor, addSuma, onSuccess, culoare, compact }: {
  mode: 'main'|'add'
  txId: string; firmaId: string; lunaId: string
  tip?: string; furnizor?: string; numDoc?: string
  addFurnizor?: string; addSuma?: string
  onSuccess: () => void
  culoare: string
  compact?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const r = `${parseInt(culoare.slice(1,3),16)},${parseInt(culoare.slice(3,5),16)},${parseInt(culoare.slice(5,7),16)}`

  async function upload(files: FileList) {
    if (!files.length) return
    setUploading(true); setError('')
    const fd = new FormData()
    Array.from(files).forEach(file => fd.append('file', file))
    fd.append('txId', txId); fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
    if (mode === 'main') {
      fd.append('tip', tip || 'factura'); fd.append('furnizor', furnizor || ''); fd.append('numDoc', numDoc || '')
    } else {
      fd.append('tip', 'factura'); fd.append('mode', 'add')
      if (addFurnizor) fd.append('furnizor', addFurnizor)
      if (addSuma) fd.append('suma', addSuma)
    }
    const res = await fetch('/api/tranzactii/doc', { method:'POST', body:fd })
    setUploading(false)
    if (res.ok) { onSuccess(); return }
    const data = await res.json().catch(() => ({}))
    setError(data.error || 'Documentul nu a putut fi asociat')
  }

  return (
    <div>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); e.dataTransfer.files.length && upload(e.dataTransfer.files) }}
        style={{
          border:`1.5px dashed ${drag ? culoare : 'var(--border)'}`, borderRadius:'10px',
          padding: compact ? '14px' : '24px', textAlign:'center', cursor:'pointer',
          background: drag ? tint(r,.06) : 'var(--surface-secondary)', transition:'all .15s',
        }}
      >
        {uploading ? (
          <p style={{ fontSize:'12px', color:'var(--text-muted)' }}>Se încarcă...</p>
        ) : compact ? (
          <p style={{ fontSize:'12px', fontWeight:600, color:'var(--text-secondary)' }}>sau adaugă fișiere</p>
        ) : (
          <div>
            <svg width="18" height="18" fill="none" stroke={culoare} strokeWidth="2.5" viewBox="0 0 24 24" style={{ margin:'0 auto 8px' }}><path d="M12 4v16m8-8H4"/></svg>
            <p style={{ fontSize:'12px', fontWeight:600, color:'var(--text-secondary)', marginBottom:'4px' }}>Încarcă document (PDF / JPG / PNG)</p>
            <p style={{ fontSize:'10px', color:'var(--text-muted)' }}>drag &amp; drop sau click — poți selecta mai multe fișiere</p>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple
        style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }}
        onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }} />
      {error && <p style={{ fontSize:'11px', color:'var(--danger)', marginTop:'8px' }}>{error}</p>}
    </div>
  )
}

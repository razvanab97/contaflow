'use client'
import { useEffect, useRef, useState } from 'react'

interface Factura {
  id: string; fisier_nume: string; fisier_tip: string | null
  furnizor: string | null; numar_document: string | null; suma: number | null; data_factura: string | null
  status: 'asteptare' | 'asociata'; tranzactie_id: string | null; created_at: string
}

const hiddenInputStyle: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }

function isPreviewable(tip: string | null, nume: string) {
  if (tip === 'application/pdf' || nume.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (tip?.startsWith('image/')) return 'image'
  return null
}
function fmtData(s: string | null) {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return y && m && d ? `${d}.${m}.${y}` : s
}

export default function FacturiAsteptateClient({ firmaId }: { firmaId: string }) {
  const [facturi, setFacturi] = useState<Factura[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  function load() {
    fetch(`/api/facturi-asteptate?firmaId=${encodeURIComponent(firmaId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        setFacturi(data.facturi || [])
        setLoading(false)
      }).catch(() => { setError('Eroare la încărcare'); setLoading(false) })
  }

  useEffect(() => { load() }, [firmaId])

  async function uploadFiles(files: FileList) {
    setUploading(true); setError('')
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('firmaId', firmaId)
      const res = await fetch('/api/facturi-asteptate', { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Eroare upload'); break }
    }
    setUploading(false)
    load()
  }

  async function deleteFactura(id: string) {
    if (!confirm('Ștergi această factură?')) return
    setFacturi(prev => prev.filter(f => f.id !== id))
    await fetch(`/api/facturi-asteptate?id=${id}`, { method: 'DELETE' })
  }

  async function patchFactura(id: string, patch: Partial<Pick<Factura, 'fisier_nume' | 'furnizor' | 'numar_document' | 'suma' | 'data_factura'>>) {
    setFacturi(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
    await fetch('/api/facturi-asteptate', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
  }

  function togglePreview(id: string) {
    setPreviewIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  if (loading) return <div style={{ color: 'var(--c-555555)', fontSize: '14px', padding: '32px 0' }}>Se încarcă...</div>
  if (error && !facturi.length) return <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '24px 0' }}>{error}</div>

  const asteptare = facturi.filter(f => f.status === 'asteptare')
  const asociate = facturi.filter(f => f.status === 'asociata')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files) }}
          style={{ border: `1.5px dashed ${drag ? 'var(--c-555555)' : 'var(--c-2a2a2a)'}`, borderRadius: '10px', padding: '20px', textAlign: 'center', cursor: 'pointer', background: 'var(--c-0d0d0d)' }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-888888)' }}>
            {uploading ? 'AI citește factura...' : '+ Adaugă factură plătită'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--c-666666)', marginTop: '3px' }}>PDF, JPG, PNG · furnizorul, suma și data se citesc automat</div>
        </div>
        <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={hiddenInputStyle} onChange={e => e.target.files?.length && uploadFiles(e.target.files)}/>
        {error && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '8px' }}>{error}</p>}
      </div>

      <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>
          În așteptare ({asteptare.length})
        </div>
        <p style={{ fontSize: '12px', color: 'var(--c-666666)', marginBottom: '14px' }}>Se sugerează automat la tranzacția potrivită din extras, după sumă și data la care ai încărcat factura (se presupune că ai plătit-o atunci) — max. 3 zile diferență față de tranzacția bancară.</p>

        {asteptare.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--c-555555)', padding: '4px 0' }}>Nicio factură în așteptare.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {asteptare.map(f => {
              const kind = isPreviewable(f.fisier_tip, f.fisier_nume)
              const open = previewIds.has(f.id)
              return (
                <div key={f.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: 'var(--c-161616)', border: '1px solid var(--c-262626)', borderRadius: '8px', padding: '10px 12px' }}>
                    <input
                      defaultValue={f.fisier_nume}
                      onBlur={e => e.target.value.trim() && e.target.value !== f.fisier_nume && patchFactura(f.id, { fisier_nume: e.target.value.trim() })}
                      style={{ flex: '1 1 160px', minWidth: 0, fontSize: '12px', color: 'var(--c-dddddd)', background: 'transparent', border: 'none', outline: 'none', padding: 0 }}
                    />
                    <input
                      defaultValue={f.furnizor || ''}
                      placeholder="furnizor"
                      onBlur={e => e.target.value.trim() !== (f.furnizor || '') && patchFactura(f.id, { furnizor: e.target.value.trim() })}
                      style={{ width: '120px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                    />
                    <input
                      defaultValue={f.numar_document || ''}
                      placeholder="serie + număr"
                      title="Seria și numărul facturii — citite de AI, ca să poți identifica factura și după acestea"
                      onBlur={e => e.target.value.trim() !== (f.numar_document || '') && patchFactura(f.id, { numar_document: e.target.value.trim() })}
                      style={{ width: '110px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                    />
                    <input
                      type="number" step="0.01"
                      defaultValue={f.suma ?? ''}
                      placeholder="sumă"
                      onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== f.suma) patchFactura(f.id, { suma: v }) }}
                      style={{ width: '80px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                    />
                    <input
                      type="date"
                      title="Data emiterii facturii — doar informativ, nu contează la asociere (se folosește data la care a fost încărcată)"
                      defaultValue={f.data_factura || ''}
                      onBlur={e => { const v = e.target.value || null; if (v !== f.data_factura) patchFactura(f.id, { data_factura: v }) }}
                      style={{ width: '130px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                    />
                    {kind && (
                      <button onClick={() => togglePreview(f.id)} style={{ fontSize: '11px', fontWeight: 600, color: open ? 'var(--c-dddddd)' : 'var(--accent-mint)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                        {open ? 'Ascunde' : 'Vezi'}
                      </button>
                    )}
                    <a href={`/api/facturi-asteptate/download?id=${f.id}`} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-blue)', textDecoration: 'none' }}>↓</a>
                    <button onClick={() => deleteFactura(f.id)} style={{ width: '22px', height: '22px', flexShrink: 0, background: 'var(--c-1a1a1a)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', cursor: 'pointer', color: 'var(--accent-red)', fontSize: '12px', lineHeight: 1 }}>×</button>
                  </div>
                  {open && kind === 'pdf' && (
                    <iframe src={`/api/facturi-asteptate/download?id=${f.id}&preview=1`} style={{ width: '100%', height: '65vh', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '8px', background: 'var(--c-ffffff)' }} />
                  )}
                  {open && kind === 'image' && (
                    <img src={`/api/facturi-asteptate/download?id=${f.id}&preview=1`} alt={f.fisier_nume} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '8px', background: 'var(--c-ffffff)' }} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {asociate.length > 0 && (
        <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '14px' }}>
            Deja asociate ({asociate.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {asociate.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-1a1a1a)', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-mint)', flexShrink: 0 }}>✓</span>
                <span style={{ flex: 1, fontSize: '12px', color: 'var(--c-777777)', textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.furnizor || f.fisier_nume}</span>
                {f.suma != null && <span style={{ fontSize: '11px', color: 'var(--c-666666)' }}>{f.suma.toFixed(2)} RON</span>}
                {f.data_factura && <span style={{ fontSize: '11px', color: 'var(--c-666666)' }}>{fmtData(f.data_factura)}</span>}
                <button onClick={() => deleteFactura(f.id)} style={{ fontSize: '10px', color: 'var(--c-555555)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

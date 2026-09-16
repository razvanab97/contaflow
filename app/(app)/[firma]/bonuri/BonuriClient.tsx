'use client'
import { useEffect, useRef, useState } from 'react'

interface Bon {
  id: string; fisier_nume: string; fisier_tip: string | null
  tip: 'combustibil' | 'altul'
  comerciant: string | null; cui_client: string | null; suma: number | null; data_bon: string | null
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
function norm(v: string | null | undefined) {
  return String(v || '').replace(/^RO/i, '').replace(/\D/g, '')
}

export default function BonuriClient({ firmaId, firmaCui }: { firmaId: string; firmaCui?: string | null }) {
  const [bonuri, setBonuri] = useState<Bon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [previewIds, setPreviewIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  function load() {
    fetch(`/api/bonuri?firmaId=${encodeURIComponent(firmaId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        setBonuri(data.bonuri || [])
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
      const res = await fetch('/api/bonuri', { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Eroare upload'); break }
    }
    setUploading(false)
    load()
  }

  async function deleteBon(id: string) {
    if (!confirm('Ștergi acest bon?')) return
    setBonuri(prev => prev.filter(b => b.id !== id))
    await fetch(`/api/bonuri?id=${id}`, { method: 'DELETE' })
  }

  async function patchBon(id: string, patch: Partial<Pick<Bon, 'fisier_nume' | 'comerciant' | 'cui_client' | 'suma' | 'data_bon' | 'tip'>>) {
    setBonuri(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
    await fetch('/api/bonuri', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
  }

  function togglePreview(id: string) {
    setPreviewIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  if (loading) return <div style={{ color: 'var(--c-555555)', fontSize: '14px', padding: '32px 0' }}>Se încarcă...</div>
  if (error && !bonuri.length) return <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '24px 0' }}>{error}</div>

  const asteptare = bonuri.filter(b => b.status === 'asteptare')
  const asociate = bonuri.filter(b => b.status === 'asociata')

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
            {uploading ? 'AI citește bonul...' : '+ Adaugă bon fiscal'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--c-666666)', marginTop: '3px' }}>PDF, JPG, PNG · comerciantul, suma, data și tipul se citesc automat</div>
        </div>
        <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={hiddenInputStyle} onChange={e => e.target.files?.length && uploadFiles(e.target.files)}/>
        {error && <p style={{ fontSize: '11px', color: 'var(--accent-red)', marginTop: '8px' }}>{error}</p>}
      </div>

      <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: '12px', padding: '20px 22px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-777777)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>
          În așteptare ({asteptare.length})
        </div>
        <p style={{ fontSize: '12px', color: 'var(--c-666666)', marginBottom: '14px' }}>Se sugerează automat la tranzacția potrivită din extras, după sumă și data la care ai încărcat bonul — max. 3 zile diferență față de tranzacția bancară.</p>

        {asteptare.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--c-555555)', padding: '4px 0' }}>Niciun bon în așteptare.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {asteptare.map(b => {
              const kind = isPreviewable(b.fisier_tip, b.fisier_nume)
              const open = previewIds.has(b.id)
              const cuiMatch = b.cui_client && firmaCui ? norm(b.cui_client) === norm(firmaCui) : null
              return (
                <div key={b.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: 'var(--c-161616)', border: '1px solid var(--c-262626)', borderRadius: '8px', padding: '10px 12px' }}>
                    <input
                      defaultValue={b.fisier_nume}
                      onBlur={e => e.target.value.trim() && e.target.value !== b.fisier_nume && patchBon(b.id, { fisier_nume: e.target.value.trim() })}
                      style={{ flex: '1 1 140px', minWidth: 0, fontSize: '12px', color: 'var(--c-dddddd)', background: 'transparent', border: 'none', outline: 'none', padding: 0 }}
                    />
                    <select
                      defaultValue={b.tip}
                      onChange={e => patchBon(b.id, { tip: e.target.value as Bon['tip'] })}
                      style={{ width: '96px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 6px', outline: 'none' }}
                    >
                      <option value="combustibil">Combustibil</option>
                      <option value="altul">Altul</option>
                    </select>
                    <input
                      defaultValue={b.comerciant || ''}
                      placeholder="comerciant"
                      onBlur={e => e.target.value.trim() !== (b.comerciant || '') && patchBon(b.id, { comerciant: e.target.value.trim() })}
                      style={{ width: '130px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        defaultValue={b.cui_client || ''}
                        placeholder="CUI client"
                        title="CUI-ul firmei beneficiare, citit din câmpul Client C.U.I./C.I.F. de pe bon (când există)"
                        onBlur={e => e.target.value.trim() !== (b.cui_client || '') && patchBon(b.id, { cui_client: e.target.value.trim() })}
                        style={{ width: '90px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                      />
                      {cuiMatch === true && <span title="CUI corespunde firmei" style={{ fontSize: '11px', color: 'var(--accent-mint)' }}>✓</span>}
                      {cuiMatch === false && <span title="CUI diferit de firma curentă" style={{ fontSize: '11px', color: 'var(--accent-red)' }}>⚠</span>}
                    </div>
                    <input
                      type="number" step="0.01"
                      defaultValue={b.suma ?? ''}
                      placeholder="sumă"
                      onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== b.suma) patchBon(b.id, { suma: v }) }}
                      style={{ width: '80px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                    />
                    <input
                      type="date"
                      title="Data de pe bon — doar informativ, nu contează la asociere (se folosește data la care a fost încărcat)"
                      defaultValue={b.data_bon || ''}
                      onBlur={e => { const v = e.target.value || null; if (v !== b.data_bon) patchBon(b.id, { data_bon: v }) }}
                      style={{ width: '130px', fontSize: '12px', color: 'var(--c-cccccc)', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', padding: '4px 8px', outline: 'none' }}
                    />
                    {kind && (
                      <button onClick={() => togglePreview(b.id)} style={{ fontSize: '11px', fontWeight: 600, color: open ? 'var(--c-dddddd)' : 'var(--accent-mint)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                        {open ? 'Ascunde' : 'Vezi'}
                      </button>
                    )}
                    <a href={`/api/bonuri/download?id=${b.id}`} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-blue)', textDecoration: 'none' }}>↓</a>
                    <button onClick={() => deleteBon(b.id)} style={{ width: '22px', height: '22px', flexShrink: 0, background: 'var(--c-1a1a1a)', border: '1px solid var(--c-2a2a2a)', borderRadius: '6px', cursor: 'pointer', color: 'var(--accent-red)', fontSize: '12px', lineHeight: 1 }}>×</button>
                  </div>
                  {open && kind === 'pdf' && (
                    <iframe src={`/api/bonuri/download?id=${b.id}&preview=1`} style={{ width: '100%', height: '65vh', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '8px', background: 'var(--c-ffffff)' }} />
                  )}
                  {open && kind === 'image' && (
                    <img src={`/api/bonuri/download?id=${b.id}&preview=1`} alt={b.fisier_nume} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', border: '1px solid var(--c-262626)', borderRadius: '8px', marginTop: '8px', background: 'var(--c-ffffff)' }} />
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
            {asociate.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--c-0d0d0d)', border: '1px solid var(--c-1a1a1a)', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-mint)', flexShrink: 0 }}>✓</span>
                <span style={{ flex: 1, fontSize: '12px', color: 'var(--c-777777)', textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.comerciant || b.fisier_nume}</span>
                {b.suma != null && <span style={{ fontSize: '11px', color: 'var(--c-666666)' }}>{b.suma.toFixed(2)} RON</span>}
                {b.data_bon && <span style={{ fontSize: '11px', color: 'var(--c-666666)' }}>{fmtData(b.data_bon)}</span>}
                <button onClick={() => deleteBon(b.id)} style={{ fontSize: '10px', color: 'var(--c-555555)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

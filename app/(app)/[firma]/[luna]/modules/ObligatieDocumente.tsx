'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Doc { id: string; fisier_nume: string; fisier_tip: string | null; created_at: string }

interface Props {
  obligatieStareId: string | null
  label: string
  destinatar: string | null
  sursaInstructiuni: string | null
  editabilLink: string | null
  firmaSlug: string
  luna: string
  culoare: string
}

function isPreviewable(tip: string | null, nume: string): 'pdf' | 'image' | null {
  if (tip === 'application/pdf' || nume.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (tip?.startsWith('image/')) return 'image'
  return null
}

export default function ObligatieDocumente({ obligatieStareId, label, destinatar, sursaInstructiuni, editabilLink, firmaSlug, luna, culoare }: Props) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [busy, setBusy] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!obligatieStareId) return
    fetch(`/api/obligatii/documente?obligatieStareId=${obligatieStareId}`).then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : []))
  }, [obligatieStareId])

  useEffect(() => { load() }, [load])

  async function upload(file: File) {
    if (!obligatieStareId) return
    setBusy(true)
    const fd = new FormData()
    fd.append('file', file); fd.append('obligatieStareId', obligatieStareId); fd.append('label', label)
    await fetch('/api/obligatii/documente', { method: 'POST', body: fd })
    setBusy(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Ștergi documentul?')) return
    await fetch(`/api/chitante/document?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    load()
  }

  return (
    <div style={{ background: 'var(--c-111111)', border: '1px solid var(--c-1e1e1e)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
      <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--c-eeeeee)' }}>{label}</div>
      {destinatar && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-777777)', marginTop: '2px' }}>→ {destinatar}</div>}
      {sursaInstructiuni && (
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-999999)', marginTop: '8px', padding: '8px 10px', background: 'var(--c-161616)', borderRadius: 'var(--r-md)', lineHeight: 1.5 }}>
          📍 {sursaInstructiuni}
        </div>
      )}

      {editabilLink ? (
        <Link href={`/${firmaSlug}/${luna}/${editabilLink}`} style={{ display: 'inline-block', marginTop: '10px', fontSize: 'var(--fs-xs)', fontWeight: 700, color:'var(--accent)', textDecoration: 'none' }}>
          → Deschide editorul
        </Link>
      ) : (
        <>
          {docs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
              {docs.map(d => {
                const kind = isPreviewable(d.fisier_tip, d.fisier_nume)
                const open = previewId === d.id
                return (
                  <div key={d.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--c-cccccc)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fisier_nume}</span>
                      {kind && (
                        <button onClick={() => setPreviewId(open ? null : d.id)} style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color:'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                          {open ? 'Ascunde' : 'Previzualizare'}
                        </button>
                      )}
                      <a href={`/api/chitante/document?id=${d.id}`} style={{ fontSize: 'var(--fs-xs)', color:'var(--accent)' }}>↓</a>
                      <button onClick={() => remove(d.id)} style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
                    </div>
                    {open && kind === 'pdf' && (
                      <iframe src={`/api/chitante/document?id=${d.id}&preview=1`} style={{ width: '100%', height: '55vh', border: '1px solid var(--c-262626)', borderRadius: 'var(--r-md)', marginTop: '6px', background: '#fff' }} />
                    )}
                    {open && kind === 'image' && (
                      <img src={`/api/chitante/document?id=${d.id}&preview=1`} alt={d.fisier_nume} style={{ width: '100%', maxHeight: '55vh', objectFit: 'contain', border: '1px solid var(--c-262626)', borderRadius: 'var(--r-md)', marginTop: '6px', background: '#fff' }} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <label style={{ display: 'inline-block', marginTop: '10px', fontSize: 'var(--fs-xs)', fontWeight: 700, color:'var(--accent)', cursor: obligatieStareId ? 'pointer' : 'not-allowed', opacity: busy || !obligatieStareId ? .5 : 1 }}>
            {busy ? 'Se încarcă...' : '+ Adaugă document'}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={busy || !obligatieStareId}
              onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = '' }} />
          </label>
        </>
      )}
    </div>
  )
}

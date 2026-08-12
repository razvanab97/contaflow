'use client'
import { useEffect, useRef, useState } from 'react'
import CopyButton from '@/components/CopyButton'

interface FirmaDate {
  id: string; nume: string
  cui: string | null; nr_reg_com: string | null; adresa: string | null; judet: string | null; tara: string | null
  certificat_path: string | null; certificat_nume: string | null
}
interface Proprietar {
  id: string; nume: string; serie_ci: string | null; numar_ci: string | null
  buletin_path: string | null; buletin_nume: string | null
}

const FIELDS: { key: keyof FirmaDate; label: string }[] = [
  { key: 'cui', label: 'CUI' },
  { key: 'nr_reg_com', label: 'Nr. înreg. ONRC' },
  { key: 'adresa', label: 'Adresă' },
  { key: 'judet', label: 'Județ' },
  { key: 'tara', label: 'Țară' },
]

function inputStyle(): React.CSSProperties {
  return { flex: 1, background: '#0D0D0D', border: '1px solid #2A2A2A', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: '#FFF', outline: 'none' }
}

export default function DatePersonaleClient({ firmaId }: { firmaId: string }) {
  const [firma, setFirma] = useState<FirmaDate | null>(null)
  const [proprietari, setProprietari] = useState<Proprietar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<FirmaDate>>({})
  const [savingCert, setSavingCert] = useState(false)
  const certInputRef = useRef<HTMLInputElement>(null)
  const buletinInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function load() {
    Promise.all([
      fetch(`/api/firma-date?firmaId=${encodeURIComponent(firmaId)}`).then(r => r.json()),
      fetch(`/api/proprietari?firmaId=${encodeURIComponent(firmaId)}`).then(r => r.json()),
    ]).then(([f, p]) => {
      if (f.error) setError(f.error)
      else setFirma(f)
      if (Array.isArray(p)) setProprietari(p)
      setLoading(false)
    }).catch(() => { setError('Eroare la încărcare'); setLoading(false) })
  }

  useEffect(() => { load() }, [firmaId])

  async function saveFirma() {
    if (!firma) return
    const body = { firmaId, ...draft }
    setFirma({ ...firma, ...draft })
    setEditing(false)
    await fetch('/api/firma-date', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  }

  async function uploadCertificat(file: File) {
    setSavingCert(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('firmaId', firmaId)
    const res = await fetch('/api/firma-date/upload-certificat', { method: 'POST', body: fd })
    setSavingCert(false)
    if (res.ok) load()
  }

  async function addProprietar() {
    const nume = prompt('Nume proprietar:')
    if (!nume) return
    await fetch('/api/proprietari', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId, nume }),
    })
    load()
  }

  async function updateProprietar(id: string, patch: Partial<Proprietar>) {
    setProprietari(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    await fetch('/api/proprietari', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
  }

  async function deleteProprietar(id: string) {
    if (!confirm('Ștergi acest proprietar?')) return
    setProprietari(prev => prev.filter(p => p.id !== id))
    await fetch(`/api/proprietari?id=${id}`, { method: 'DELETE' })
  }

  async function uploadBuletin(proprietarId: string, file: File) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('proprietarId', proprietarId)
    fd.append('firmaId', firmaId)
    const res = await fetch('/api/proprietari/upload-buletin', { method: 'POST', body: fd })
    if (res.ok) load()
  }

  if (loading) return <div style={{ color: '#555', fontSize: '14px', padding: '32px 0' }}>Se încarcă...</div>
  if (error) return <div style={{ color: '#F87171', fontSize: '13px', padding: '24px 0' }}>{error}</div>
  if (!firma) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Date firmă */}
      <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: '12px', padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: '.1em' }}>Date firmă</span>
          {editing ? (
            <button onClick={saveFirma} style={{ fontSize: '12px', fontWeight: 600, color: '#6EE7B0', background: 'transparent', border: 'none', cursor: 'pointer' }}>Salvează</button>
          ) : (
            <button onClick={() => { setDraft(firma); setEditing(true) }} style={{ fontSize: '12px', fontWeight: 600, color: '#888', background: 'transparent', border: 'none', cursor: 'pointer' }}>Editează</button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {FIELDS.map(({ key, label }) => {
            const value = String((editing ? draft[key] : firma[key]) ?? '')
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '120px', flexShrink: 0, fontSize: '12px', color: '#888' }}>{label}</span>
                {editing ? (
                  <input value={value} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} style={inputStyle()} />
                ) : (
                  <span style={{ flex: 1, fontSize: '13px', color: value ? '#DDD' : '#555' }}>{value || '—'}</span>
                )}
                {!editing && <CopyButton value={value} />}
              </div>
            )
          })}
        </div>

        <div style={{ height: '1px', background: '#1E1E1E', margin: '16px 0' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '120px', flexShrink: 0, fontSize: '12px', color: '#888' }}>Certificat</span>
          {firma.certificat_path ? (
            <>
              <span style={{ flex: 1, fontSize: '13px', color: '#DDD' }}>{firma.certificat_nume}</span>
              <a href={`/api/firma-date/download?tip=certificat&firmaId=${firmaId}`} style={{ fontSize: '12px', fontWeight: 600, color: '#60A5FA', textDecoration: 'none' }}>Descarcă</a>
            </>
          ) : (
            <span style={{ flex: 1, fontSize: '13px', color: '#555' }}>Niciun fișier încărcat</span>
          )}
          <input ref={certInputRef} type="file" accept="application/pdf,image/*" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }}
            onChange={e => e.target.files?.[0] && uploadCertificat(e.target.files[0])} />
          <button onClick={() => certInputRef.current?.click()} disabled={savingCert} style={{
            fontSize: '12px', fontWeight: 600, color: '#888', background: '#161616', border: '1px solid #262626',
            borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
          }}>{savingCert ? '...' : (firma.certificat_path ? 'Înlocuiește' : 'Încarcă')}</button>
        </div>
      </div>

      {/* Proprietari */}
      <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: '12px', padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: '.1em' }}>Proprietari</span>
          <button onClick={addProprietar} style={{ fontSize: '12px', fontWeight: 600, color: '#6EE7B0', background: 'transparent', border: 'none', cursor: 'pointer' }}>+ Adaugă proprietar</button>
        </div>

        {proprietari.length === 0 && (
          <p style={{ fontSize: '13px', color: '#555', padding: '8px 0' }}>Niciun proprietar adăugat încă.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {proprietari.map(p => (
            <div key={p.id} style={{ background: '#161616', border: '1px solid #262626', borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <input
                  defaultValue={p.nume}
                  onBlur={e => e.target.value !== p.nume && updateProprietar(p.id, { nume: e.target.value })}
                  style={{ ...inputStyle(), fontWeight: 600 }}
                />
                <button onClick={() => deleteProprietar(p.id)} title="Șterge" style={{
                  width: '26px', height: '26px', flexShrink: 0, background: '#1A1A1A', border: '1px solid #2A2A2A',
                  borderRadius: '6px', cursor: 'pointer', color: '#F87171', fontSize: '14px',
                }}>×</button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ width: '90px', flexShrink: 0, fontSize: '12px', color: '#888' }}>Serie+Nr. CI</span>
                <input
                  defaultValue={p.serie_ci ?? ''}
                  placeholder="Serie"
                  onBlur={e => e.target.value !== p.serie_ci && updateProprietar(p.id, { serie_ci: e.target.value })}
                  style={{ ...inputStyle(), flex: '0 0 60px' }}
                />
                <input
                  defaultValue={p.numar_ci ?? ''}
                  placeholder="Număr"
                  onBlur={e => e.target.value !== p.numar_ci && updateProprietar(p.id, { numar_ci: e.target.value })}
                  style={inputStyle()}
                />
                <CopyButton value={`${p.serie_ci ?? ''} ${p.numar_ci ?? ''}`.trim()} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '90px', flexShrink: 0, fontSize: '12px', color: '#888' }}>Buletin</span>
                {p.buletin_path ? (
                  <>
                    <span style={{ flex: 1, fontSize: '13px', color: '#DDD' }}>{p.buletin_nume}</span>
                    <a href={`/api/firma-date/download?tip=buletin&proprietarId=${p.id}`} style={{ fontSize: '12px', fontWeight: 600, color: '#60A5FA', textDecoration: 'none' }}>Descarcă</a>
                  </>
                ) : (
                  <span style={{ flex: 1, fontSize: '13px', color: '#555' }}>Niciun fișier încărcat</span>
                )}
                <input
                  ref={el => { buletinInputRefs.current[p.id] = el }}
                  type="file" accept="application/pdf,image/*" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }}
                  onChange={e => e.target.files?.[0] && uploadBuletin(p.id, e.target.files[0])}
                />
                <button onClick={() => buletinInputRefs.current[p.id]?.click()} style={{
                  fontSize: '12px', fontWeight: 600, color: '#888', background: '#0D0D0D', border: '1px solid #262626',
                  borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
                }}>{p.buletin_path ? 'Înlocuiește' : 'Încarcă'}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

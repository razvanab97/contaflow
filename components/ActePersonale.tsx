'use client'
import { useEffect, useRef, useState } from 'react'
import CopyButton from './CopyButton'
import { deschideDocument } from '@/lib/vizualizare'
import type { ActPersonal } from '@/lib/acte-personale'

// Actele personale pe Dashboard, ca o carte langa firme: datele citite din act (de copiat) + Vezi / Descarcă.
// Un act nou (buletin, pasaport, permis) se adauga cu „+ Act personal”: AI citeste datele, se pot corecta cu „Editează”.

const dataRo = (iso: string | null) => iso ? iso.split('-').reverse().join('.') : ''
const zilePana = (iso: string | null) => iso ? Math.ceil((Date.parse(iso + 'T23:59:59') - Date.now()) / 86400000) : null

const RANDURI: { label: string; val: (a: ActPersonal) => string; cheie?: keyof ActPersonal }[] = [
  { label: 'CNP', val: a => a.cnp || '', cheie: 'cnp' },
  { label: 'Serie și nr.', val: a => [a.serie, a.numar].filter(Boolean).join(' ') },
  { label: 'Nume', val: a => a.nume || '', cheie: 'nume' },
  { label: 'Prenume', val: a => a.prenume || '', cheie: 'prenume' },
  { label: 'Data nașterii', val: a => dataRo(a.data_nasterii) },
  { label: 'Loc naștere', val: a => a.loc_nastere || '', cheie: 'loc_nastere' },
  { label: 'Domiciliu', val: a => a.domiciliu || '', cheie: 'domiciliu' },
  { label: 'Emis de', val: a => a.emis_de || '', cheie: 'emis_de' },
  { label: 'Valabilitate', val: a => [dataRo(a.valabil_de), dataRo(a.valabil_pana)].filter(Boolean).join(' – ') },
  { label: 'Cetățenie', val: a => [a.cetatenie, a.sex ? `sex ${a.sex}` : ''].filter(Boolean).join(' · '), cheie: 'cetatenie' },
]
const EDITABILE: { k: keyof ActPersonal; label: string; tip?: string }[] = [
  { k: 'tip', label: 'Tip act' }, { k: 'nume', label: 'Nume' }, { k: 'prenume', label: 'Prenume' }, { k: 'cnp', label: 'CNP' },
  { k: 'serie', label: 'Serie' }, { k: 'numar', label: 'Număr' }, { k: 'data_nasterii', label: 'Data nașterii', tip: 'date' }, { k: 'sex', label: 'Sex' },
  { k: 'cetatenie', label: 'Cetățenie' }, { k: 'loc_nastere', label: 'Loc naștere' }, { k: 'domiciliu', label: 'Domiciliu' }, { k: 'emis_de', label: 'Emis de' },
  { k: 'valabil_de', label: 'Valabil de la', tip: 'date' }, { k: 'valabil_pana', label: 'Valabil până la', tip: 'date' },
]

function Rand({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '28px' }}>
      <span style={{ width: '104px', flexShrink: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{label}</span>
      <span title={value} style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-md)', color: value ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</span>
      {value && <CopyButton value={value} />}
    </div>
  )
}

function CarteAct({ a, onChange, onDelete }: { a: ActPersonal; onChange: (a: ActPersonal) => void; onDelete: () => void }) {
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState<Partial<ActPersonal>>({})
  const z = zilePana(a.valabil_pana)
  const numeComplet = [a.prenume, a.nume].filter(Boolean).join(' ') || a.fisier_nume
  const ini = [a.prenume, a.nume].map(s => (s || '').trim()[0] || '').join('').toUpperCase() || 'CI'
  const url = (preview = false) => `/api/acte-personale?download=${a.id}${preview ? '&preview=1' : ''}`

  async function salveaza() {
    const r = await fetch('/api/acte-personale', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, ...draft }) })
    const d = await r.json().catch(() => ({}))
    if (r.ok) { onChange(d.act); setEdit(false) }
  }

  return (
    <div className="card card-interactive" style={{ display: 'flex', flexDirection: 'column', padding: '20px', position: 'relative', overflow: 'hidden' }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: '0 0 auto 0', height: '120px', background: 'radial-gradient(420px 120px at 85% -20%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', position: 'relative' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: 'var(--r-md)', flexShrink: 0, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--accent)' }}>{ini}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.3 }}>{numeComplet}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
            <span className="badge">{a.tip}</span>
            {z != null && (z < 0 ? <span className="badge badge-danger">expirat</span> : z <= 90 ? <span className="badge badge-warning">expiră în {z} zile</span> : <span className="badge badge-success">valabil până la {dataRo(a.valabil_pana)}</span>)}
          </div>
        </div>
      </div>

      <div style={{ height: '16px' }} />
      <div className="eyebrow" style={{ marginBottom: '8px' }}>Date personale</div>
      {edit ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: '10px' }}>
          {EDITABILE.map(({ k, label, tip }) => (
            <label key={k} style={{ display: 'grid', gap: '3px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>{label}
              <input type={tip || 'text'} defaultValue={String(a[k] ?? '')} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}
                style={{ height: '30px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', font: 'inherit', fontSize: 'var(--fs-md)', padding: '0 8px', minWidth: 0 }} />
            </label>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: '8px 8px 8px 12px' }}>
          {RANDURI.map(r => <Rand key={r.label} label={r.label} value={r.val(a)} />)}
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{a.fisier_nume}</span>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {edit ? <>
            <button className="btn btn-sm btn-primary" onClick={salveaza}>Salvează</button>
            <button className="btn btn-sm" onClick={() => { setEdit(false); setDraft({}) }}>Anulează</button>
            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => { if (confirm(`Ștergi ${a.tip.toLowerCase()} (${numeComplet})?`)) onDelete() }}>Șterge</button>
          </> : <>
            <button className="btn btn-sm btn-ghost" onClick={() => setEdit(true)}>Editează</button>
            <button className="btn btn-sm" onClick={() => deschideDocument(url(), `${a.tip} ${numeComplet}`)}>Vezi</button>
            <a className="btn btn-sm btn-primary" href={url()} download>Descarcă</a>
          </>}
        </div>
      </div>
    </div>
  )
}

export default function ActePersonale() {
  const [acte, setActe] = useState<ActPersonal[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [eroare, setEroare] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetch('/api/acte-personale').then(r => r.json()).then(d => setActe(d.acte || [])).catch(() => setActe([])) }, [])

  async function adauga(file: File) {
    setBusy(true); setEroare('')
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch('/api/acte-personale', { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    setBusy(false); if (inputRef.current) inputRef.current.value = ''
    if (r.ok) setActe(prev => [...(prev || []), d.act]); else setEroare(d.error || 'Actul nu s-a putut adăuga')
  }

  async function sterge(id: string) {
    const r = await fetch(`/api/acte-personale?id=${id}`, { method: 'DELETE' })
    if (r.ok) setActe(prev => (prev || []).filter(a => a.id !== id))
  }

  if (!acte) return null
  return (
    <>
      {acte.map(a => <CarteAct key={a.id} a={a} onChange={n => setActe(prev => (prev || []).map(x => x.id === n.id ? n : x))} onDelete={() => sterge(a.id)} />)}
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', borderStyle: 'dashed' }}>
        <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)' }}>+ Act personal</div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Buletin, pașaport sau permis (PDF sau poză). AI citește datele de pe el; le poți corecta apoi cu „Editează”.</div>
        <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && adauga(e.target.files[0])} />
        <button className="btn btn-sm" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? 'Se citește actul…' : 'Alege fișierul'}</button>
        {eroare && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{eroare}</div>}
      </div>
    </>
  )
}

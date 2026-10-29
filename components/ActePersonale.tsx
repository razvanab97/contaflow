'use client'
import { useEffect, useRef, useState } from 'react'
import CopyButton from './CopyButton'
import { deschideDocument } from '@/lib/vizualizare'
import type { ActPersonal } from '@/lib/acte-personale'
import css from './dashboard/Dashboard.module.css'

// Actele personale (buletin etc.) pe Dashboard, primele dupa bara lunii - datele de care e nevoie la toate firmele,
// ca banda subtire: CNP, CI, domiciliu, emis de, valabilitate (de copiat) + Vezi / Descarcă. „Editează” corecteaza
// datele citite de AI; „+ Act personal” adauga alt act (buletin, pasaport, permis).

const dataRo = (iso: string | null) => iso ? iso.split('-').reverse().join('.') : ''
const zilePana = (iso: string | null) => iso ? Math.ceil((Date.parse(iso + 'T23:59:59') - Date.now()) / 86400000) : null

const EDITABILE: { k: keyof ActPersonal; label: string; tip?: string }[] = [
  { k: 'tip', label: 'Tip act' }, { k: 'nume', label: 'Nume' }, { k: 'prenume', label: 'Prenume' }, { k: 'cnp', label: 'CNP' },
  { k: 'serie', label: 'Serie' }, { k: 'numar', label: 'Număr' }, { k: 'data_nasterii', label: 'Data nașterii', tip: 'date' }, { k: 'sex', label: 'Sex' },
  { k: 'cetatenie', label: 'Cetățenie' }, { k: 'loc_nastere', label: 'Loc naștere' }, { k: 'domiciliu', label: 'Domiciliu' }, { k: 'emis_de', label: 'Emis de' },
  { k: 'valabil_de', label: 'Valabil de la', tip: 'date' }, { k: 'valabil_pana', label: 'Valabil până la', tip: 'date' },
]

function Banda({ a, onChange, onDelete }: { a: ActPersonal; onChange: (a: ActPersonal) => void; onDelete: () => void }) {
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState<Partial<ActPersonal>>({})
  const [stergere, setStergere] = useState(false)
  const z = zilePana(a.valabil_pana)
  const numeComplet = [a.prenume, a.nume].filter(Boolean).map(s => s!.toLowerCase().replace(/(^|[\s-])\p{L}/gu, c => c.toUpperCase())).join(' ') || a.fisier_nume
  const ini = [a.prenume, a.nume].map(s => (s || '').trim()[0] || '').join('').toUpperCase() || 'CI'
  const url = `/api/acte-personale?download=${a.id}`
  const chips = [
    ['CNP', a.cnp || ''], ['CI', [a.serie, a.numar].filter(Boolean).join(' ')], ['Domiciliu', a.domiciliu || ''],
    ['Emis de', a.emis_de || ''], ['Valabil', [dataRo(a.valabil_de), dataRo(a.valabil_pana)].filter(Boolean).join(' – ')],
  ].filter(([, v]) => v)

  async function salveaza() {
    const r = await fetch('/api/acte-personale', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, ...draft }) })
    const d = await r.json().catch(() => ({}))
    if (r.ok) { onChange(d.act); setEdit(false); setDraft({}) }
  }

  return (
    <section className={css.id} aria-label={`${a.tip} ${numeComplet}`}>
      <div className={css.idWho}>
        <span className={css.avatar}>{ini}</span>
        <div style={{ minWidth: 0 }}>
          <b>{numeComplet}</b>
          <small>{a.tip}{z != null && <> · <span style={{ fontWeight: 600, color: z < 0 ? 'var(--danger)' : z <= 90 ? 'var(--warning)' : 'var(--success)' }}>{z < 0 ? 'expirat' : z <= 90 ? `expiră în ${z} zile` : `valabil până la ${dataRo(a.valabil_pana)}`}</span></>}</small>
        </div>
      </div>
      <div className={css.idAct}>
        {edit ? <>
          <button type="button" className="btn btn-sm btn-primary" onClick={salveaza}>Salvează</button>
          <button type="button" className="btn btn-sm" onClick={() => { setEdit(false); setDraft({}); setStergere(false) }}>Anulează</button>
          {stergere
            ? <button type="button" className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>Confirm ștergerea</button>
            : <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setStergere(true)}>Șterge</button>}
        </> : <>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEdit(true)}>Editează</button>
          <button type="button" className="btn btn-sm" onClick={() => deschideDocument(url, `${a.tip} ${numeComplet}`)}>Vezi</button>
          <a className="btn btn-sm btn-primary" href={url} download>Descarcă PDF</a>
        </>}
      </div>
      <div className={css.chips}>
        {chips.map(([k, v]) => (
          <span key={k} className={css.chip}><span className={css.chipK}>{k}</span><span className={`${css.chipV} ${/^(\d|[A-Z]{2} \d)/.test(v) ? css.mono : ''}`} title={v}>{v}</span><CopyButton value={v} /></span>
        ))}
      </div>
      {edit && (
        <div className={css.idEdit}>
          {EDITABILE.map(({ k, label, tip }) => (
            <label key={k}>{label}<input type={tip || 'text'} defaultValue={String(a[k] ?? '')} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} /></label>
          ))}
        </div>
      )}
    </section>
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

  if (!acte) return <div className="skeleton" style={{ height: 70, borderRadius: 16, marginBottom: 16 }} />
  return (
    <>
      {acte.map(a => <Banda key={a.id} a={a} onChange={n => setActe(prev => (prev || []).map(x => x.id === n.id ? n : x))} onDelete={() => sterge(a.id)} />)}
      <div className={css.idAdd}>
        <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && adauga(e.target.files[0])} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? 'Se citește actul…' : '+ Act personal'}</button>
        {!acte.length && <span>Buletin, pașaport sau permis — AI citește datele de pe el.</span>}
        {eroare && <span style={{ color: 'var(--danger)' }}>{eroare}</span>}
      </div>
    </>
  )
}

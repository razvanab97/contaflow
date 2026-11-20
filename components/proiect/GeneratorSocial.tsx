'use client'
import { useMemo, useRef, useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'
import { sabloaneBeneficiar, sabloaneActivitate, campuriComune, campuriBeneficiar, VALORI_IMPLICITE, type SablonCamp } from '@/lib/proiect-social-sabloane'

// Generatorul de documente al unei activități: date comune (de activitate), beneficiari cu date
// personale (completate din buletin cu AI), din care se generează automat documentele (Decizie,
// Contract) umplute + număr de înregistrare. Se descarcă Word și PDF (pregătite de semnare).

export interface Beneficiar { id: string; activitate_id: string; nume: string; date: Record<string, string>; created_at: string }
export interface DocGen { id: string; fisier_nume: string; fisier_tip: string | null; furnizor: string | null; tip_document: string | null; beneficiar_social_id: string | null; nr_inregistrare: number | null; created_at: string }

const camp: React.CSSProperties = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 9px', fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }
const link: React.CSSProperties = { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'none' }
const ghost: React.CSSProperties = { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '5px 9px', cursor: 'pointer', color: 'var(--text-secondary)' }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }

// Deschide documentul generat într-o fereastră, randat fidel, și cheamă printarea -> „Salvează ca PDF".
async function printeazaPdf(url: string, nume: string) {
  const w = window.open('', '_blank')
  if (!w) { alert('Permite ferestrele pop-up pentru a salva PDF-ul.'); return }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${nume.replace(/[<>&]/g, '')}</title><style>body{margin:0}@page{margin:16mm}</style></head><body><div id="c">Se pregătește…</div></body></html>`)
  w.document.close()
  try {
    const { renderAsync } = await import('docx-preview')
    const blob = await (await fetch(url)).blob()
    const c = w.document.getElementById('c'); if (c) c.textContent = ''
    await renderAsync(blob, c as HTMLElement, undefined, { inWrapper: false, ignoreWidth: false, ignoreHeight: false })
    w.focus(); setTimeout(() => w.print(), 400)
  } catch { w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:20px">Nu s-a putut randa. Descarcă Word și deschide-l.</p>' }
}

export default function GeneratorSocial({ firmaId, activitateId, an, zona, dateDocumente, beneficiari, documente, urmatorNr, onBeneficiar, onBeneficiarSters, onGenerat, onNrSchimbat, onDateComune, disabled }: {
  firmaId: string; activitateId: string; an: number; zona: string; dateDocumente: Record<string, string>
  beneficiari: Beneficiar[]; documente: DocGen[]; urmatorNr: number
  onBeneficiar: (b: Beneficiar) => void; onBeneficiarSters: (id: string) => void
  onGenerat: (d: DocGen) => void; onNrSchimbat: (d: DocGen) => void; onDateComune: (date: Record<string, string>) => void; disabled?: boolean
}) {
  const sabBen = useMemo(() => sabloaneBeneficiar(zona), [zona])
  const sabAct = useMemo(() => sabloaneActivitate(zona), [zona])
  const comune = useMemo(() => campuriComune(zona), [zona])
  const campBen = useMemo(() => campuriBeneficiar(zona), [zona])
  const [formNou, setFormNou] = useState(false)
  const [busy, setBusy] = useState('')
  const [mesaj, setMesaj] = useState('')
  const api = `/api/proiect-social?firmaId=${encodeURIComponent(firmaId)}`
  const urlDoc = (id: string, preview = false) => `${api}&download=${id}${preview ? '&preview=1' : ''}`
  if (!sabBen.length && !sabAct.length) return null

  async function salveazaComune(date: Record<string, string>) {
    setMesaj('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'date-documente', activitateId, date }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMesaj(d.error || 'Datele comune nu s-au salvat'); return false }
    onDateComune(d.activitate?.date_documente || date); return true
  }
  async function salveazaBenef(nume: string, date: Record<string, string>) {
    setMesaj('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'beneficiar', activitateId, nume, date }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMesaj(d.error || 'Beneficiarul nu s-a salvat'); return }
    onBeneficiar(d.beneficiar); setFormNou(false)
  }
  async function stergeBenef(b: Beneficiar) {
    if (!confirm(`Ștergi beneficiarul „${b.nume}"? (documentele deja generate rămân)`)) return
    const r = await fetch(`${api}&beneficiar=${b.id}`, { method: 'DELETE' })
    if (r.ok) onBeneficiarSters(b.id); else setMesaj('Nu s-a putut șterge')
  }
  async function genereaza(tip: string, beneficiarId: string | null) {
    setBusy(tip + (beneficiarId || '')); setMesaj('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'genereaza', activitateId, tip, beneficiarId }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setMesaj(d.error || 'Generarea a eșuat'); return }
    onGenerat(d.document)
  }
  async function schimbaNr(id: string, nr: string) {
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'nr-document', docId: id, nr }) })
    const d = await r.json().catch(() => ({}))
    if (r.ok) onNrSchimbat(d.document); else setMesaj(d.error || 'Numărul nu s-a salvat')
  }

  const docPentru = (benId: string | null, tip: string) => documente.find(d => d.beneficiar_social_id === benId && d.tip_document === tip)

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <strong style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Documente oficiale (generate)</strong>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>· următorul nr. de înregistrare: <b>{urmatorNr}</b></span>
      </div>

      {/* Date comune (de activitate) - se setează o dată, intră în toate documentele */}
      {!!comune.length && <DateComune campuri={comune} an={an} initial={dateDocumente} disabled={disabled} onSalveaza={salveazaComune} />}

      {/* Documente la nivel de activitate (ex. Decizie) */}
      {sabAct.map(s => {
        const gen = documente.filter(d => d.tip_document === s.tip && !d.beneficiar_social_id)
        return (
          <div key={s.tip} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', fontWeight: 600 }}>{s.label}</span>
            {gen.map(d => <DocLinie key={d.id} d={d} urlDoc={urlDoc} onNr={schimbaNr} />)}
            <button disabled={disabled || busy === s.tip} onClick={() => genereaza(s.tip, null)} style={{ ...link, color: 'var(--accent)' }}>{busy === s.tip ? 'Se generează…' : '+ Generează'}</button>
          </div>
        )
      })}

      {/* Beneficiari + documentele lor (ex. voluntari -> Contract) */}
      {!!sabBen.length && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 600 }}>Beneficiari</span>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{beneficiari.length}</span>
            {!formNou && <button disabled={disabled} onClick={() => setFormNou(true)} style={{ ...link, color: 'var(--accent)', marginLeft: 'auto' }}>+ Adaugă beneficiar</button>}
          </div>
          {beneficiari.map(b => (
            <div key={b.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)', padding: 8, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--text-primary)' }}>{b.nume}</span>
                {b.date?.CNP && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>CNP {b.date.CNP}</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {sabBen.map(s => { const d = docPentru(b.id, s.tip); return d
                    ? <DocLinie key={s.tip} d={d} urlDoc={urlDoc} onNr={schimbaNr} eticheta={s.label} />
                    : <button key={s.tip} disabled={disabled || busy === s.tip + b.id} onClick={() => genereaza(s.tip, b.id)} style={{ ...link, color: 'var(--accent)' }}>{busy === s.tip + b.id ? 'Se generează…' : `+ ${s.label}`}</button>
                  })}
                  <button onClick={() => stergeBenef(b)} title="Șterge beneficiarul" aria-label={`Șterge ${b.nume}`} style={{ ...link, color: 'var(--text-muted)', fontSize: 'var(--fs-base)' }}>×</button>
                </div>
              </div>
            </div>
          ))}
          {formNou && <FormBeneficiar campuri={campBen} firmaId={firmaId} onAnuleaza={() => setFormNou(false)} onSalveaza={salveazaBenef} />}
        </div>
      )}
      {mesaj && <div style={{ marginTop: 6, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{mesaj}</div>}
    </div>
  )
}

function DocLinie({ d, urlDoc, onNr, eticheta }: { d: DocGen; urlDoc: (id: string, p?: boolean) => string; onNr: (id: string, nr: string) => void; eticheta?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)' }}>
      {eticheta && <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>{eticheta}</span>}
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>nr.</span>
      <input defaultValue={d.nr_inregistrare ?? ''} aria-label="Număr de înregistrare" title="Număr de înregistrare (editabil)" inputMode="numeric"
        onBlur={e => { const v = e.target.value.trim(); if (v !== String(d.nr_inregistrare ?? '')) onNr(d.id, v) }}
        style={{ ...camp, width: 44, padding: '2px 5px', fontSize: 'var(--fs-xs)', textAlign: 'center' }} />
      <button onClick={() => deschideDocument(urlDoc(d.id, true), d.fisier_nume)} style={{ ...link, color: 'var(--accent)' }}>Vezi</button>
      <a href={urlDoc(d.id)} style={{ ...link, color: 'var(--accent-blue)' }} title="Descarcă Word (editabil)">Word</a>
      <button onClick={() => printeazaPdf(urlDoc(d.id), d.fisier_nume)} style={{ ...link, color: 'var(--accent-blue)' }} title="Deschide pentru printare / salvare ca PDF">PDF</button>
    </span>
  )
}

// Panoul datelor comune (de activitate): se setează o dată, intră în toate documentele generate.
function DateComune({ campuri, an, initial, disabled, onSalveaza }: { campuri: SablonCamp[]; an: number; initial: Record<string, string>; disabled?: boolean; onSalveaza: (d: Record<string, string>) => Promise<boolean> }) {
  const [deschis, setDeschis] = useState(false)
  const [val, setVal] = useState<Record<string, string>>(() => ({ AN: String(an), ...VALORI_IMPLICITE, ...initial }))
  const [stare, setStare] = useState('')
  const set = (k: string, v: string) => setVal(p => ({ ...p, [k]: v }))
  const nrSetate = campuri.filter(c => val[c.key]?.trim()).length
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)', padding: 8, marginBottom: 8, background: 'var(--surface-sunken)' }}>
      <button onClick={() => setDeschis(v => !v)} style={{ ...link, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
        <span>{deschis ? '▾' : '▸'}</span>
        <span style={{ fontWeight: 600 }}>Date comune documente</span>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 400 }}>· {nrSetate}/{campuri.length} completate · se aplică tuturor documentelor</span>
      </button>
      {deschis && (
        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            {campuri.map(c => (
              <label key={c.key} style={lbl}>{c.label}
                <input value={val[c.key] || ''} onChange={e => set(c.key, e.target.value)} style={camp} /></label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
            {stare && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--success)' }}>{stare}</span>}
            <button disabled={disabled} onClick={async () => { if (await onSalveaza(val)) { setStare('✓ salvat'); setTimeout(() => setStare(''), 2000) } }} style={{ ...ghost, color: 'var(--accent)', border: '1px solid var(--accent)' }}>Salvează datele comune</button>
          </div>
        </div>
      )}
    </div>
  )
}

function FormBeneficiar({ campuri, firmaId, onSalveaza, onAnuleaza }: { campuri: SablonCamp[]; firmaId: string; onSalveaza: (nume: string, date: Record<string, string>) => void; onAnuleaza: () => void }) {
  const [val, setVal] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: string) => setVal(p => ({ ...p, [k]: v }))
  const nume = val.NUME || ''

  async function dinBuletin(file: File | undefined) {
    if (!file) return
    setBusy(true); setMesaj('Se citește buletinul…')
    try {
      const fd = new FormData(); fd.set('file', file)
      const r = await fetch(`/api/proiect-social/buletin?firmaId=${encodeURIComponent(firmaId)}`, { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMesaj(d.error || 'Nu s-a putut citi'); return }
      const nr = Object.keys(d.date || {}).length
      if (nr) { setVal(p => ({ ...p, ...d.date })); setMesaj(`✓ ${nr} câmpuri completate din buletin — verifică-le`) }
      else setMesaj(d.mesaj || 'Nu am găsit date — completează manual')
    } catch { setMesaj('Citirea a eșuat') }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }

  return (
    <div style={{ border: '1px solid var(--accent)', borderRadius: 'var(--r-sm)', padding: 10, marginTop: 4, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => dinBuletin(e.target.files?.[0])} />
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} style={{ ...ghost, color: 'var(--accent)', border: '1px solid var(--accent)' }}>📷 Completează din buletin</button>
        {mesaj && <span style={{ fontSize: 'var(--fs-xs)', color: mesaj.startsWith('✓') ? 'var(--success)' : 'var(--text-muted)' }}>{mesaj}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {campuri.map(c => (
          <label key={c.key} style={lbl}>{c.label}
            <input value={val[c.key] || ''} onChange={e => set(c.key, e.target.value)} style={camp} /></label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onAnuleaza} style={ghost}>Anulează</button>
        <button disabled={!nume.trim()} onClick={() => nume.trim() && onSalveaza(nume.trim(), val)} style={{ ...ghost, color: 'var(--accent)', border: '1px solid var(--accent)', opacity: nume.trim() ? 1 : 0.5 }}>Salvează beneficiarul</button>
      </div>
    </div>
  )
}

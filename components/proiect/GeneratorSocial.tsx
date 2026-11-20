'use client'
import { useMemo, useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'
import { sabloaneBeneficiar, sabloaneActivitate, getSablon, VALORI_IMPLICITE, type SablonDef } from '@/lib/proiect-social-sabloane'

// Generatorul de documente al unei activități: beneficiari (ex. voluntari) cu date, din care se
// generează automat documentele din șabloane (umplute + număr de înregistrare), vizibile și descărcabile.

export interface Beneficiar { id: string; activitate_id: string; nume: string; date: Record<string, string>; created_at: string }
export interface DocGen { id: string; fisier_nume: string; fisier_tip: string | null; furnizor: string | null; tip_document: string | null; beneficiar_social_id: string | null; nr_inregistrare: number | null; created_at: string }

const camp: React.CSSProperties = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 9px', fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }
const link: React.CSSProperties = { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'none' }
const ghost: React.CSSProperties = { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '5px 9px', cursor: 'pointer', color: 'var(--text-secondary)' }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }

export default function GeneratorSocial({ firmaId, activitateId, an, zona, beneficiari, documente, urmatorNr, onBeneficiar, onBeneficiarSters, onGenerat, onNrSchimbat, disabled }: {
  firmaId: string; activitateId: string; an: number; zona: string
  beneficiari: Beneficiar[]; documente: DocGen[]; urmatorNr: number
  onBeneficiar: (b: Beneficiar) => void; onBeneficiarSters: (id: string) => void
  onGenerat: (d: DocGen) => void; onNrSchimbat: (d: DocGen) => void; disabled?: boolean
}) {
  const sabBen = useMemo(() => sabloaneBeneficiar(zona), [zona])
  const sabAct = useMemo(() => sabloaneActivitate(zona), [zona])
  const [formNou, setFormNou] = useState(false)
  const [formDecizie, setFormDecizie] = useState<SablonDef | null>(null)
  const [busy, setBusy] = useState('')
  const [mesaj, setMesaj] = useState('')
  const api = `/api/proiect-social?firmaId=${encodeURIComponent(firmaId)}`
  const urlDoc = (id: string, preview = false) => `${api}&download=${id}${preview ? '&preview=1' : ''}`
  if (!sabBen.length && !sabAct.length) return null

  async function salveazaBenef(id: string | null, nume: string, date: Record<string, string>) {
    setMesaj('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'beneficiar', activitateId, id, nume, date }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMesaj(d.error || 'Beneficiarul nu s-a salvat'); return }
    onBeneficiar(d.beneficiar); setFormNou(false)
  }
  async function stergeBenef(b: Beneficiar) {
    if (!confirm(`Ștergi beneficiarul „${b.nume}"? (documentele deja generate rămân)`)) return
    const r = await fetch(`${api}&beneficiar=${b.id}`, { method: 'DELETE' })
    if (r.ok) onBeneficiarSters(b.id); else setMesaj('Nu s-a putut șterge')
  }
  async function genereaza(tip: string, beneficiarId: string | null, campuri?: Record<string, string>) {
    setBusy(tip + (beneficiarId || '')); setMesaj('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'genereaza', activitateId, tip, beneficiarId, campuri }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setMesaj(d.error || 'Generarea a eșuat'); return }
    onGenerat(d.document); setFormDecizie(null)
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

      {/* Documente la nivel de activitate (ex. Decizie) */}
      {sabAct.map(s => {
        const gen = documente.filter(d => d.tip_document === s.tip && !d.beneficiar_social_id)
        return (
          <div key={s.tip} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', fontWeight: 600 }}>{s.label}</span>
              {gen.map(d => <DocLinie key={d.id} d={d} urlDoc={urlDoc} onNr={schimbaNr} />)}
              {formDecizie?.tip !== s.tip && <button disabled={disabled} onClick={() => setFormDecizie(s)} style={{ ...link, color: 'var(--accent)' }}>+ Generează</button>}
            </div>
            {formDecizie?.tip === s.tip && <FormActivitate sablon={s} an={an} busy={busy === s.tip} onAnuleaza={() => setFormDecizie(null)} onGenereaza={c => genereaza(s.tip, null, c)} />}
          </div>
        )
      })}

      {/* Beneficiari + documentele lor (ex. voluntari -> Contract) */}
      {!!sabBen.length && (
        <div style={{ marginTop: 6 }}>
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
          {formNou && <FormBeneficiar sablon={sabBen[0]} onAnuleaza={() => setFormNou(false)} onSalveaza={(nume, date) => salveazaBenef(null, nume, date)} />}
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
      <a href={urlDoc(d.id)} style={{ ...link, color: 'var(--accent-blue)' }}>Descarcă</a>
    </span>
  )
}

function FormBeneficiar({ sablon, onSalveaza, onAnuleaza }: { sablon: SablonDef; onSalveaza: (nume: string, date: Record<string, string>) => void; onAnuleaza: () => void }) {
  const [val, setVal] = useState<Record<string, string>>(() => ({ ...VALORI_IMPLICITE }))
  const set = (k: string, v: string) => setVal(p => ({ ...p, [k]: v }))
  const nume = val.NUME || ''
  return (
    <div style={{ border: '1px solid var(--accent)', borderRadius: 'var(--r-sm)', padding: 10, marginTop: 4, display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Completează datele; din ele se generează {sablon.label.toLowerCase()}. (AI din buletin — în curând.)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {sablon.campuri.map(c => (
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

function FormActivitate({ sablon, an, busy, onGenereaza, onAnuleaza }: { sablon: SablonDef; an: number; busy: boolean; onGenereaza: (c: Record<string, string>) => void; onAnuleaza: () => void }) {
  const [val, setVal] = useState<Record<string, string>>(() => ({ AN: String(an), ...VALORI_IMPLICITE }))
  const set = (k: string, v: string) => setVal(p => ({ ...p, [k]: v }))
  return (
    <div style={{ border: '1px solid var(--accent)', borderRadius: 'var(--r-sm)', padding: 10, marginTop: 6, display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        {sablon.campuri.map(c => (
          <label key={c.key} style={lbl}>{c.label}
            <input value={val[c.key] || ''} onChange={e => set(c.key, e.target.value)} style={camp} /></label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onAnuleaza} style={ghost}>Anulează</button>
        <button disabled={busy} onClick={() => onGenereaza(val)} style={{ ...ghost, color: 'var(--accent)', border: '1px solid var(--accent)' }}>{busy ? 'Se generează…' : 'Generează'}</button>
      </div>
    </div>
  )
}

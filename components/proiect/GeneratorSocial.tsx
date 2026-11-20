'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'
import { sabloaneBeneficiar, sabloaneActivitate, campuriComune, campuriBeneficiar, VALORI_IMPLICITE, type SablonCamp, type SablonDef } from '@/lib/proiect-social-sabloane'

// Fabrica de documente a unei activități: setezi o dată datele comune, adaugi beneficiari (din buletin),
// iar documentele se GENEREAZĂ singure (Decizie + Contract per beneficiar), gata de descărcat Word/PDF.
// Fără butoane de „generează" — totul apare direct și se actualizează în loc când schimbi ceva.

export interface Beneficiar { id: string; activitate_id: string; nume: string; date: Record<string, string>; created_at: string }
export interface DocGen { id: string; fisier_nume: string; fisier_tip: string | null; furnizor: string | null; tip_document: string | null; beneficiar_social_id: string | null; nr_inregistrare: number | null; created_at: string }

const S = {
  camp: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '7px 10px', fontSize: 'var(--fs-md)', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box' as const },
  lbl: { display: 'flex', flexDirection: 'column' as const, gap: 3, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '3px 9px', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'none' } as React.CSSProperties,
  ghost: { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', color: 'var(--text-secondary)' } as React.CSSProperties,
  primar: { fontSize: 'var(--fs-sm)', fontWeight: 700, background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 999, padding: '6px 14px', cursor: 'pointer', color: '#fff' } as React.CSSProperties,
}
const initiale = (n: string) => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')

// Deschide documentul randat fidel și cheamă printarea -> „Salvează ca PDF".
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

export default function GeneratorSocial({ firmaId, activitateId, an, zona, dateDocumente, beneficiari, documente, onBeneficiar, onBeneficiarSters, onGenerat, onNrSchimbat, onDateComune, disabled }: {
  firmaId: string; activitateId: string; an: number; zona: string; dateDocumente: Record<string, string>
  beneficiari: Beneficiar[]; documente: DocGen[]
  onBeneficiar: (b: Beneficiar) => void; onBeneficiarSters: (id: string) => void
  onGenerat: (d: DocGen) => void; onNrSchimbat: (d: DocGen) => void; onDateComune: (date: Record<string, string>) => void; disabled?: boolean
}) {
  const sabBen = useMemo(() => sabloaneBeneficiar(zona), [zona])
  const sabAct = useMemo(() => sabloaneActivitate(zona), [zona])
  const comune = useMemo(() => campuriComune(zona), [zona])
  const campBen = useMemo(() => campuriBeneficiar(zona), [zona])
  const [editeaza, setEditeaza] = useState<string | null>(null) // id beneficiar în editare, sau 'nou'
  const [setariDeschise, setSetari] = useState(false)
  const [busy, setBusy] = useState('')
  const [mesaj, setMesaj] = useState('')
  const autoRef = useRef(false)
  const api = `/api/proiect-social?firmaId=${encodeURIComponent(firmaId)}`
  const urlDoc = (id: string, preview = false) => `${api}&download=${id}${preview ? '&preview=1' : ''}`
  const docPentru = (benId: string | null, tip: string) => documente.find(d => d.beneficiar_social_id === benId && d.tip_document === tip)

  async function genereaza(tip: string, benId: string | null, silent = false): Promise<boolean> {
    if (!silent) setBusy('g' + (benId || tip))
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'genereaza', activitateId, tip, beneficiarId: benId }) })
    const d = await r.json().catch(() => ({}))
    if (!silent) setBusy('')
    if (r.ok) { onGenerat(d.document); return true }
    if (!silent) setMesaj(d.error || 'Nu s-a putut genera documentul')
    return false
  }

  // Decizia (document de activitate) apare singură când sunt datele comune.
  useEffect(() => {
    if (autoRef.current || disabled || !sabAct.length) return
    const areComune = Object.values(dateDocumente || {}).some(v => v)
    const lipsesc = sabAct.filter(s => !documente.some(d => d.tip_document === s.tip && !d.beneficiar_social_id))
    if (areComune && lipsesc.length) { autoRef.current = true; lipsesc.forEach(s => void genereaza(s.tip, null, true)) }
  }, [documente, dateDocumente, sabAct, disabled]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sabBen.length && !sabAct.length) return null

  async function salveazaComune(date: Record<string, string>) {
    setBusy('comune'); setMesaj('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'date-documente', activitateId, date }) })
    const d = await r.json().catch(() => ({})); setBusy('')
    if (!r.ok) { setMesaj(d.error || 'Nu s-au salvat'); return }
    onDateComune(d.activitate?.date_documente || date); setSetari(false)
    // actualizează toate documentele cu noile date comune (în loc, păstrând numărul)
    for (const s of sabAct) await genereaza(s.tip, null, true)
    for (const b of beneficiari) for (const s of sabBen) await genereaza(s.tip, b.id, true)
  }
  async function salveazaBenef(id: string | null, nume: string, date: Record<string, string>) {
    setBusy('benef'); setMesaj('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'beneficiar', activitateId, id, nume, date }) })
    const d = await r.json().catch(() => ({})); setBusy('')
    if (!r.ok) { setMesaj(d.error || 'Beneficiarul nu s-a salvat'); return }
    onBeneficiar(d.beneficiar); setEditeaza(null)
    for (const s of sabBen) await genereaza(s.tip, d.beneficiar.id, true) // contractul apare singur
  }
  async function stergeBenef(b: Beneficiar) {
    if (!confirm(`Ștergi pe „${b.nume}"? (documentele deja generate rămân)`)) return
    const r = await fetch(`${api}&beneficiar=${b.id}`, { method: 'DELETE' })
    if (r.ok) onBeneficiarSters(b.id); else setMesaj('Nu s-a putut șterge')
  }
  async function schimbaNr(id: string, nr: string) {
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'nr-document', docId: id, nr }) })
    const d = await r.json().catch(() => ({}))
    if (r.ok) onNrSchimbat(d.document); else setMesaj(d.error || 'Numărul nu s-a salvat')
  }

  const nrComplete = comune.filter(c => (dateDocumente || {})[c.key]?.trim() || VALORI_IMPLICITE[c.key]).length

  return (
    <div style={{ marginTop: 12, borderRadius: 'var(--r-lg)', border: '1px solid color-mix(in srgb, var(--accent) 18%, var(--border))', background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, var(--surface)), var(--surface))', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 'var(--fs-md)' }}>✦</span>
        <strong style={{ fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }}>Documente oficiale</strong>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>se completează și se actualizează singure</span>
      </div>

      {/* Setări comune - discret, pliabil */}
      {!!comune.length && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setSetari(v => !v)} style={{ ...S.ghost, border: 'none', padding: '2px 0', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'var(--fs-sm)' }}>⚙</span> Setări comune <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 400 }}>· {nrComplete}/{comune.length} · {setariDeschise ? 'ascunde' : 'editează'}</span>
          </button>
          {setariDeschise && <Formular campuri={comune} initial={{ AN: String(an), ...VALORI_IMPLICITE, ...dateDocumente }} busy={busy === 'comune'} textSalvare="Salvează setările" onAnuleaza={() => setSetari(false)} onSalveaza={(_n, d) => salveazaComune(d)} fara="nume" />}
        </div>
      )}

      {/* Decizia - card auto */}
      {sabAct.map(s => {
        const d = docPentru(null, s.tip)
        return <CardDoc key={s.tip} titlu={s.label} doc={d} busy={busy === 'g' + s.tip} urlDoc={urlDoc} onNr={schimbaNr} onRegen={() => genereaza(s.tip, null)} disabled={disabled} />
      })}

      {/* Beneficiari */}
      {!!sabBen.length && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Voluntari</strong>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{beneficiari.length}</span>
            {editeaza !== 'nou' && <button disabled={disabled} onClick={() => setEditeaza('nou')} style={{ ...S.primar, marginLeft: 'auto' }}>+ Adaugă</button>}
          </div>

          {editeaza === 'nou' && <FormBeneficiar campuri={campBen} firmaId={firmaId} busy={busy === 'benef'} onAnuleaza={() => setEditeaza(null)} onSalveaza={(n, dd) => salveazaBenef(null, n, dd)} />}

          <div style={{ display: 'grid', gap: 8 }}>
            {beneficiari.map(b => editeaza === b.id
              ? <FormBeneficiar key={b.id} campuri={campBen} firmaId={firmaId} busy={busy === 'benef'} initial={{ NUME: b.nume, ...b.date }} onAnuleaza={() => setEditeaza(null)} onSalveaza={(n, dd) => salveazaBenef(b.id, n, dd)} />
              : (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 15%, var(--surface))', color: 'var(--accent)', fontWeight: 700, fontSize: 'var(--fs-sm)', display: 'grid', placeItems: 'center' }}>{initiale(b.nume) || '•'}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.nume}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{b.date?.CNP ? `CNP ${b.date.CNP}` : 'fără CNP'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {sabBen.map(s => { const d = docPentru(b.id, s.tip); return <ChipDoc key={s.tip} doc={d} busy={busy === 'g' + b.id} urlDoc={urlDoc} onNr={schimbaNr} /> })}
                    <button onClick={() => setEditeaza(b.id)} title="Editează / actualizează datele" aria-label={`Editează ${b.nume}`} style={{ ...S.ghost, border: 'none', padding: 4, color: 'var(--text-muted)' }}>✎</button>
                    <button onClick={() => stergeBenef(b)} title="Șterge" aria-label={`Șterge ${b.nume}`} style={{ ...S.ghost, border: 'none', padding: 4, color: 'var(--text-muted)', fontSize: 'var(--fs-base)' }}>×</button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
      {mesaj && <div style={{ marginTop: 8, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{mesaj}</div>}
    </div>
  )
}

// Un document (Decizie) ca un card curat; se autogenerează, aici doar se vede/descarcă.
function CardDoc({ titlu, doc, busy, urlDoc, onNr, onRegen, disabled }: { titlu: string; doc?: DocGen; busy: boolean; urlDoc: (id: string, p?: boolean) => string; onNr: (id: string, nr: string) => void; onRegen: () => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface)', marginBottom: 6 }}>
      <span style={{ fontSize: 'var(--fs-base)' }}>📄</span>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{titlu}</span>
      <div style={{ marginLeft: 'auto' }}>
        {doc ? <ChipDoc doc={doc} busy={busy} urlDoc={urlDoc} onNr={onNr} />
          : <button disabled={disabled || busy} onClick={onRegen} style={S.pill}>{busy ? 'se pregătește…' : 'pregătește'}</button>}
      </div>
    </div>
  )
}

// Documentul unui beneficiar / activitate: nr editabil + Vezi / Word / PDF, compact.
function ChipDoc({ doc, busy, urlDoc, onNr }: { doc?: DocGen; busy: boolean; urlDoc: (id: string, p?: boolean) => string; onNr: (id: string, nr: string) => void }) {
  if (!doc) return <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{busy ? 'se pregătește…' : '—'}</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
        nr
        <input defaultValue={doc.nr_inregistrare ?? ''} aria-label="Număr de înregistrare" title="Număr de înregistrare (editabil)" inputMode="numeric"
          onBlur={e => { const v = e.target.value.trim(); if (v !== String(doc.nr_inregistrare ?? '')) onNr(doc.id, v) }}
          style={{ width: 38, padding: '2px 4px', fontSize: 'var(--fs-xs)', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', color: 'var(--text-primary)', fontWeight: 700 }} />
      </span>
      <button onClick={() => deschideDocument(urlDoc(doc.id, true), doc.fisier_nume)} style={{ ...S.pill, border: 'none', background: 'transparent', padding: '3px 4px' }} title="Vezi">👁</button>
      <a href={urlDoc(doc.id)} style={S.pill} title="Descarcă Word (editabil)">Word</a>
      <button onClick={() => printeazaPdf(urlDoc(doc.id), doc.fisier_nume)} style={S.pill} title="PDF (pregătit de semnare)">PDF</button>
    </span>
  )
}

// Formular de beneficiar: butonul de buletin ca acțiune principală + câmpuri.
function FormBeneficiar({ campuri, firmaId, busy, initial, onSalveaza, onAnuleaza }: { campuri: SablonCamp[]; firmaId: string; busy: boolean; initial?: Record<string, string>; onSalveaza: (nume: string, date: Record<string, string>) => void; onAnuleaza: () => void }) {
  const [val, setVal] = useState<Record<string, string>>(() => ({ ...(initial || {}) }))
  const [incarc, setIncarc] = useState(false)
  const [info, setInfo] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: string) => setVal(p => ({ ...p, [k]: v }))
  const nume = val.NUME || ''

  async function dinBuletin(file: File | undefined) {
    if (!file) return
    setIncarc(true); setInfo('Se citește buletinul…')
    try {
      const fd = new FormData(); fd.set('file', file)
      const r = await fetch(`/api/proiect-social/buletin?firmaId=${encodeURIComponent(firmaId)}`, { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setInfo(d.error || 'Nu s-a putut citi'); return }
      const nr = Object.keys(d.date || {}).length
      if (nr) { setVal(p => ({ ...p, ...d.date })); setInfo(`✓ completat din buletin — verifică`) }
      else setInfo(d.mesaj || 'Nu am găsit date — completează manual')
    } catch { setInfo('Citirea a eșuat') }
    finally { setIncarc(false); if (inputRef.current) inputRef.current.value = '' }
  }

  return (
    <div style={{ borderRadius: 'var(--r-md)', border: '1px solid color-mix(in srgb, var(--accent) 40%, var(--border))', background: 'color-mix(in srgb, var(--accent) 5%, var(--surface))', padding: 12, marginBottom: 8, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => dinBuletin(e.target.files?.[0])} />
        <button type="button" disabled={incarc} onClick={() => inputRef.current?.click()} style={{ ...S.primar, display: 'inline-flex', alignItems: 'center', gap: 6 }}>📷 {incarc ? 'Se citește…' : 'Scanează buletinul'}</button>
        <span style={{ fontSize: 'var(--fs-xs)', color: info.startsWith('✓') ? 'var(--success)' : 'var(--text-muted)' }}>{info || 'sau completează manual'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {campuri.map(c => (
          <label key={c.key} style={S.lbl}>{c.label}
            <input value={val[c.key] || ''} onChange={e => set(c.key, e.target.value)} style={S.camp} /></label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onAnuleaza} style={S.ghost}>Anulează</button>
        <button disabled={!nume.trim() || busy} onClick={() => nume.trim() && onSalveaza(nume.trim(), val)} style={{ ...S.primar, opacity: nume.trim() && !busy ? 1 : 0.5 }}>{busy ? 'Se pregătește…' : 'Salvează — documentele apar singure'}</button>
      </div>
    </div>
  )
}

// Formular generic (date comune) - fără câmp de nume.
function Formular({ campuri, initial, busy, textSalvare, onSalveaza, onAnuleaza }: { campuri: SablonCamp[]; initial: Record<string, string>; busy: boolean; textSalvare: string; fara?: string; onSalveaza: (nume: string, date: Record<string, string>) => void; onAnuleaza: () => void }) {
  const [val, setVal] = useState<Record<string, string>>(() => ({ ...initial }))
  const set = (k: string, v: string) => setVal(p => ({ ...p, [k]: v }))
  return (
    <div style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface)', padding: 12, marginTop: 6, display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {campuri.map(c => (
          <label key={c.key} style={S.lbl}>{c.label}
            <input value={val[c.key] || ''} onChange={e => set(c.key, e.target.value)} style={S.camp} /></label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onAnuleaza} style={S.ghost}>Anulează</button>
        <button disabled={busy} onClick={() => onSalveaza('', val)} style={S.primar}>{busy ? 'Se salvează…' : textSalvare}</button>
      </div>
    </div>
  )
}

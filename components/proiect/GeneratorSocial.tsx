'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'
import { sabloaneBeneficiar, sabloaneActivitate, campuriComune, campuriBeneficiar, VALORI_IMPLICITE, type SablonCamp } from '@/lib/proiect-social-sabloane'

// Fabrica de documente a unei activități: setezi o dată datele comune (inclusiv data documentelor),
// adaugi voluntari (din buletin), iar documentele se GENEREAZĂ singure și se actualizează în loc.

export interface Beneficiar { id: string; activitate_id: string; nume: string; date: Record<string, string>; created_at: string }
export interface DocGen { id: string; fisier_nume: string; fisier_tip: string | null; furnizor: string | null; tip_document: string | null; beneficiar_social_id: string | null; nr_inregistrare: number | null; data_document?: string | null; created_at: string }

const ACC = (p: number, baza = 'transparent') => `color-mix(in srgb, var(--accent) ${p}%, ${baza})`
const X = {
  panel: { position: 'relative' as const, marginTop: 12, borderRadius: 16, border: `1px solid ${ACC(20, 'var(--border)')}`, background: `linear-gradient(165deg, ${ACC(7, 'var(--surface)')}, var(--surface) 60%)`, padding: 16, overflow: 'hidden' as const },
  glow: { position: 'absolute' as const, insetInline: 0, top: 0, height: 2, background: `linear-gradient(90deg, transparent, ${ACC(70)}, transparent)` },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: ACC(3, 'var(--surface)') } as React.CSSProperties,
  iconSq: { width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: ACC(13, 'var(--surface)'), fontSize: 16, flexShrink: 0 } as React.CSSProperties,
  pill: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '4px 11px', borderRadius: 999, border: `1px solid ${ACC(32, 'var(--border)')}`, background: ACC(7), color: 'var(--accent)', cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' } as React.CSSProperties,
  icoBtn: { display: 'inline-grid', placeItems: 'center', width: 28, height: 28, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  ghost: { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 14px', cursor: 'pointer', color: 'var(--text-secondary)' } as React.CSSProperties,
  primar: { fontSize: 'var(--fs-sm)', fontWeight: 700, border: 'none', borderRadius: 999, padding: '8px 16px', cursor: 'pointer', color: '#fff', background: `linear-gradient(135deg, var(--accent), ${ACC(75, '#4ab08f')})`, boxShadow: `0 2px 10px ${ACC(30)}` } as React.CSSProperties,
  camp: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px', fontSize: 'var(--fs-md)', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box' as const },
  lbl: { display: 'flex', flexDirection: 'column' as const, gap: 4, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' },
  nr: { width: 40, padding: '3px 4px', fontSize: 'var(--fs-xs)', textAlign: 'center' as const, border: `1px solid ${ACC(30, 'var(--border)')}`, borderRadius: 8, background: ACC(6, 'var(--surface)'), color: 'var(--accent)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' as const },
}
const initiale = (n: string) => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
const azi = () => new Date().toISOString().slice(0, 10)
const roData = (iso?: string | null) => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : ''

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
  } catch { w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:20px">Nu s-a putut randa. Descarcă Word.</p>' }
}

export default function GeneratorSocial({ firmaId, activitateId, an, zona, dateDocumente, beneficiari, documente, onBeneficiar, onBeneficiarSters, onGenerat, onDateComune, disabled }: {
  firmaId: string; activitateId: string; an: number; zona: string; dateDocumente: Record<string, string>
  beneficiari: Beneficiar[]; documente: DocGen[]
  onBeneficiar: (b: Beneficiar) => void; onBeneficiarSters: (id: string) => void
  onGenerat: (d: DocGen) => void; onNrSchimbat?: (d: DocGen) => void; onDateComune: (date: Record<string, string>) => void; disabled?: boolean
}) {
  const sabBen = useMemo(() => sabloaneBeneficiar(zona), [zona])
  const sabAct = useMemo(() => sabloaneActivitate(zona), [zona])
  const comune = useMemo(() => campuriComune(zona), [zona])
  const campBen = useMemo(() => campuriBeneficiar(zona), [zona])
  const [editeaza, setEditeaza] = useState<string | null>(null)
  const [setari, setSetari] = useState(false)
  const [busy, setBusy] = useState('')
  const [mesaj, setMesaj] = useState('')
  const autoRef = useRef(false)
  const api = `/api/proiect-social?firmaId=${encodeURIComponent(firmaId)}`
  const urlDoc = (id: string, preview = false) => `${api}&download=${id}${preview ? '&preview=1' : ''}`
  const docPentru = (benId: string | null, tip: string) => documente.find(d => d.beneficiar_social_id === benId && d.tip_document === tip)
  const dataCurenta = dateDocumente?.DATA || azi()

  async function genereaza(tip: string, benId: string | null, silent = false, extra: Record<string, unknown> = {}): Promise<boolean> {
    if (!silent) setBusy('g' + (benId || tip))
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'genereaza', activitateId, tip, beneficiarId: benId, ...extra }) })
    const d = await r.json().catch(() => ({}))
    if (!silent) setBusy('')
    if (r.ok) { onGenerat(d.document); return true }
    if (!silent) setMesaj(d.error || 'Nu s-a putut genera documentul')
    return false
  }
  const regenNr = (doc: DocGen, nr: string) => genereaza(doc.tip_document || '', doc.beneficiar_social_id, false, { nr }) // editarea nr-ului regenerează documentul

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
    for (const s of sabAct) await genereaza(s.tip, null, true)
    for (const b of beneficiari) for (const s of sabBen) await genereaza(s.tip, b.id, true)
  }
  async function salveazaBenef(id: string | null, nume: string, date: Record<string, string>) {
    setBusy('benef'); setMesaj('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'beneficiar', activitateId, id, nume, date }) })
    const d = await r.json().catch(() => ({})); setBusy('')
    if (!r.ok) { setMesaj(d.error || 'Beneficiarul nu s-a salvat'); return }
    onBeneficiar(d.beneficiar); setEditeaza(null)
    for (const s of sabBen) await genereaza(s.tip, d.beneficiar.id, true)
  }
  async function stergeBenef(b: Beneficiar) {
    if (!confirm(`Ștergi pe „${b.nume}"? (documentele deja generate rămân)`)) return
    const r = await fetch(`${api}&beneficiar=${b.id}`, { method: 'DELETE' })
    if (r.ok) onBeneficiarSters(b.id); else setMesaj('Nu s-a putut șterge')
  }

  const chips = comune.filter(c => dateDocumente?.[c.key]).slice(0, 2)

  return (
    <div style={X.panel}>
      <div style={X.glow} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <span style={{ fontSize: 17, color: 'var(--accent)', filter: `drop-shadow(0 0 6px ${ACC(45)})` }}>✦</span>
        <strong style={{ fontSize: 'var(--fs-md)', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Documente oficiale</strong>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent)', padding: '2px 9px', borderRadius: 999, background: ACC(10), border: `1px solid ${ACC(25, 'transparent')}` }}>auto</span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>📅 {roData(dataCurenta)}</span>
      </div>

      {/* Setări comune - premium, pliabil */}
      {!!comune.length && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setSetari(v => !v)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', width: '100%' }}>
            <span style={{ fontSize: 13 }}>⚙</span>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Setări comune</span>
            {!setari && chips.map(c => <span key={c.key} style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)' }}>{dateDocumente[c.key]}</span>)}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{setari ? '▴' : '▾'}</span>
          </button>
          {setari && <SetariComune campuri={comune} an={an} dataIni={dataCurenta} initial={dateDocumente} busy={busy === 'comune'} onSalveaza={salveazaComune} onInchide={() => setSetari(false)} />}
        </div>
      )}

      {/* Decizia (document de activitate) */}
      {sabAct.map(s => {
        const d = docPentru(null, s.tip)
        return (
          <div key={s.tip} style={{ ...X.row, marginBottom: 8 }}>
            <span style={X.iconSq}>📄</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}</div>
              {d && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>nr {d.nr_inregistrare} · {roData(d.data_document)}</div>}
            </div>
            {d ? <ActiuniDoc doc={d} urlDoc={urlDoc} onNr={regenNr} /> : <button disabled={disabled || busy === 'g' + s.tip} onClick={() => genereaza(s.tip, null)} style={X.pill}>{busy === 'g' + s.tip ? 'se pregătește…' : 'pregătește'}</button>}
          </div>
        )
      })}

      {/* Voluntari */}
      {!!sabBen.length && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Voluntari</strong>
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent)', padding: '1px 8px', borderRadius: 999, background: ACC(10) }}>{beneficiari.length}</span>
            {editeaza !== 'nou' && <button disabled={disabled} onClick={() => setEditeaza('nou')} style={{ ...X.primar, marginLeft: 'auto' }}>+ Adaugă</button>}
          </div>

          {editeaza === 'nou' && <FormBeneficiar campuri={campBen} firmaId={firmaId} busy={busy === 'benef'} onAnuleaza={() => setEditeaza(null)} onSalveaza={(n, dd) => salveazaBenef(null, n, dd)} />}

          <div style={{ display: 'grid', gap: 8 }}>
            {beneficiari.map(b => editeaza === b.id
              ? <FormBeneficiar key={b.id} campuri={campBen} firmaId={firmaId} busy={busy === 'benef'} initial={{ NUME: b.nume, ...b.date }} onAnuleaza={() => setEditeaza(null)} onSalveaza={(n, dd) => salveazaBenef(b.id, n, dd)} />
              : (
                <div key={b.id} style={X.row}>
                  <span style={{ ...X.iconSq, borderRadius: 999, color: '#fff', fontWeight: 800, fontSize: 'var(--fs-sm)', background: `linear-gradient(135deg, var(--accent), ${ACC(70, '#4ab08f')})` }}>{initiale(b.nume) || '•'}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.nume}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{b.date?.CNP ? `CNP ${b.date.CNP}` : 'fără CNP'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {sabBen.map(s => { const d = docPentru(b.id, s.tip); return d ? <ActiuniDoc key={s.tip} doc={d} urlDoc={urlDoc} onNr={regenNr} /> : <span key={s.tip} style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{busy === 'g' + b.id ? 'se pregătește…' : '—'}</span> })}
                    <button onClick={() => setEditeaza(b.id)} title="Editează" aria-label={`Editează ${b.nume}`} style={X.icoBtn}>✎</button>
                    <button onClick={() => stergeBenef(b)} title="Șterge" aria-label={`Șterge ${b.nume}`} style={{ ...X.icoBtn, fontSize: 15 }}>×</button>
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

// Numărul (editabil) + Vezi / Word / PDF pentru un document.
function ActiuniDoc({ doc, urlDoc, onNr }: { doc: DocGen; urlDoc: (id: string, p?: boolean) => string; onNr: (d: DocGen, nr: string) => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
        nr
        <input defaultValue={doc.nr_inregistrare ?? ''} aria-label="Număr de înregistrare" title="Număr de înregistrare (editabil)" inputMode="numeric"
          onBlur={e => { const v = e.target.value.trim(); if (v !== String(doc.nr_inregistrare ?? '')) onNr(doc, v) }} style={X.nr} />
      </span>
      <button onClick={() => deschideDocument(urlDoc(doc.id, true), doc.fisier_nume)} style={X.icoBtn} title="Vezi">👁</button>
      <a href={urlDoc(doc.id)} style={X.pill} title="Descarcă Word (editabil)">Word</a>
      <button onClick={() => printeazaPdf(urlDoc(doc.id), doc.fisier_nume)} style={X.pill} title="PDF (pregătit de semnare)">PDF</button>
    </span>
  )
}

// Setări comune: data documentelor (calendar) + câmpurile comune.
function SetariComune({ campuri, an, dataIni, initial, busy, onSalveaza, onInchide }: { campuri: SablonCamp[]; an: number; dataIni: string; initial: Record<string, string>; busy: boolean; onSalveaza: (d: Record<string, string>) => void; onInchide: () => void }) {
  const [val, setVal] = useState<Record<string, string>>(() => ({ AN: String(an), ...VALORI_IMPLICITE, ...initial, DATA: dataIni }))
  const set = (k: string, v: string) => setVal(p => ({ ...p, [k]: v }))
  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', padding: 12, marginTop: 8, display: 'grid', gap: 10 }}>
      <label style={{ ...X.lbl, maxWidth: 220 }}>📅 Data documentelor
        <input type="date" value={val.DATA || ''} onChange={e => set('DATA', e.target.value)} style={X.camp} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {campuri.map(c => (
          <label key={c.key} style={X.lbl}>{c.label}
            <input value={val[c.key] || ''} onChange={e => set(c.key, e.target.value)} style={X.camp} /></label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onInchide} style={X.ghost}>Anulează</button>
        <button disabled={busy} onClick={() => onSalveaza(val)} style={X.primar}>{busy ? 'Se salvează…' : 'Salvează setările'}</button>
      </div>
    </div>
  )
}

// Formular voluntar: butonul de buletin ca acțiune principală + câmpuri personale.
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
      if (nr) { setVal(p => ({ ...p, ...d.date })); setInfo('✓ completat din buletin — verifică') }
      else setInfo(d.mesaj || 'Nu am găsit date — completează manual')
    } catch { setInfo('Citirea a eșuat') }
    finally { setIncarc(false); if (inputRef.current) inputRef.current.value = '' }
  }

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${ACC(40, 'var(--border)')}`, background: ACC(5, 'var(--surface)'), padding: 12, marginBottom: 8, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => dinBuletin(e.target.files?.[0])} />
        <button type="button" disabled={incarc} onClick={() => inputRef.current?.click()} style={{ ...X.primar, display: 'inline-flex', alignItems: 'center', gap: 6 }}>📷 {incarc ? 'Se citește…' : 'Scanează buletinul'}</button>
        <span style={{ fontSize: 'var(--fs-xs)', color: info.startsWith('✓') ? 'var(--success)' : 'var(--text-muted)' }}>{info || 'sau completează manual'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {campuri.map(c => (
          <label key={c.key} style={X.lbl}>{c.label}
            <input value={val[c.key] || ''} onChange={e => set(c.key, e.target.value)} style={X.camp} /></label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onAnuleaza} style={X.ghost}>Anulează</button>
        <button disabled={!nume.trim() || busy} onClick={() => nume.trim() && onSalveaza(nume.trim(), val)} style={{ ...X.primar, opacity: nume.trim() && !busy ? 1 : 0.5 }}>{busy ? 'Se pregătește…' : 'Salvează — documentele apar singure'}</button>
      </div>
    </div>
  )
}

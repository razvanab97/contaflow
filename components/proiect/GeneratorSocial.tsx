'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'
import { printeazaDocxPdf } from '@/lib/docxPrint'
import DocLucruCard, { type DocLucru } from './DocLucruCard'
import { sabloaneBeneficiar, sabloaneActivitate, campuriComune, campuriBeneficiar, VALORI_IMPLICITE, TIP_LUCRU, type SablonCamp } from '@/lib/proiect-social-sabloane'

// Fabrica de documente a unei activități (strat premium – vezi proiect-theme.css .gsoc-*):
// setezi o dată datele comune (inclusiv data actelor), adaugi voluntari (din buletin), iar documentele
// se GENEREAZĂ singure, apar în „Registrul documentelor" și se actualizează în loc.

export interface Beneficiar { id: string; activitate_id: string; nume: string; date: Record<string, string>; created_at: string }
export interface DocGen { id: string; fisier_nume: string; fisier_tip: string | null; furnizor: string | null; tip_document: string | null; beneficiar_social_id: string | null; nr_inregistrare: number | null; data_document?: string | null; stare?: string | null; created_at: string }

const disp: React.CSSProperties = { fontFamily: 'var(--font-bricolage), var(--font-geist), system-ui, sans-serif' }
const mono: React.CSSProperties = { fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }
const GSOFT = (p: number) => `color-mix(in srgb, var(--accent-green) ${p}%, transparent)`
const S = {
  row: { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface)', marginTop: 9 } as React.CSSProperties,
  ghost: { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer', color: 'var(--text-secondary)' } as React.CSSProperties,
  solid: { fontSize: 'var(--fs-sm)', fontWeight: 700, borderRadius: 999, padding: '8px 16px', cursor: 'pointer' } as React.CSSProperties,
  word: { fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '7px 13px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', textDecoration: 'none', cursor: 'pointer' } as React.CSSProperties,
  pdf: { fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '7px 13px', borderRadius: 999, cursor: 'pointer' } as React.CSSProperties,
  ico: { width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 13 } as React.CSSProperties,
  camp: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px', fontSize: 'var(--fs-md)', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box' as const },
  lbl: { display: 'flex', flexDirection: 'column' as const, gap: 5, fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-muted)' },
  cap: { display: 'flex', alignItems: 'center', gap: 12, padding: '18px 0 10px' } as React.CSSProperties,
  capT: { ...disp, fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' },
  okPill: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' as const, padding: '4px 9px', borderRadius: 999, color: 'var(--accent-green)', background: GSOFT(13) },
}
const initiale = (n: string) => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
const azi = () => new Date().toISOString().slice(0, 10)
const roData = (iso?: string | null) => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : ''

export default function GeneratorSocial({ firmaId, activitateId, an, zona, dateDocumente, beneficiari, documente, onBeneficiar, onBeneficiarSters, onGenerat, onStergeDoc, onDateComune, disabled }: {
  firmaId: string; activitateId: string; an: number; zona: string; dateDocumente: Record<string, string>
  beneficiari: Beneficiar[]; documente: DocGen[]
  onBeneficiar: (b: Beneficiar) => void; onBeneficiarSters: (id: string) => void
  onGenerat: (d: DocGen) => void; onNrSchimbat?: (d: DocGen) => void; onStergeDoc?: (id: string) => void; onDateComune: (date: Record<string, string>) => void; disabled?: boolean
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
  // câmpuri comune încă necompletate (Perioada, Ore/program, Instruire…) — se cer în documente
  const comuneLipsa = useMemo(() => comune.filter(c => !(dateDocumente?.[c.key] || VALORI_IMPLICITE[c.key] || '').trim()), [comune, dateDocumente])
  const autoSetariRef = useRef(false)
  // deschide „Setări comune" singur prima dată când lipsesc câmpuri, ca să fie clar că se completează acolo
  useEffect(() => { if (!autoSetariRef.current && comuneLipsa.length) { autoSetariRef.current = true; setSetari(true) } }, [comuneLipsa.length])

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

  // comută starea documentului: emis ↔ în lucru (final vs. încă se lucrează)
  async function schimbaStare(doc: DocGen) {
    const nou = doc.stare === 'in_lucru' ? 'emis' : 'in_lucru'
    setBusy('s' + doc.id)
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'stare-doc', docId: doc.id, stare: nou }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (r.ok && d.document) onGenerat(d.document); else setMesaj(d.error || 'Nu s-a putut schimba starea')
  }

  useEffect(() => {
    if (autoRef.current || disabled || !sabAct.length) return
    const areComune = Object.values(dateDocumente || {}).some(v => v)
    const lipsesc = sabAct.filter(s => !documente.some(d => d.tip_document === s.tip && !d.beneficiar_social_id))
    if (areComune && lipsesc.length) { autoRef.current = true; lipsesc.forEach(s => void genereaza(s.tip, null, true)) }
  }, [documente, dateDocumente, sabAct, disabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cadrul „Documente oficiale" apare la ORICE activitate (chiar fără șabloane): acolo intră documentele
  // puse în lucru. Zonele cu șabloane (ex. 2.2) au în plus generarea automată + voluntarii.
  const areSabloane = sabBen.length > 0 || sabAct.length > 0

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
  const voluntarEdit = editeaza && editeaza !== 'nou' ? beneficiari.find(b => b.id === editeaza) : null

  // Registrul documentelor: Decizia + câte un contract per voluntar, ordonate după nr. de înregistrare.
  type Rand = { key: string; titlu: string; tip: string; benId: string | null; benef: Beneficiar | null; doc?: DocGen }
  const randuri: Rand[] = [
    ...sabAct.map(s => ({ key: 'a:' + s.tip, titlu: s.label, tip: s.tip, benId: null, benef: null })),
    ...beneficiari.flatMap(b => sabBen.map(s => ({ key: b.id + ':' + s.tip, titlu: `${s.label} — ${b.nume}`, tip: s.tip, benId: b.id, benef: b }))),
  ].map(r => ({ ...r, doc: docPentru(r.benId, r.tip) }))
    .sort((a, b) => (a.doc?.nr_inregistrare ?? 1e9) - (b.doc?.nr_inregistrare ?? 1e9))

  // documente „puse în lucru" dintr-un draft — apar în registru ca acte separate (nu dintr-un rând de șablon)
  const extra = documente.filter(d => d.tip_document === TIP_LUCRU)

  // avertizare de ordine: un document cu nr. mai mare nu ar trebui să aibă data mai devreme decât unul cu nr. mai mic
  const ordineGresita = new Set<string>()
  let maxDataDoc = ''
  for (const r of randuri) { const zi = r.doc?.data_document?.slice(0, 10); if (!zi) continue; if (maxDataDoc && zi < maxDataDoc) ordineGresita.add(r.doc!.id); else if (zi > maxDataDoc) maxDataDoc = zi }

  return (
    <div className="gsoc-panel" style={{ marginTop: 12, padding: 16 }}>
      {/* Antet */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <span style={{ fontSize: 17, color: 'var(--accent)', filter: 'drop-shadow(0 0 7px color-mix(in srgb, var(--accent) 45%, transparent))' }}>✦</span>
        <strong style={{ ...disp, fontSize: 'var(--fs-lg)', fontWeight: 700, letterSpacing: '-.01em', color: 'var(--text-primary)' }}>Documente oficiale</strong>
        {areSabloane && <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent)', padding: '3px 10px', borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>auto</span>}
        <span style={{ marginLeft: 'auto', ...mono, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>📅 {roData(dataCurenta)}</span>
      </div>

      {/* Setări comune */}
      {!!comune.length && (
        <div style={{ margin: '8px 0 2px' }}>
          <button onClick={() => setSetari(v => !v)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', width: '100%' }}>
            <span style={{ fontSize: 13 }}>⚙</span>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Setări comune</span>
            {comuneLipsa.length > 0 && <span title={`De completat: ${comuneLipsa.map(c => c.label).join(', ')}`} style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent-amber, #e0a84a)', background: 'color-mix(in srgb, var(--accent-amber, #e0a84a) 14%, transparent)', padding: '2px 8px', borderRadius: 999 }}>completează {comuneLipsa.length}</span>}
            {!setari && !comuneLipsa.length && chips.map(c => <span key={c.key} style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)' }}>{dateDocumente[c.key]}</span>)}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{setari ? '▴' : '▾'}</span>
          </button>
          {setari && <SetariComune campuri={comune} an={an} dataIni={dataCurenta} initial={dateDocumente} busy={busy === 'comune'} onSalveaza={salveazaComune} onInchide={() => setSetari(false)} />}
        </div>
      )}

      {/* Registrul documentelor */}
      <div style={S.cap}><span style={S.capT}>Registrul documentelor</span><span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-strong), transparent)' }} /><span style={{ ...mono, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{documente.length} {documente.length === 1 ? 'act emis' : 'acte emise'}</span></div>

      {randuri.length === 0 && extra.length === 0 && (
        <div style={{ ...S.row, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', justifyContent: 'center' }}>
          Niciun act încă. Pune un document „în lucru" (din „Drafturi standard", mai jos) ca să apară aici.
        </div>
      )}

      {randuri.map(r => {
        const seGen = r.benId ? busy === 'g' + r.benId : busy === 'g' + r.tip
        // câmpuri ale voluntarului încă goale, care apar în document (ex. telefon/e-mail) — de completat
        const lipsaBenef = r.benef ? campBen.filter(c => !String((c.key === 'NUME' ? r.benef!.nume : r.benef!.date?.[c.key]) || '').trim()) : []
        return (
          <div key={r.key} className="gsoc-row" style={S.row}>
            <span className="gsoc-node">
              {r.doc
                ? <input className="gsoc-nr" defaultValue={r.doc.nr_inregistrare ?? ''} inputMode="numeric" aria-label="Număr de înregistrare" title="Număr de înregistrare (editabil)"
                    onBlur={e => { const v = e.target.value.trim(); if (r.doc && v !== String(r.doc.nr_inregistrare ?? '')) regenNr(r.doc, v) }} />
                : <span className={'gsoc-dot' + (seGen ? ' w' : '')} />}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...disp, fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titlu}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 3 }}>
                {r.benef?.date?.CNP && <span style={{ ...mono, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>CNP {r.benef.date.CNP}</span>}
                {r.doc && (() => { const gresit = ordineGresita.has(r.doc!.id); return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <input type="date" key={r.doc!.id + ':' + (r.doc!.data_document || '')} defaultValue={(r.doc!.data_document || '').slice(0, 10)} max="2035-12-31"
                      onChange={e => { if (e.target.value) genereaza(r.tip, r.benId, false, { dataDoc: e.target.value }) }}
                      title="Data documentului — o poți schimba pentru fiecare act" aria-label={`Data documentului: ${r.titlu}`}
                      style={{ ...mono, fontSize: 'var(--fs-xs)', color: gresit ? 'var(--warning)' : 'var(--text-secondary)', background: 'var(--surface)', border: `1px solid ${gresit ? 'var(--warning)' : 'var(--border)'}`, borderRadius: 6, padding: '2px 6px', cursor: 'pointer' }} />
                    {gresit && <span title="Data e mai devreme decât a unui document cu număr mai mic — verifică ordinea" style={{ color: 'var(--warning)', fontSize: 'var(--fs-sm)', cursor: 'help' }}>⚠</span>}
                  </span>) })()}
                {r.doc ? (() => { const d = r.doc!, inLucru = d.stare === 'in_lucru', sb = busy === 's' + d.id
                  return <button onClick={() => schimbaStare(d)} disabled={sb} title="Apasă pentru a comuta: Emis ↔ În lucru"
                    style={{ ...S.okPill, ...(inLucru ? { color: 'var(--accent-amber, #e0a84a)', background: 'color-mix(in srgb, var(--accent-amber, #e0a84a) 15%, transparent)' } : {}), border: 'none', cursor: 'pointer', opacity: sb ? 0.5 : 1 }}>
                    <span className={'gsoc-dot' + (inLucru ? ' w' : '')} />{inLucru ? 'În lucru' : 'Emis'}</button> })()
                  : seGen ? <span style={{ ...S.okPill, color: 'var(--accent-amber, #e0a84a)', background: 'color-mix(in srgb, var(--accent-amber, #e0a84a) 13%, transparent)' }}><span className="gsoc-dot w" />se pregătește</span>
                  : <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>neîntocmit</span>}
                {r.benId && lipsaBenef.length > 0 && <button onClick={() => setEditeaza(r.benId)} title={`De completat în document: ${lipsaBenef.map(c => c.label).join(', ')}`} style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent-amber, #e0a84a)', background: 'color-mix(in srgb, var(--accent-amber, #e0a84a) 14%, transparent)', border: 'none', padding: '3px 9px', borderRadius: 999, cursor: 'pointer' }}>completează {lipsaBenef.length <= 2 ? lipsaBenef.map(c => c.label.toLowerCase()).join(', ') : `${lipsaBenef.length} câmpuri`}</button>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
              {r.benId && <button onClick={() => setEditeaza(r.benId)} title="Editează voluntarul" aria-label={`Editează ${r.benef?.nume}`} style={S.ico}>✎</button>}
              {r.benId && <button onClick={() => r.benef && stergeBenef(r.benef)} title="Șterge voluntarul" aria-label={`Șterge ${r.benef?.nume}`} style={{ ...S.ico, fontSize: 15 }}>×</button>}
              {r.doc ? (
                <ActiuniDoc doc={r.doc} urlDoc={urlDoc} />
              ) : (
                <button disabled={disabled || seGen} onClick={() => genereaza(r.tip, r.benId)} style={{ ...S.word, color: 'var(--accent)' }}>{seGen ? 'se pregătește…' : 'pregătește'}</button>
              )}
            </div>
          </div>
        )
      })}

      {/* Documente puse în lucru dintr-un draft (ex. Raport anual) — card separat, cu „Pregătește" + zonă de completat */}
      {extra.map(d => (
        <div key={d.id} style={{ marginTop: 9 }}>
          <DocLucruCard firmaId={firmaId} api={api} doc={d as unknown as DocLucru}
            onActualizat={nd => onGenerat(nd as unknown as DocGen)} onSters={id => onStergeDoc?.(id)} disabled={disabled} />
        </div>
      ))}

      {/* Voluntari */}
      {!!sabBen.length && (
        <div style={{ marginTop: 6 }}>
          <div style={S.cap}><span style={S.capT}>Voluntari</span><span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-strong), transparent)' }} /><span style={{ ...mono, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{beneficiari.length}{dateDocumente?.NR_VOLUNTARI ? ` / ${dateDocumente.NR_VOLUNTARI}` : ''}</span></div>

          {editeaza === 'nou'
            ? <FormBeneficiar campuri={campBen} firmaId={firmaId} busy={busy === 'benef'} onAnuleaza={() => setEditeaza(null)} onSalveaza={(n, dd) => salveazaBenef(null, n, dd)} />
            : voluntarEdit
              ? <FormBeneficiar campuri={campBen} firmaId={firmaId} busy={busy === 'benef'} initial={{ NUME: voluntarEdit.nume, ...voluntarEdit.date }} onAnuleaza={() => setEditeaza(null)} onSalveaza={(n, dd) => salveazaBenef(voluntarEdit.id, n, dd)} />
              : (
                <button disabled={disabled} onClick={() => setEditeaza('nou')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 15, width: '100%', textAlign: 'left', borderRadius: 'var(--r-md)', border: '1px solid color-mix(in srgb, var(--accent) 22%, var(--border))', background: 'linear-gradient(120deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent)', cursor: 'pointer' }}>
                  <span className="gsoc-solid" style={{ width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center', fontSize: 19, flexShrink: 0 }}>📷</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ ...disp, display: 'block', fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--text-primary)' }}>Înregistrează un voluntar</span>
                    <span style={{ display: 'block', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2 }}>Scanează buletinul — datele și contractul se întocmesc singure.</span>
                  </span>
                </button>
              )}
        </div>
      )}
      {mesaj && <div style={{ marginTop: 8, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{mesaj}</div>}
    </div>
  )
}

// Vezi / Word / PDF pentru un document.
function ActiuniDoc({ doc, urlDoc }: { doc: DocGen; urlDoc: (id: string, p?: boolean) => string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <button onClick={() => deschideDocument(urlDoc(doc.id, true), doc.fisier_nume)} style={S.ico} title="Vezi">👁</button>
      <a href={urlDoc(doc.id)} style={S.word} title="Descarcă Word (editabil)">Word</a>
      <button className="gsoc-solid" onClick={() => printeazaDocxPdf(urlDoc(doc.id), doc.fisier_nume)} style={S.pdf} title="PDF (pregătit de semnare)">PDF</button>
    </span>
  )
}

// Setări comune: data actelor (calendar) + câmpurile comune.
function SetariComune({ campuri, an, dataIni, initial, busy, onSalveaza, onInchide }: { campuri: SablonCamp[]; an: number; dataIni: string; initial: Record<string, string>; busy: boolean; onSalveaza: (d: Record<string, string>) => void; onInchide: () => void }) {
  const [val, setVal] = useState<Record<string, string>>(() => ({ AN: String(an), ...VALORI_IMPLICITE, ...initial, DATA: dataIni }))
  const set = (k: string, v: string) => setVal(p => ({ ...p, [k]: v }))
  return (
    <div style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface)', padding: 12, marginTop: 8, display: 'grid', gap: 10 }}>
      <label style={{ ...S.lbl, maxWidth: 220 }}>📅 Data actelor
        <input type="date" value={val.DATA || ''} onChange={e => set('DATA', e.target.value)} style={S.camp} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {campuri.map(c => (
          <label key={c.key} style={S.lbl}>{c.label}
            <input value={val[c.key] || ''} onChange={e => set(c.key, e.target.value)} style={S.camp} /></label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onInchide} style={S.ghost}>Anulează</button>
        <button className="gsoc-solid" disabled={busy} onClick={() => onSalveaza(val)} style={S.solid}>{busy ? 'Se salvează…' : 'Salvează setările'}</button>
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
    <div style={{ borderRadius: 'var(--r-md)', border: '1px solid color-mix(in srgb, var(--accent) 40%, var(--border))', background: 'color-mix(in srgb, var(--accent) 5%, var(--surface))', padding: 13, marginTop: 4, display: 'grid', gap: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => dinBuletin(e.target.files?.[0])} />
        <button type="button" className="gsoc-solid" disabled={incarc} onClick={() => inputRef.current?.click()} style={{ ...S.solid, display: 'inline-flex', alignItems: 'center', gap: 6 }}>📷 {incarc ? 'Se citește…' : 'Scanează buletinul'}</button>
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
        <button className="gsoc-solid" disabled={!nume.trim() || busy} onClick={() => nume.trim() && onSalveaza(nume.trim(), val)} style={{ ...S.solid, opacity: nume.trim() && !busy ? 1 : 0.5 }}>{busy ? 'Se pregătește…' : 'Salvează — documentele apar singure'}</button>
      </div>
    </div>
  )
}

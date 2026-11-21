'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'
import {
  ANI_PROIECT, ETICHETA_STATUS, STATUSURI_ACT, ETICHETA_STARE,
  stareaZonei, indicatorZona, rezumatAn, TIPURI_DOC_ACT, etichetaDocAct,
  zoneOrdonate, reordoneaza,
  type Activitate, type StareZonaRow, type StatusAct, type StareZona, type OrdineRow,
} from '@/lib/proiect-social'
import { getSablon, sabloanePentruZona } from '@/lib/proiect-social-sabloane'
import GeneratorSocial, { type Beneficiar, type DocGen } from './GeneratorSocial'

// Modulul „Activități sociale": fiecare zonă (activitate din plan) e o linie în care se adaugă
// activități (AS-NNN/AN) și documente. Indicatorul se mișcă doar din activitățile VALIDATE.

interface Doc { id: string; fisier_nume: string; fisier_tip: string | null; fisier_marime: number | null; furnizor: string | null; tip_document: string | null; activitate_sociala_id: string | null; beneficiar_social_id?: string | null; nr_inregistrare?: number | null; data_document?: string | null; stare?: string | null; zona_sociala?: string | null; an_social?: number | null; created_at: string }

const camp: React.CSSProperties = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 9px', fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }
const btnGhost: React.CSSProperties = { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '5px 9px', cursor: 'pointer', color: 'var(--text-secondary)' }
const linkBtn: React.CSSProperties = { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'none' }
// font cu caracter (Bricolage) pentru titluri/cifre, ca în fabrica de documente — aspect premium pe toată pagina
const disp: React.CSSProperties = { fontFamily: 'var(--font-bricolage), var(--font-geist), system-ui, sans-serif' }
const gradText: React.CSSProperties = { ...disp, color: 'transparent', backgroundImage: 'linear-gradient(135deg, var(--accent-mint, var(--accent)), var(--accent-blue, var(--accent)))', WebkitBackgroundClip: 'text', backgroundClip: 'text' }
const previzualizabil = (d: Doc) => /pdf|image/.test(d.fisier_tip || '') || /\.(pdf|jpe?g|png|webp)$/i.test(d.fisier_nume)
const culoareStare: Record<StareZona, string> = { deschisa: 'var(--success)', inchisa_pe_an: 'var(--accent-blue)', inchisa_definitiv: 'var(--text-muted)' }

export default function ActivitatiSociale({ firmaId }: { firmaId: string }) {
  const [acts, setActs] = useState<Activitate[]>([])
  const [stari, setStari] = useState<StareZonaRow[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [docsZona, setDocsZona] = useState<Doc[]>([]) // documente atașate direct unei zone (fără activitate)
  const [an, setAn] = useState<number>(() => { const y = new Date().getFullYear(); return (ANI_PROIECT as readonly number[]).includes(y) ? y : 2026 })
  const [incarcat, setIncarcat] = useState(false)
  const [migrat, setMigrat] = useState(true)
  const [deschise, setDeschise] = useState<Set<string>>(new Set())
  const [formZona, setFormZona] = useState<string | null>(null)
  const [ordine, setOrdine] = useState<OrdineRow[]>([])
  const [beneficiari, setBeneficiari] = useState<Beneficiar[]>([])
  const [urmatorNr, setUrmatorNr] = useState(1)
  const [mesaj, setMesaj] = useState('')

  useEffect(() => {
    fetch(`/api/proiect-social?firmaId=${encodeURIComponent(firmaId)}`).then(r => r.json())
      .then(d => { setActs(d.activitati || []); setStari(d.zoneStari || []); setDocs(d.documente || []); setDocsZona(d.documenteZona || []); setOrdine(d.zoneOrdine || []); setBeneficiari(d.beneficiari || []); setUrmatorNr(d.urmatorNr || 1); setMigrat(d.migrat !== false) })
      .catch(() => setMesaj('Datele nu s-au putut încărca')).finally(() => setIncarcat(true))
  }, [firmaId])

  const nrUrmator = (docs: { nr_inregistrare?: number | null }[]) => Math.max(0, ...docs.map(d => d.nr_inregistrare || 0)) + 1

  const rez = useMemo(() => rezumatAn(acts, stari, an), [acts, stari, an])
  const zoneSortate = useMemo(() => zoneOrdonate(ordine), [ordine])
  const api = `/api/proiect-social?firmaId=${encodeURIComponent(firmaId)}`

  // Mută o zonă mai sus / mai jos (prioritate) și salvează ordinea întreagă.
  async function muta(cod: string, directie: 'sus' | 'jos') {
    const noua = reordoneaza(zoneSortate.map(z => z.cod), cod, directie)
    setOrdine(noua.map((zona, i) => ({ zona, ordine: i })))
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'ordine-zona', ordine: noua }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setMesaj(d.error || 'Ordinea nu s-a putut salva')
  }

  const toggle = (cod: string) => setDeschise(prev => { const n = new Set(prev); n.has(cod) ? n.delete(cod) : n.add(cod); return n })

  async function creeaza(zona: string, campuri: Record<string, string>) {
    setMesaj('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, zona, an, ...campuri }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMesaj(d.error || 'Activitatea nu s-a putut crea'); return }
    setActs(prev => [d.activitate, ...prev]); setFormZona(null)
    setDeschise(prev => new Set(prev).add(zona))
  }
  async function modifica(id: string, patch: Record<string, unknown>) {
    const vechi = acts
    setActs(prev => prev.map(a => a.id === id ? { ...a, ...patch } as Activitate : a))
    const r = await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, id, ...patch }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setActs(vechi); setMesaj(d.error || 'Modificarea nu s-a salvat'); return }
    setActs(prev => prev.map(a => a.id === id ? d.activitate : a))
  }
  async function stergeAct(a: Activitate) {
    if (!confirm(`Ștergi activitatea „${a.denumire}" (${a.cod})? Se șterg și documentele ei. Nu se mai poate recupera.`)) return
    const r = await fetch(`${api}&id=${a.id}`, { method: 'DELETE' })
    if (r.ok) { setActs(prev => prev.filter(x => x.id !== a.id)); setDocs(prev => prev.filter(x => x.activitate_sociala_id !== a.id)) }
    else setMesaj('Activitatea nu s-a putut șterge')
  }
  async function schimbaStare(zona: string, status: StareZona) {
    setMesaj('')
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'stare-zona', zona, an, status }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMesaj(d.error || 'Starea nu s-a putut schimba'); return }
    setStari(prev => {
      const rest = prev.filter(s => !(s.zona === zona && s.an === an))
      return [...rest, { zona, an, status }]
    })
  }

  // Generator: beneficiari + documente generate (din șabloane) + numere de înregistrare
  const upsertBenef = (b: Beneficiar) => setBeneficiari(prev => prev.some(x => x.id === b.id) ? prev.map(x => x.id === b.id ? b : x) : [...prev, b])
  const removeBenef = (id: string) => setBeneficiari(prev => prev.filter(x => x.id !== id))
  // la regenerare, API-ul poate întoarce documentul fără „stare" (coloana nu intră în select-ul de generare) — păstrăm starea curentă din UI
  const addGenerat = (d: DocGen) => { setDocs(prev => { const e = d as unknown as Doc; return prev.some(x => x.id === e.id) ? prev.map(x => x.id === e.id ? { ...e, stare: e.stare ?? x.stare } : x) : [e, ...prev] }); setUrmatorNr(u => Math.max(u, (d.nr_inregistrare || 0) + 1)) }
  const updateNr = (d: DocGen) => setDocs(prev => { const next = prev.map(x => x.id === d.id ? { ...x, nr_inregistrare: d.nr_inregistrare } : x); setUrmatorNr(nrUrmator(next)); return next })
  const updateDateComune = (id: string, date: Record<string, string>) => setActs(prev => prev.map(x => x.id === id ? { ...x, date_documente: date } : x))
  const addDocsZona = (ds: Doc[]) => setDocsZona(prev => [...ds, ...prev])
  const removeDocZona = (id: string) => setDocsZona(prev => prev.filter(x => x.id !== id))

  if (!incarcat) return <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-md)' }}>Se încarcă…</div>

  return (
    <div>
      {!migrat && (
        <div style={{ border: '1px solid var(--warning)', background: 'var(--warning-soft, var(--surface))', borderRadius: 'var(--r-md)', padding: '10px 12px', marginBottom: 14, fontSize: 'var(--fs-sm)', color: 'var(--text-primary)' }}>
          Modulul are nevoie de tabelele din <strong>supabase_activitati_sociale.sql</strong>. Rulează migrarea în Supabase, apoi reîncarcă pagina.
        </div>
      )}

      {/* Selector an + rezumat */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>An</span>
        {ANI_PROIECT.map(y => (
          <button key={y} onClick={() => setAn(y)} style={{ ...btnGhost, ...(y === an ? { ...disp, color: 'var(--text-primary)', fontWeight: 700, border: '1px solid color-mix(in srgb, var(--accent) 50%, var(--border))', background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))' } : {}) }}>{y}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { k: 'Activități', v: `${rez.activitatiTotal}` },
          { k: 'Validate', v: `${rez.activitatiValidate}` },
          { k: 'De validat', v: `${rez.deValidat}`, warn: rez.deValidat > 0 },
          { k: 'Ținte atinse', v: `${rez.tinteAtinse}/${rez.zoneCuTinta}` },
        ].map(t => (
          <div key={t.k} style={{ position: 'relative', border: '1px solid color-mix(in srgb, var(--accent) 16%, var(--border))', borderRadius: 'var(--r-md)', background: 'linear-gradient(160deg, color-mix(in srgb, var(--accent) 7%, var(--surface)), var(--surface))', padding: '13px 14px', overflow: 'hidden', boxShadow: 'var(--pa-card-shadow, none)' }}>
            <div style={{ ...(t.warn ? { ...disp, color: 'var(--warning)' } : gradText), fontSize: 'var(--fs-2xl)', fontWeight: 800, lineHeight: 1.05 }}>{t.v}</div>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 4 }}>{t.k}</div>
          </div>
        ))}
      </div>

      {/* Zonele */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {zoneSortate.map((z, zi) => {
          const stare = stareaZonei(stari, z.cod, an)
          const ind = indicatorZona(acts, z, an)
          const aleZonei = acts.filter(a => a.zona === z.cod && a.an === an)
          const open = deschise.has(z.cod)
          const definitiv = stare === 'inchisa_definitiv'
          return (
            <div key={z.cod} style={{ border: `1px solid ${open ? 'color-mix(in srgb, var(--accent) 26%, var(--border))' : 'var(--border)'}`, borderRadius: 'var(--r-lg)', background: open ? 'linear-gradient(170deg, color-mix(in srgb, var(--accent) 5%, var(--surface)), var(--surface))' : 'var(--surface)', opacity: definitiv ? 0.7 : 1, boxShadow: open ? 'var(--pa-card-shadow, none)' : 'none', transition: 'border-color .2s, background .2s' }}>
              {/* Antet zonă - click oriunde pe el (în afara controalelor) deschide/închide zona */}
              <div onClick={() => toggle(z.cod)} data-zona={z.cod}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, flexWrap: 'wrap', cursor: 'pointer' }}>
                {/* Prioritate: mută zona mai sus / mai jos */}
                <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, marginTop: -1 }}>
                  <button onClick={e => { e.stopPropagation(); muta(z.cod, 'sus') }} disabled={zi === 0} title="Mută mai sus (prioritate)" aria-label={`Mută „${z.titlu}" mai sus`}
                    style={{ ...linkBtn, color: zi === 0 ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: zi === 0 ? 0.4 : 1, lineHeight: 1, fontSize: 'var(--fs-sm)' }}>▲</button>
                  <button onClick={e => { e.stopPropagation(); muta(z.cod, 'jos') }} disabled={zi === zoneSortate.length - 1} title="Mută mai jos" aria-label={`Mută „${z.titlu}" mai jos`}
                    style={{ ...linkBtn, color: zi === zoneSortate.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: zi === zoneSortate.length - 1 ? 0.4 : 1, lineHeight: 1, fontSize: 'var(--fs-sm)' }}>▼</button>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    {/* titlul e butonul accesibil de deschidere/închidere; tot antetul reacționează la click (vezi div-ul părinte) */}
                    <button onClick={e => { e.stopPropagation(); toggle(z.cod) }} aria-expanded={open} aria-label={`${open ? 'Restrânge' : 'Extinde'} ${z.titlu}`}
                      style={{ ...disp, fontSize: 'var(--fs-md)', fontWeight: 700, letterSpacing: '-.01em', color: 'var(--text-primary)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>{z.nr}. {z.titlu}</button>
                    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: culoareStare[stare] }}>· {stare === 'inchisa_pe_an' ? `Închisă pe ${an}` : ETICHETA_STARE[stare]}</span>
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2 }}>Țintă: {z.tintaText}</div>
                  {/* Indicator */}
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {z.indicator}: <span style={{ color: 'var(--text-primary)' }}>{ind.realizat}{z.tinta != null ? ` / ${z.tinta}` : ''}</span> {ind.unitate}
                    </span>
                    {z.tinta != null && (
                      <span style={{ flex: 1, minWidth: 90, height: 7, background: 'var(--surface-sunken)', borderRadius: 999, overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${ind.procent || 0}%`, borderRadius: 999, background: (ind.procent || 0) >= 100 ? 'var(--success)' : 'linear-gradient(90deg, var(--accent-mint, var(--accent)), var(--accent-blue, var(--accent)))', transition: 'width .4s ease' }} />
                      </span>
                    )}
                    {z.tinta != null && <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: (ind.procent || 0) >= 100 ? 'var(--success)' : 'var(--text-muted)' }}>{ind.procent || 0}%</span>}
                    {z.continua && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>activitate continuă</span>}
                  </div>
                </div>
                {/* Ciclu de viață */}
                <select value={definitiv ? 'inchisa_definitiv' : stare} aria-label={`Starea zonei ${z.nr} pe ${an}`}
                  onClick={e => e.stopPropagation()}
                  onChange={e => schimbaStare(z.cod, e.target.value as StareZona)}
                  style={{ ...camp, padding: '4px 6px', fontSize: 'var(--fs-xs)', flexShrink: 0 }}>
                  <option value="deschisa">Deschisă</option>
                  <option value="inchisa_pe_an">Închisă pe {an}</option>
                  <option value="inchisa_definitiv">Închisă definitiv</option>
                </select>
              </div>

              {open && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 14 }}>
                  {aleZonei.length === 0 && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginBottom: 10 }}>Nicio activitate pe {an} în această zonă.</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {aleZonei.map(a => (
                      <RandActivitate key={a.id} a={a} docs={docs.filter(d => d.activitate_sociala_id === a.id)} firmaId={firmaId}
                        bazaBeneficiari={z.baza === 'beneficiari'} unitate={z.unitate} zona={z.cod}
                        beneficiari={beneficiari.filter(b => b.activitate_id === a.id)} urmatorNr={urmatorNr}
                        onModifica={modifica} onSterge={() => stergeAct(a)}
                        onDocNou={nd => setDocs(prev => [...nd, ...prev])} onDocSters={id => setDocs(prev => prev.filter(d => d.id !== id))}
                        onBeneficiar={upsertBenef} onBeneficiarSters={removeBenef} onGenerat={addGenerat} onNrSchimbat={updateNr}
                        onDateComune={updateDateComune} />
                    ))}
                  </div>

                  <DocumenteZona firmaId={firmaId} zona={z.cod} an={an} api={api}
                    sabloane={sabloanePentruZona(z.cod).map(s => ({ tip: s.tip, label: s.label }))}
                    docs={docsZona.filter(d => d.zona_sociala === z.cod && (d.an_social == null || d.an_social === an))}
                    onAdaugat={addDocsZona} onSters={removeDocZona} disabled={definitiv} />

                  {formZona === z.cod
                    ? <FormActivitate onAnuleaza={() => setFormZona(null)} onSalveaza={c => creeaza(z.cod, c)} />
                    : !definitiv && <button onClick={() => setFormZona(z.cod)} style={{ ...linkBtn, color: 'var(--accent)', marginTop: 10 }}>+ Activitate nouă</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {mesaj && <div style={{ marginTop: 12, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{mesaj}</div>}
    </div>
  )
}

// --- O activitate (rând) ---------------------------------------------------------------------
function RandActivitate({ a, docs, firmaId, bazaBeneficiari, unitate, zona, beneficiari, urmatorNr, onModifica, onSterge, onDocNou, onDocSters, onBeneficiar, onBeneficiarSters, onGenerat, onNrSchimbat, onDateComune }: {
  a: Activitate; docs: Doc[]; firmaId: string; bazaBeneficiari: boolean; unitate: string; zona: string
  beneficiari: Beneficiar[]; urmatorNr: number
  onModifica: (id: string, patch: Record<string, unknown>) => void; onSterge: () => void
  onDocNou: (d: Doc[]) => void; onDocSters: (id: string) => void
  onBeneficiar: (b: Beneficiar) => void; onBeneficiarSters: (id: string) => void
  onGenerat: (d: DocGen) => void; onNrSchimbat: (d: DocGen) => void
  onDateComune: (id: string, date: Record<string, string>) => void
}) {
  // documentele generate din șabloane (au tip_document cunoscut) vs. cele atașate manual
  const docManual = docs.filter(d => !getSablon(d.tip_document))
  const docGenerate = docs.filter(d => getSablon(d.tip_document)) as unknown as DocGen[]
  const areGenerator = sabloanePentruZona(zona).length > 0
  const [extins, setExtins] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tipDoc, setTipDoc] = useState<string>('dovada')
  const inputRef = useRef<HTMLInputElement>(null)
  const api = `/api/proiect-social?firmaId=${encodeURIComponent(firmaId)}`
  const urlDoc = (d: Doc, preview = false) => `${api}&download=${d.id}${preview ? '&preview=1' : ''}`

  async function incarca(files: File[]) {
    if (!files.length) return
    setBusy(true)
    try {
      const r = await fetch(api, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, activitateId: a.id, fisiere: files.map(f => ({ nume: f.name, tip: f.type, marime: f.size })) }) })
      const d = await r.json().catch(() => ({}))
      const incarcate: { path: string; nume: string; tip: string; marime: number }[] = []
      await Promise.all((d.fisiere || []).map(async (x: { nume: string; path?: string; url?: string; eroare?: string }, i: number) => {
        if (x.eroare || !x.url || !x.path) return
        const f = files[i]
        const up = await fetch(x.url, { method: 'PUT', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f }).catch(() => null)
        if (up?.ok) incarcate.push({ path: x.path, nume: f.name, tip: f.type, marime: f.size })
      }))
      if (incarcate.length) {
        const r2 = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'inregistreaza-doc', activitateId: a.id, tip: tipDoc, incarcate }) })
        const d2 = await r2.json().catch(() => ({}))
        if (d2.documente?.length) onDocNou(d2.documente)
      }
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  async function stergeDoc(d: Doc) {
    if (!confirm(`Ștergi documentul „${d.fisier_nume}"?`)) return
    const r = await fetch(`${api}&doc=${d.id}`, { method: 'DELETE' })
    if (r.ok) onDocSters(d.id)
  }

  const culoareStatus: Record<StatusAct, string> = { planificata: 'var(--text-muted)', in_desfasurare: 'var(--accent)', finalizata: 'var(--warning)', validata: 'var(--success)' }

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', background: 'var(--surface-sunken)', padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setExtins(v => !v)} aria-expanded={extins} style={{ ...linkBtn, color: 'var(--text-muted)' }}>{extins ? '▾' : '▸'}</button>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{a.cod}</span>
        <input defaultValue={a.denumire} aria-label="Denumire activitate"
          onBlur={e => { const v = e.target.value.trim(); if (v && v !== a.denumire) onModifica(a.id, { denumire: v }); else e.target.value = a.denumire }}
          style={{ ...camp, flex: 1, minWidth: 120, fontWeight: 600 }} />
        <select value={a.status} onChange={e => onModifica(a.id, { status: e.target.value })} aria-label="Status activitate"
          style={{ ...camp, padding: '4px 6px', fontSize: 'var(--fs-xs)', fontWeight: 700, color: culoareStatus[a.status] }}>
          {STATUSURI_ACT.map(s => <option key={s} value={s}>{ETICHETA_STATUS[s]}</option>)}
        </select>
        {!!docs.length && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>📎 {docs.length}</span>}
        <button onClick={onSterge} title="Șterge activitatea" aria-label={`Șterge ${a.cod}`} style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-base)' }}>×</button>
      </div>

      {extins && (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {/* Fabrica de documente - vizibilă sus (doar la zonele cu șabloane) */}
          <GeneratorSocial firmaId={firmaId} activitateId={a.id} an={a.an} zona={zona} dateDocumente={a.date_documente || {}}
            beneficiari={beneficiari} documente={docGenerate}
            onBeneficiar={onBeneficiar} onBeneficiarSters={onBeneficiarSters} onGenerat={onGenerat} onNrSchimbat={onNrSchimbat}
            onDateComune={date => onDateComune(a.id, date)} />

          {/* Detalii activitate - strânse când zona are generator, ca să nu încarce */}
          <details open={!areGenerator}>
            <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)', padding: '2px 0' }}>Detalii activitate</summary>
            <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                <label style={lblCol}>Perioada
                  <input defaultValue={a.perioada || ''} placeholder="ex. martie 2026" onBlur={e => onModifica(a.id, { perioada: e.target.value.trim() })} style={camp} /></label>
                <label style={lblCol}>Responsabil
                  <input defaultValue={a.responsabil || ''} onBlur={e => onModifica(a.id, { responsabil: e.target.value.trim() })} style={camp} /></label>
                <label style={lblCol}>Parteneri
                  <input defaultValue={a.parteneri || ''} placeholder="AJOFM, DGASPC, Școala…" onBlur={e => onModifica(a.id, { parteneri: e.target.value.trim() })} style={camp} /></label>
                <label style={lblCol}>Beneficiari estimați
                  <input type="number" min={0} defaultValue={a.beneficiari_estimat ?? ''} onBlur={e => onModifica(a.id, { beneficiari_estimat: e.target.value })} style={camp} /></label>
                {bazaBeneficiari && (
                  <label style={lblCol}>Beneficiari realizați ({unitate}) · contează la indicator
                    <input type="number" min={0} defaultValue={a.beneficiari_realizat ?? ''} onBlur={e => onModifica(a.id, { beneficiari_realizat: e.target.value })} style={camp} /></label>
                )}
              </div>
              <label style={lblCol}>Obiectiv
                <textarea defaultValue={a.obiectiv || ''} rows={2} onBlur={e => onModifica(a.id, { obiectiv: e.target.value.trim() })} style={{ ...camp, resize: 'vertical' }} /></label>
              <label style={lblCol}>Rezultate (pentru procesul-verbal final)
                <textarea defaultValue={a.rezultate || ''} rows={2} placeholder="Ce s-a realizat efectiv…" onBlur={e => onModifica(a.id, { rezultate: e.target.value.trim() })} style={{ ...camp, resize: 'vertical' }} /></label>

              {/* Documente atașate manual */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <strong style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Documente atașate</strong>
                  <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                    Tip
                    <select value={tipDoc} onChange={e => setTipDoc(e.target.value)} style={{ ...camp, padding: '3px 6px', fontSize: 'var(--fs-xs)' }}>
                      {TIPURI_DOC_ACT.map(t => <option key={t.tip} value={t.tip}>{t.label}</option>)}
                    </select>
                  </label>
                  <input ref={inputRef} type="file" multiple accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={e => incarca(Array.from(e.target.files || []))} />
                  <button onClick={() => inputRef.current?.click()} disabled={busy} style={{ ...linkBtn, color: 'var(--accent)' }}>{busy ? 'Se încarcă…' : '+ Adaugă document'}</button>
                </div>
                {docManual.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 'var(--fs-sm)' }}>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{etichetaDocAct(d.tip_document)}</span>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fisier_nume}</span>
                    {previzualizabil(d) && <button onClick={() => deschideDocument(urlDoc(d, true), d.fisier_nume)} style={{ ...linkBtn, color: 'var(--accent)' }}>Vezi</button>}
                    <a href={urlDoc(d)} style={{ ...linkBtn, color: 'var(--accent-blue)' }}>Descarcă</a>
                    <button onClick={() => stergeDoc(d)} title="Șterge documentul" aria-label={`Șterge ${d.fisier_nume}`} style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-base)' }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

const lblCol: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }

// --- Formular activitate nouă ----------------------------------------------------------------
function FormActivitate({ onSalveaza, onAnuleaza }: { onSalveaza: (c: Record<string, string>) => void; onAnuleaza: () => void }) {
  const [denumire, setDenumire] = useState('')
  const [perioada, setPerioada] = useState('')
  const [obiectiv, setObiectiv] = useState('')
  const [beneficiari, setBeneficiari] = useState('')
  const [responsabil, setResponsabil] = useState('')
  const [parteneri, setParteneri] = useState('')
  return (
    <div style={{ border: '1px solid var(--accent)', borderRadius: 'var(--r-md)', background: 'var(--surface)', padding: 12, marginTop: 10, display: 'grid', gap: 8 }}>
      <input autoFocus value={denumire} onChange={e => setDenumire(e.target.value)} placeholder="Denumirea activității *" style={{ ...camp, fontWeight: 600 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <input value={perioada} onChange={e => setPerioada(e.target.value)} placeholder="Perioada (ex. martie 2026)" style={camp} />
        <input value={responsabil} onChange={e => setResponsabil(e.target.value)} placeholder="Responsabil" style={camp} />
        <input value={parteneri} onChange={e => setParteneri(e.target.value)} placeholder="Parteneri" style={camp} />
        <input type="number" min={0} value={beneficiari} onChange={e => setBeneficiari(e.target.value)} placeholder="Beneficiari estimați" style={camp} />
      </div>
      <textarea value={obiectiv} onChange={e => setObiectiv(e.target.value)} rows={2} placeholder="Obiectivul urmărit" style={{ ...camp, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onAnuleaza} style={btnGhost}>Anulează</button>
        <button onClick={() => denumire.trim() && onSalveaza({ denumire, perioada, obiectiv, beneficiari_estimat: beneficiari, responsabil, parteneri })}
          disabled={!denumire.trim()} style={{ ...btnGhost, color: 'var(--accent)', border: '1px solid var(--accent)', opacity: denumire.trim() ? 1 : 0.5 }}>Creează activitate</button>
      </div>
    </div>
  )
}

// --- Documente atașate direct unei zone (fără activitate) ----------------------------------------
// „Adaugă document" pe o zonă: încarci un fișier (Word/PDF/imagine) legat de zonă + an, fără să creezi o activitate.
function DocumenteZona({ firmaId, zona, an, api, docs, sabloane, onAdaugat, onSters, disabled }: {
  firmaId: string; zona: string; an: number; api: string; docs: Doc[]; sabloane: { tip: string; label: string }[]
  onAdaugat: (ds: Doc[]) => void; onSters: (id: string) => void; disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const [meniu, setMeniu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const urlDoc = (d: Doc, preview = false) => `${api}&download=${d.id}${preview ? '&preview=1' : ''}`

  // generează un document editabil dintr-un șablon (draft) existent al zonei, direct în sistem
  async function genereazaSablon(tip: string) {
    setMeniu(false); setBusy(true); setMesaj('')
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'genereaza-zona', zona, an, tip }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.document) onAdaugat([d.document]); else setMesaj(d.error || 'Nu s-a putut genera documentul')
    } catch { setMesaj('Generarea a eșuat') } finally { setBusy(false) }
  }

  async function incarca(files: File[]) {
    if (!files.length) return
    setBusy(true); setMesaj('')
    try {
      const r = await fetch(api, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, zona, an, fisiere: files.map(f => ({ nume: f.name, tip: f.type, marime: f.size })) }) })
      const d = await r.json().catch(() => ({}))
      const incarcate: { path: string; nume: string; tip: string; marime: number }[] = []
      await Promise.all((d.fisiere || []).map(async (x: { nume: string; path?: string; url?: string; eroare?: string }, i: number) => {
        if (x.eroare || !x.url || !x.path) return
        const f = files[i]
        const up = await fetch(x.url, { method: 'PUT', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f }).catch(() => null)
        if (up?.ok) incarcate.push({ path: x.path, nume: f.name, tip: f.type, marime: f.size })
      }))
      if (incarcate.length) {
        const r2 = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'inregistreaza-doc', zona, an, incarcate }) })
        const d2 = await r2.json().catch(() => ({}))
        if (d2.documente?.length) onAdaugat(d2.documente)
        if (d2.erori?.length) setMesaj(d2.erori[0]); else if (!d2.documente?.length) setMesaj(d2.error || 'Documentul nu s-a putut înregistra')
      } else setMesaj('Fișierul nu s-a putut încărca')
    } catch { setMesaj('Încărcarea a eșuat') } finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  async function stergeDoc(d: Doc) {
    if (!confirm(`Ștergi documentul „${d.fisier_nume}"?`)) return
    const r = await fetch(`${api}&doc=${d.id}`, { method: 'DELETE' })
    if (r.ok) onSters(d.id)
  }

  return (
    <div style={{ marginTop: 10 }}>
      {docs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {docs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
              <span aria-hidden style={{ fontSize: 13 }}>📄</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fisier_nume}</span>
              {previzualizabil(d) && <button onClick={() => deschideDocument(urlDoc(d, true), d.fisier_nume)} style={{ ...linkBtn, color: 'var(--accent)' }}>Vezi</button>}
              <a href={urlDoc(d)} title="Descarcă" style={{ ...linkBtn, color: 'var(--accent)' }}>↓</a>
              <button onClick={() => stergeDoc(d)} title="Șterge documentul" aria-label={`Șterge ${d.fisier_nume}`} style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-base)' }}>×</button>
            </div>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" multiple accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={e => incarca(Array.from(e.target.files || []))} />
      {!disabled && (sabloane.length ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button onClick={() => setMeniu(v => !v)} disabled={busy} aria-expanded={meniu} style={{ ...linkBtn, color: 'var(--accent)' }}>{busy ? 'Se lucrează…' : '+ Adaugă document'} {!busy && (meniu ? '▴' : '▾')}</button>
          {meniu && <>
            <div onClick={() => setMeniu(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
            <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, marginTop: 6, minWidth: 250, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', boxShadow: 'var(--pa-card-shadow, 0 8px 24px rgba(0,0,0,.25))', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '5px 8px 3px' }}>Din șablon (editabil)</div>
              {sabloane.map(s => (
                <button key={s.tip} onClick={() => genereazaSablon(s.tip)} style={{ ...linkBtn, textAlign: 'left', padding: '8px', borderRadius: 'var(--r-sm)', color: 'var(--text-primary)', fontWeight: 600 }}>📄 {s.label}</button>
              ))}
              <div style={{ height: 1, background: 'var(--border-subtle, var(--border))', margin: '4px 2px' }} />
              <button onClick={() => { setMeniu(false); inputRef.current?.click() }} style={{ ...linkBtn, textAlign: 'left', padding: '8px', borderRadius: 'var(--r-sm)', color: 'var(--text-secondary)' }}>⬆ Încarcă un fișier din calculator…</button>
            </div>
          </>}
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={busy} style={{ ...linkBtn, color: 'var(--accent)' }}>{busy ? 'Se încarcă…' : '+ Adaugă document'}</button>
      ))}
      {mesaj && <span style={{ marginLeft: 10, fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{mesaj}</span>}
    </div>
  )
}

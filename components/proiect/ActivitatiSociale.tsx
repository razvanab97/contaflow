'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { deschideDocument } from '@/lib/vizualizare'
import {
  ANI_PROIECT, ETICHETA_STATUS, STATUSURI_ACT, ETICHETA_STARE,
  stareaZonei, indicatorZona, rezumatAn, TIPURI_DOC_ACT, etichetaDocAct,
  zoneOrdonate, ZONE_SOCIALE,
  type Activitate, type StareZonaRow, type StatusAct, type StareZona, type OrdineRow,
} from '@/lib/proiect-social'
import { getSablon, sabloanePentruZona, TIP_LUCRU } from '@/lib/proiect-social-sabloane'
import GeneratorSocial, { type Beneficiar, type DocGen } from './GeneratorSocial'

// Modulul „Activități sociale": fiecare zonă (activitate din plan) e o linie în care se adaugă
// activități (AS-NNN/AN) și documente. Indicatorul se mișcă doar din activitățile VALIDATE.

interface Doc { id: string; fisier_nume: string; fisier_tip: string | null; fisier_marime: number | null; furnizor: string | null; tip_document: string | null; activitate_sociala_id: string | null; beneficiar_social_id?: string | null; nr_inregistrare?: number | null; data_document?: string | null; stare?: string | null; zona_sociala?: string | null; an_social?: number | null; este_draft?: boolean; created_at: string }

const camp: React.CSSProperties = { background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 9px', fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }
const btnGhost: React.CSSProperties = { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '5px 9px', cursor: 'pointer', color: 'var(--text-secondary)' }
const linkBtn: React.CSSProperties = { fontSize: 'var(--fs-sm)', fontWeight: 600, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'none' }
// font cu caracter (Bricolage) pentru titluri/cifre, ca în fabrica de documente — aspect premium pe toată pagina
const disp: React.CSSProperties = { fontFamily: 'var(--font-bricolage), var(--font-geist), system-ui, sans-serif' }
const gradText: React.CSSProperties = { ...disp, color: 'transparent', backgroundImage: 'linear-gradient(135deg, var(--accent-mint, var(--accent)), var(--accent-blue, var(--accent)))', WebkitBackgroundClip: 'text', backgroundClip: 'text' }
const previzualizabil = (d: Doc) => /pdf|image/.test(d.fisier_tip || '') || /\.(pdf|jpe?g|png|webp)$/i.test(d.fisier_nume)
const culoareStare: Record<StareZona, string> = { deschisa: 'var(--success)', in_lucru: 'var(--warning)', inchisa_pe_an: 'var(--accent-blue)', inchisa_definitiv: 'var(--text-muted)' }
const esc = (s: string) => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c))

// Un singur PDF din mai multe documente, cu câte o foaie de separare între ele (randare Word în browser + printare → „Salvează ca PDF").
async function descarcaPdfDocumente(items: { id: string; nume: string; tip?: string | null; sectiune?: string }[], api: string, titlu: string) {
  if (!items.length) { alert('Nu există documente de inclus.'); return }
  const w = window.open('', '_blank')
  if (!w) { alert('Permite ferestrele pop-up pentru a genera PDF-ul.'); return }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titlu)}</title><style>body{margin:0;font-family:system-ui,sans-serif;color:#111}.sep{page-break-before:always;display:flex;align-items:center;justify-content:center;min-height:70vh;text-align:center}.sep .s{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#888;margin-bottom:8px}.sep h2{font-size:22px;margin:0}.doc{page-break-before:always;padding:0 6mm}.doc:first-child{page-break-before:avoid}img{max-width:100%}@page{margin:14mm}</style></head><body><div id="c" style="padding:20px;font-size:14px;color:#555">Se pregătește… (${items.length} documente)</div></body></html>`)
  w.document.close()
  try {
    const { renderAsync } = await import('docx-preview')
    const c = w.document.getElementById('c'); if (c) { c.textContent = ''; c.removeAttribute('style') }
    for (const it of items) {
      const sep = w.document.createElement('div'); sep.className = 'sep'
      sep.innerHTML = `<div><div class="s">${esc(it.sectiune || '')}</div><h2>${esc(it.nume)}</h2></div>`; c?.appendChild(sep)
      const url = `${api}&download=${it.id}`
      const wrap = w.document.createElement('div'); wrap.className = 'doc'; c?.appendChild(wrap)
      const isDocx = /\.docx$/i.test(it.nume) || /wordprocessing/.test(it.tip || '')
      const isImg = /^image\//.test(it.tip || '') || /\.(jpe?g|png|webp)$/i.test(it.nume)
      if (isDocx) {
        try { await renderAsync(await (await fetch(url)).blob(), wrap, undefined, { inWrapper: false }) } catch { wrap.innerHTML = '<p style="color:#888">(nu s-a putut randa — vezi în ZIP)</p>' }
      } else if (isImg) {
        const img = w.document.createElement('img'); img.src = url; wrap.appendChild(img)
      } else {
        wrap.innerHTML = `<p style="color:#888">„${esc(it.nume)}" (PDF/alt format) e în pachetul ZIP — nu se include în PDF-ul combinat.</p>`
      }
    }
    w.focus(); setTimeout(() => w.print(), 900)
  } catch { w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:20px">Nu s-a putut genera PDF-ul.</p>' }
}

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
  const [dragIdx, setDragIdx] = useState<number | null>(null) // reordonare prin tragere
  const [dropIdx, setDropIdx] = useState<number | null>(null)
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

  // Reordonare prin tragere (drag & drop) sau săgeți de la tastatură: mută zona de la poziția `from` la `to`.
  async function mutaLa(from: number, to: number) {
    const coduri = zoneSortate.map(z => z.cod)
    if (from === to || from < 0 || to < 0 || from >= coduri.length || to >= coduri.length) return
    const [m] = coduri.splice(from, 1); coduri.splice(to, 0, m)
    setOrdine(coduri.map((zona, i) => ({ zona, ordine: i })))
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'ordine-zona', ordine: coduri }) })
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
  // upsert: documentele noi apar sus, iar cele deja existente (ex. marcate draft) se actualizează pe loc
  const addDocsZona = (ds: Doc[]) => setDocsZona(prev => { const ids = new Set(ds.map(d => d.id)); return [...ds, ...prev.filter(p => !ids.has(p.id))] })
  const removeDocZona = (id: string) => setDocsZona(prev => prev.filter(x => x.id !== id))

  // toate documentele anului, pentru PDF-ul total (ordonate pe zonă, cu secțiunea = zona)
  const itemsTot = () => {
    const zMap = new Map(ZONE_SOCIALE.map(z => [z.cod, `${z.nr} ${z.titlu}`]))
    const actMap = new Map(acts.map(a => [a.id, a]))
    const codDoc = (d: Doc) => (d.activitate_sociala_id ? actMap.get(d.activitate_sociala_id)?.zona : d.zona_sociala) || ''
    const alAnului = (d: Doc) => d.activitate_sociala_id ? actMap.get(d.activitate_sociala_id)?.an === an : (d.an_social == null || d.an_social === an)
    return [...docs, ...docsZona].filter(alAnului).sort((a, b) => codDoc(a).localeCompare(codDoc(b)))
      .map(d => ({ id: d.id, nume: d.fisier_nume, tip: d.fisier_tip, sectiune: zMap.get(codDoc(d)) || codDoc(d) }))
  }

  if (!incarcat) return <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-md)' }}>Se încarcă…</div>

  return (
    <div>
      {!migrat && (
        <div style={{ border: '1px solid var(--warning)', background: 'var(--warning-soft, var(--surface))', borderRadius: 'var(--r-md)', padding: '10px 12px', marginBottom: 14, fontSize: 'var(--fs-sm)', color: 'var(--text-primary)' }}>
          Modulul are nevoie de tabelele din <strong>supabase_activitati_sociale.sql</strong>. Rulează migrarea în Supabase, apoi reîncarcă pagina.
        </div>
      )}

      {/* Avertisment vizibil sus (ex. „în lucru" nu se salvează pentru că n-a rulat migrarea constrângerii de stare) */}
      {mesaj && (
        <div role="alert" style={{ border: '1px solid var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, var(--surface))', borderRadius: 'var(--r-md)', padding: '10px 12px', marginBottom: 14, fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ flex: 1 }}>{mesaj}</span>
          <button onClick={() => setMesaj('')} aria-label="Închide avertismentul" style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-base)' }}>×</button>
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

      {/* Descarcă tot (toate secțiunile): ZIP (pe foldere) + PDF total cu foi de separare */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <a href={`${api}&zip=tot&an=${an}`} title="Toate documentele anului, pe foldere de zonă" style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>⬇ Descarcă tot ({an}) · ZIP</a>
        <button onClick={() => descarcaPdfDocumente(itemsTot(), api, `Activități sociale ${an}`)} style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>⬇ Descarcă tot ({an}) · PDF</button>
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
            <div key={z.cod}
              onDragOver={e => { if (dragIdx !== null) { e.preventDefault(); if (dropIdx !== zi) setDropIdx(zi) } }}
              onDrop={e => { e.preventDefault(); if (dragIdx !== null) mutaLa(dragIdx, zi); setDragIdx(null); setDropIdx(null) }}
              style={{ border: `1px solid ${dropIdx === zi && dragIdx !== null && dragIdx !== zi ? 'var(--accent)' : open ? 'color-mix(in srgb, var(--accent) 26%, var(--border))' : 'var(--border)'}`, borderRadius: 'var(--r-lg)', background: open ? 'linear-gradient(170deg, color-mix(in srgb, var(--accent) 5%, var(--surface)), var(--surface))' : 'var(--surface)', opacity: definitiv ? 0.7 : dragIdx === zi ? 0.45 : 1, boxShadow: dropIdx === zi && dragIdx !== null && dragIdx !== zi ? '0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent)' : open ? 'var(--pa-card-shadow, none)' : 'none', transition: 'border-color .2s, background .2s, box-shadow .15s' }}>
              {/* Antet zonă - click oriunde pe el (în afara controalelor) deschide/închide zona */}
              <div onClick={() => toggle(z.cod)} data-zona={z.cod}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, flexWrap: 'wrap', cursor: 'pointer' }}>
                {/* Mâner de reordonare: trage ca să schimbi prioritatea (sau săgeți ↑/↓ de la tastatură) */}
                <span draggable tabIndex={0} role="button" aria-label={`Reordonează „${z.titlu}" — trage sau folosește săgețile sus/jos`} title="Trage ca să reordonezi (ori săgeți ↑/↓)"
                  onClick={e => e.stopPropagation()}
                  onDragStart={e => { setDragIdx(zi); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => { setDragIdx(null); setDropIdx(null) }}
                  onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); mutaLa(zi, zi - 1) } else if (e.key === 'ArrowDown') { e.preventDefault(); mutaLa(zi, zi + 1) } }}
                  style={{ flexShrink: 0, marginTop: 2, cursor: 'grab', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1, userSelect: 'none', letterSpacing: '-3px', padding: '2px 4px 2px 0', borderRadius: 6 }}>⠿</span>
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
                  <option value="in_lucru">În lucru</option>
                  <option value="inchisa_pe_an">Închisă pe {an}</option>
                  <option value="inchisa_definitiv">Închisă definitiv</option>
                </select>
              </div>

              {open && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 14 }}>
                  {aleZonei.length === 0 && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginBottom: 10 }}>Nicio activitate pe {an} în această zonă.</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {aleZonei.map((a, ai) => (
                      <RandActivitate key={a.id} a={a} docs={docs.filter(d => d.activitate_sociala_id === a.id)} firmaId={firmaId}
                        bazaBeneficiari={z.baza === 'beneficiari'} unitate={z.unitate} zona={z.cod} an={an} definitiv={definitiv}
                        beneficiari={beneficiari.filter(b => b.activitate_id === a.id)} urmatorNr={urmatorNr}
                        arataDocsZona={ai === 0} sabloaneZona={sabloanePentruZona(z.cod).map(s => ({ tip: s.tip, label: s.label }))}
                        docsZona={docsZona.filter(d => d.zona_sociala === z.cod && (d.an_social == null || d.an_social === an))}
                        onDocZonaAdaugat={addDocsZona} onDocZonaSters={removeDocZona}
                        onModifica={modifica} onSterge={() => stergeAct(a)}
                        onDocNou={nd => setDocs(prev => [...nd, ...prev])} onDocSters={id => setDocs(prev => prev.filter(d => d.id !== id))}
                        onBeneficiar={upsertBenef} onBeneficiarSters={removeBenef} onGenerat={addGenerat} onNrSchimbat={updateNr}
                        onDateComune={updateDateComune} />
                    ))}
                  </div>

                  {/* Documente pe zonă: doar când nu există nicio activitate (altfel apar în interiorul activității) */}
                  {aleZonei.length === 0 && <DocumenteZona firmaId={firmaId} zona={z.cod} an={an} api={api}
                    sabloane={sabloanePentruZona(z.cod).map(s => ({ tip: s.tip, label: s.label }))}
                    docs={docsZona.filter(d => d.zona_sociala === z.cod && (d.an_social == null || d.an_social === an))}
                    onAdaugat={addDocsZona} onSters={removeDocZona} disabled={definitiv} />}

                  {formZona === z.cod
                    ? <FormActivitate onAnuleaza={() => setFormZona(null)} onSalveaza={c => creeaza(z.cod, c)} />
                    : !definitiv && <button onClick={() => setFormZona(z.cod)} style={{ ...linkBtn, color: 'var(--accent)', marginTop: 10 }}>+ Activitate nouă</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- O activitate (rând) ---------------------------------------------------------------------
function RandActivitate({ a, docs, firmaId, bazaBeneficiari, unitate, zona, an, definitiv, beneficiari, urmatorNr, arataDocsZona, sabloaneZona, docsZona, onDocZonaAdaugat, onDocZonaSters, onModifica, onSterge, onDocNou, onDocSters, onBeneficiar, onBeneficiarSters, onGenerat, onNrSchimbat, onDateComune }: {
  a: Activitate; docs: Doc[]; firmaId: string; bazaBeneficiari: boolean; unitate: string; zona: string; an: number; definitiv?: boolean
  beneficiari: Beneficiar[]; urmatorNr: number
  arataDocsZona?: boolean; sabloaneZona: { tip: string; label: string }[]; docsZona: Doc[]
  onDocZonaAdaugat: (ds: Doc[]) => void; onDocZonaSters: (id: string) => void
  onModifica: (id: string, patch: Record<string, unknown>) => void; onSterge: () => void
  onDocNou: (d: Doc[]) => void; onDocSters: (id: string) => void
  onBeneficiar: (b: Beneficiar) => void; onBeneficiarSters: (id: string) => void
  onGenerat: (d: DocGen) => void; onNrSchimbat: (d: DocGen) => void
  onDateComune: (id: string, date: Record<string, string>) => void
}) {
  // în registru: documentele din șabloane (tip_document cunoscut) + drafturile „puse în lucru" (TIP_LUCRU); restul = atașate manual
  const ptRegistru = (d: Doc) => !!getSablon(d.tip_document) || d.tip_document === TIP_LUCRU
  const docManual = docs.filter(d => !ptRegistru(d))
  const docGenerate = docs.filter(ptRegistru) as unknown as DocGen[]
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
      {/* Antet activitate - click oriunde pe cadru (nu doar pe caret) deschide/închide toată secțiunea */}
      <div onClick={() => setExtins(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}>
        <button onClick={e => { e.stopPropagation(); setExtins(v => !v) }} aria-expanded={extins} aria-label={`${extins ? 'Restrânge' : 'Extinde'} ${a.denumire}`} title={extins ? 'Restrânge' : 'Extinde'} style={{ ...linkBtn, color: 'var(--accent)', fontSize: 'var(--fs-base)' }}>{extins ? '▾' : '▸'}</button>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{a.cod}</span>
        <strong style={{ ...disp, flex: 1, minWidth: 120, fontSize: 'var(--fs-md)', fontWeight: 700, letterSpacing: '-.01em', color: 'var(--text-primary)' }}>{a.denumire}</strong>
        <select value={a.status} onClick={e => e.stopPropagation()} onChange={e => onModifica(a.id, { status: e.target.value })} aria-label="Status activitate"
          style={{ ...camp, padding: '4px 6px', fontSize: 'var(--fs-xs)', fontWeight: 700, color: culoareStatus[a.status] }}>
          {STATUSURI_ACT.map(s => <option key={s} value={s}>{ETICHETA_STATUS[s]}</option>)}
        </select>
        {!!docs.length && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>📎 {docs.length}</span>}
        {!!docs.length && <a href={`${api}&zip=activitate&activitateId=${a.id}`} onClick={e => e.stopPropagation()} title="Descarcă documentele activității (ZIP)" style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', fontWeight: 700 }}>ZIP</a>}
        {!!docs.length && <button onClick={e => { e.stopPropagation(); descarcaPdfDocumente(docs.map(d => ({ id: d.id, nume: d.fisier_nume, tip: d.fisier_tip, sectiune: `${a.cod} · ${a.denumire}` })), api, `${a.cod} ${a.denumire}`) }} title="Descarcă documentele activității (PDF, cu foi de separare)" style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', fontWeight: 700 }}>PDF</button>}
        <button onClick={e => { e.stopPropagation(); onSterge() }} title="Șterge activitatea" aria-label={`Șterge ${a.cod}`} style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-base)' }}>×</button>
      </div>

      {extins && (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {/* Fabrica de documente - vizibilă sus (doar la zonele cu șabloane) */}
          <GeneratorSocial firmaId={firmaId} activitateId={a.id} an={a.an} zona={zona} dateDocumente={a.date_documente || {}}
            beneficiari={beneficiari} documente={docGenerate}
            onBeneficiar={onBeneficiar} onBeneficiarSters={onBeneficiarSters} onGenerat={onGenerat} onNrSchimbat={onNrSchimbat}
            onStergeDoc={onDocSters} onDateComune={date => onDateComune(a.id, date)} />

          {/* Detalii activitate - strânse când zona are generator, ca să nu încarce */}
          <details open={!areGenerator}>
            <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)', padding: '2px 0' }}>Detalii activitate</summary>
            <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                <label style={lblCol}>Denumire activitate
                  <input defaultValue={a.denumire} onBlur={e => { const v = e.target.value.trim(); if (v && v !== a.denumire) onModifica(a.id, { denumire: v }); else e.target.value = a.denumire }} style={{ ...camp, fontWeight: 600 }} /></label>
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

          {/* Documentele zonei, în interiorul activității (nu separat dedesubt) */}
          {arataDocsZona && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>Documente</div>
              <DocumenteZona firmaId={firmaId} zona={zona} an={an} api={api} activitateId={a.id} sabloane={sabloaneZona} docs={docsZona} onAdaugat={onDocZonaAdaugat} onSters={onDocZonaSters} onPusInLucru={d => onDocNou(d)} disabled={definitiv} />
            </div>
          )}
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
function DocumenteZona({ firmaId, zona, an, api, activitateId, docs, sabloane, onAdaugat, onSters, onPusInLucru, disabled }: {
  firmaId: string; zona: string; an: number; api: string; activitateId?: string; docs: Doc[]; sabloane: { tip: string; label: string }[]
  onAdaugat: (ds: Doc[]) => void; onSters: (id: string) => void; onPusInLucru?: (ds: Doc[]) => void; disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const urlDoc = (d: Doc, preview = false) => `${api}&download=${d.id}${preview ? '&preview=1' : ''}`

  // generează un document editabil dintr-un șablon (draft) existent al zonei, direct în sistem
  async function genereazaSablon(tip: string) {
    setBusy(true); setMesaj('')
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'genereaza-zona', zona, an, tip }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.document) onAdaugat([d.document]); else setMesaj(d.error || 'Nu s-a putut genera documentul')
    } catch { setMesaj('Generarea a eșuat') } finally { setBusy(false) }
  }
  // marchează / scoate un document ca „draft" (reutilizabil în zonă)
  async function marcheaza(docId: string, draft: boolean) {
    setBusy(true); setMesaj('')
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'marcheaza-draft', docId, draft }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.document) onAdaugat([d.document]); else setMesaj(d.error || 'Nu s-a putut marca')
    } catch { setMesaj('Operația a eșuat') } finally { setBusy(false) }
  }
  // „Pune în lucru" un draft încărcat: creează o copie editabilă (cu marcajele completate din datele activității).
  // Cu o activitate, copia intră în Registrul documentelor de mai sus (act „în lucru"); altfel rămâne document de zonă.
  async function puneInLucruDoc(docId: string) {
    setBusy(true); setMesaj('')
    try {
      // atașăm la activitate (→ Registrul de sus) doar dacă zona are registru (șabloane); altfel rămâne document de zonă
      const catreRegistru = sabloane.length > 0 ? activitateId : undefined
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId, actiune: 'pune-in-lucru-doc', docId, zona, an, activitateId: catreRegistru }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.document) { if (d.document.activitate_sociala_id && onPusInLucru) onPusInLucru([d.document]); else onAdaugat([d.document]) }
      else setMesaj(d.error || 'Nu s-a putut pune în lucru')
    } catch { setMesaj('Operația a eșuat') } finally { setBusy(false) }
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

  const draftDocs = docs.filter(d => d.este_draft)
  const momentDocs = docs.filter(d => !d.este_draft)
  const esteDocxDoc = (d: Doc) => /\.docx$/i.test(d.fisier_nume) || /wordprocessing/.test(d.fisier_tip || '')

  return (
    <div style={{ marginTop: 10 }}>
      {/* Documente „de moment" (atașamente simple) — le poți marca drept draft reutilizabil */}
      {momentDocs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {momentDocs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
              <span aria-hidden style={{ fontSize: 13 }}>📄</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fisier_nume}</span>
              {esteDocxDoc(d) && !disabled && <button onClick={() => marcheaza(d.id, true)} disabled={busy} title="Marchează ca draft reutilizabil (apare la Drafturi standard)" style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', fontWeight: 700 }}>☆ Draft</button>}
              {previzualizabil(d) && <button onClick={() => deschideDocument(urlDoc(d, true), d.fisier_nume)} style={{ ...linkBtn, color: 'var(--accent)' }}>Vezi</button>}
              <a href={urlDoc(d)} title="Descarcă" style={{ ...linkBtn, color: 'var(--accent)' }}>↓</a>
              <button onClick={() => stergeDoc(d)} title="Șterge documentul" aria-label={`Șterge ${d.fisier_nume}`} style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-base)' }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Drafturi standard (șabloane fixe) + drafturile marcate de tine: descarcă ori „Pune în lucru" (copie editabilă) */}
      {!disabled && (sabloane.length > 0 || draftDocs.length > 0) && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Drafturi standard</div>
          {sabloane.map(s => (
            <div key={s.tip} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface)' }}>
              <span aria-hidden style={{ fontSize: 14 }}>📄</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              <a href={`${api}&draft=${encodeURIComponent(s.tip)}&an=${an}`} title="Descarcă draftul (Word)" aria-label={`Descarcă ${s.label}`} style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-base)', flexShrink: 0 }}>↓</a>
              <button onClick={() => genereazaSablon(s.tip)} disabled={busy} className="gsoc-solid" title="Pune documentul în cadrul de lucru (copie editabilă)" style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '7px 13px', borderRadius: 999, cursor: 'pointer', flexShrink: 0 }}>{busy ? 'Se lucrează…' : '➕ Pune în lucru'}</button>
            </div>
          ))}
          {draftDocs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid color-mix(in srgb, var(--accent) 22%, var(--border))', borderRadius: 'var(--r-md)', background: 'color-mix(in srgb, var(--accent) 5%, var(--surface))' }}>
              <span aria-hidden style={{ fontSize: 14 }}>⭐</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fisier_nume}</span>
              <button onClick={() => marcheaza(d.id, false)} disabled={busy} title="Scoate din drafturi (redevine document de moment)" style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', flexShrink: 0 }}>scoate</button>
              <a href={urlDoc(d)} title="Descarcă draftul" style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 'var(--fs-base)', flexShrink: 0 }}>↓</a>
              <button onClick={() => puneInLucruDoc(d.id)} disabled={busy} className="gsoc-solid" title="Pune documentul în cadrul de lucru (copie editabilă, cu datele completate)" style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '7px 13px', borderRadius: 999, cursor: 'pointer', flexShrink: 0 }}>{busy ? 'Se lucrează…' : '➕ Pune în lucru'}</button>
            </div>
          ))}
        </div>
      )}

      {/* Încărcare fișier propriu */}
      <input ref={inputRef} type="file" multiple accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={e => incarca(Array.from(e.target.files || []))} />
      {!disabled && <button onClick={() => inputRef.current?.click()} disabled={busy} style={{ ...linkBtn, color: 'var(--accent)' }}>{busy ? 'Se încarcă…' : '⬆ Încarcă un fișier din calculator'}</button>}
      {mesaj && <span style={{ marginLeft: 10, fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{mesaj}</span>}
    </div>
  )
}

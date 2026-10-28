'use client'
import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { deschideDocument, esteDocumentVizualizabil } from '@/lib/vizualizare'
import Icon from '@/components/ui/Icon'
import { pregatesteImagine, faraImagini, limiteazaImagini, MAX_IMAGINI, type ImagineAi } from '@/lib/asistent-imagini'
import css from './AsistentAI.module.css'

type Firma = { id: string; slug: string; nume: string }
type Actiune = { id: string; nume: string; descriere: string }
type Item =
  | { tip: 'user'; text: string; fisiere?: string[]; imagini?: string[]; nrImagini?: number }  // imagini = previzualizari (doar in memorie)
  | { tip: 'ai'; text: string }
  | { tip: 'eroare'; text: string }
  | { tip: 'confirma'; actiuni: Actiune[]; decis?: 'da' | 'nu' }
type Stare = { mesaje: unknown[]; items: Item[] }

const CHEIE = 'cf-asistent-v1'
const SUGESTII = ['Ce am de făcut luna asta în toate firmele?', 'Ce tranzacții fără document am la firma asta?', 'Ce facturi neplătite am?', 'Caută factura E.ON din septembrie']

// Markdown minimal: titluri, liste, **bold**, `cod`, tabele si linkuri [text](/cale) - fara HTML injectat.
function inline(t: string) {
  return t.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>
    const l = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    // Documente: previzualizare in pop-up (vizualizatorul global), nu descarcare; href ramane pentru „deschide in tab nou”.
    if (l && esteDocumentVizualizabil(l[2])) return <a key={i} href={l[2]} target="_blank" rel="noreferrer" onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); deschideDocument(l[2], l[1]) }}>{l[1]}</a>
    if (l) return l[2].startsWith('/api/') || /^https?:/.test(l[2]) ? <a key={i} href={l[2]} target="_blank" rel="noreferrer">{l[1]}</a> : l[2].startsWith('/') ? <Link key={i} href={l[2]}>{l[1]}</Link> : <Fragment key={i}>{l[1]}</Fragment>
    return <Fragment key={i}>{p}</Fragment>
  })
}
function Markdown({ text }: { text: string }) {
  const out: React.ReactNode[] = []
  let lista: { tip: 'ul' | 'ol'; items: string[] } | null = null, tabel: string[][] | null = null
  const flush = () => { if (lista) { const L = lista; out.push(L.tip === 'ul' ? <ul key={out.length}>{L.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</ul> : <ol key={out.length}>{L.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</ol>); lista = null } }
  const flushT = () => { if (tabel) { const [cap, ...rest] = tabel; out.push(<table key={out.length}><thead><tr>{cap.map((c, i) => <th key={i}>{inline(c)}</th>)}</tr></thead><tbody>{rest.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody></table>); tabel = null } }
  for (const raw of text.split('\n')) {
    const l = raw.trimEnd()
    if (/^\s*\|.*\|\s*$/.test(l)) { flush(); const c = l.trim().slice(1, -1).split('|').map(x => x.trim()); if (!c.every(x => /^:?-{2,}:?$/.test(x))) (tabel ||= []).push(c); continue }
    flushT()
    const ul = l.match(/^\s*[-*•]\s+(.*)/), ol = l.match(/^\s*\d+[.)]\s+(.*)/), h = l.match(/^#{1,4}\s+(.*)/)
    if (ul || ol) { const tip = ul ? 'ul' : 'ol'; if (!lista || lista.tip !== tip) { flush(); lista = { tip, items: [] } } lista.items.push((ul || ol)![1]); continue }
    flush()
    if (h) out.push(<h4 key={out.length}>{inline(h[1])}</h4>)
    else if (l.trim()) out.push(<p key={out.length}>{inline(l)}</p>)
  }
  flush(); flushT()
  return <>{out}</>
}

function citeste(): Stare { try { const s = JSON.parse(localStorage.getItem(CHEIE) || 'null'); if (s && Array.isArray(s.mesaje) && Array.isArray(s.items)) return s } catch {} return { mesaje: [], items: [] } }
// Imaginile lipite nu se salveaza in browser (base64 prea mare): la reincarcare raman doar „🖼 N imagini” in conversatie.
function salveaza(s: Stare) {
  try {
    const items = s.items.slice(-80).map(it => it.tip === 'user' && it.imagini?.length ? { ...it, imagini: undefined, nrImagini: it.imagini.length } : it)
    localStorage.setItem(CHEIE, JSON.stringify({ mesaje: faraImagini(s.mesaje).slice(-50), items }))
  } catch {}
}

export default function AsistentAI({ open, onClose, firme, firma, luna, cale }: { open: boolean; onClose: () => void; firme: Firma[]; firma?: string; luna: string; cale: string }) {
  const [stare, setStare] = useState<Stare>({ mesaje: [], items: [] })
  const [text, setText] = useState('')
  const [fisiere, setFisiere] = useState<File[]>([])
  const [imagini, setImagini] = useState<ImagineAi[]>([])
  const [eroareImg, setEroareImg] = useState('')
  const nrImg = useRef(0)
  const [tinta, setTinta] = useState<{ firma: string; luna: string }>({ firma: firma || '', luna })
  const [lucru, setLucru] = useState('')
  const [tras, setTras] = useState(false)
  const jos = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), stareRef = useRef(stare)
  stareRef.current = stare

  useEffect(() => { setStare(citeste()) }, [])
  useEffect(() => { setTinta({ firma: firma || '', luna }) }, [firma, luna])
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 60) }, [open])
  useEffect(() => { jos.current?.scrollIntoView({ block: 'end' }) }, [stare.items, lucru])
  useEffect(() => { const el = input.current; if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }, [text])
  useEffect(() => {
    if (!open) return
    // Esc inchide mai intai previzualizarea documentului (vizualizatorul global), nu si asistentul de sub ea
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.doc-viewer')) onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [open, onClose])

  function actualizeaza(f: (s: Stare) => Stare) { setStare(prev => { const n = f(prev); salveaza(n); return n }) }

  // Un pas cu agentul: fie un mesaj nou, fie deciziile pentru actiunile in asteptare. Raspunsul vine ca NDJSON.
  async function pas(corp: { text?: string; imagini?: { mediaType: string; data: string; nume: string }[]; decizii?: { id: string; aproba: boolean }[] }) {
    setLucru('Mă gândesc…')
    let textAi = '', areAi = false
    try {
      const res = await fetch('/api/asistent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corp, mesaje: limiteazaImagini(stareRef.current.mesaje), pagina: { firma, luna, cale } }) })
      if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Asistentul nu a răspuns.') }
      const reader = res.body.getReader(), dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl
        while ((nl = buf.indexOf('\n')) >= 0) {
          const linie = buf.slice(0, nl); buf = buf.slice(nl + 1)
          if (!linie.trim()) continue
          const e = JSON.parse(linie)
          if (e.t === 'text') {
            textAi += e.d; setLucru('')
            // Valorile se fixeaza ACUM: actualizarea starii ruleaza amanat, iar areAi se schimba imediat dupa.
            const t = textAi, inlocuieste = areAi
            actualizeaza(s => inlocuieste ? { ...s, items: [...s.items.slice(0, -1), { tip: 'ai', text: t }] } : { ...s, items: [...s.items, { tip: 'ai', text: t }] })
            areAi = true
          } else if (e.t === 'unealta') { setLucru(e.nume); textAi = ''; areAi = false }
          else if (e.t === 'confirma') actualizeaza(s => ({ mesaje: e.mesaje, items: [...s.items, { tip: 'confirma', actiuni: e.actiuni }] }))
          else if (e.t === 'gata') actualizeaza(s => ({ ...s, mesaje: e.mesaje }))
          else if (e.t === 'eroare') actualizeaza(s => ({ mesaje: e.mesaje || s.mesaje, items: [...s.items, { tip: 'eroare', text: e.d }] }))
        }
      }
    } catch (e) {
      actualizeaza(s => ({ ...s, items: [...s.items, { tip: 'eroare', text: e instanceof Error ? e.message : 'Eroare' }] }))
    } finally { setLucru('') }
  }

  async function trimite(q?: string) {
    const intrebare = (q ?? text).trim()
    if ((!intrebare && !fisiere.length && !imagini.length) || lucru) return
    const atasate = fisiere, poze = imagini
    setText(''); setFisiere([]); setImagini([]); setEroareImg('')
    actualizeaza(s => ({ ...s, items: [...s.items, { tip: 'user', text: intrebare || (atasate.length ? 'Am atașat facturi.' : poze.length === 1 ? 'Am lipit o imagine.' : 'Am lipit imagini.'), fisiere: atasate.map(f => f.name), ...(poze.length ? { imagini: poze.map(p => p.previzualizare) } : {}) }] }))
    let context = ''
    if (atasate.length) {
      if (!tinta.firma) { actualizeaza(s => ({ ...s, items: [...s.items, { tip: 'eroare', text: 'Alege firma în care intră facturile atașate.' }] })); return }
      setLucru(`Încarc ${atasate.length} ${atasate.length === 1 ? 'factură' : 'facturi'} în Inbox Facturi…`)
      const fd = new FormData(); fd.set('firma', tinta.firma); fd.set('luna', tinta.luna); atasate.forEach(f => fd.append('file', f))
      const res = await fetch('/api/asistent/incarca', { method: 'POST', body: fd }).catch(() => null)
      const d = res ? await res.json().catch(() => ({})) : { error: 'Încărcarea a eșuat.' }
      if (!res?.ok) context = `\n\n[Încărcarea facturilor atașate (${atasate.map(f => f.name).join(', ')}) a EȘUAT: ${d.error || 'eroare'}]`
      else {
        const rez = (d.imported || []) as { duplicate?: boolean; skipped?: boolean; skipReason?: string; doc?: { id: string; fisier_nume: string; furnizor?: string; numar_document?: string; suma?: number; data_document?: string } }[]
        context = `\n\n[Am atașat ${atasate.length} fișier(e), încărcate în Inbox Facturi la ${d.firma} · luna ${d.luna}. Rezultat: ${rez.map(r => r.skipped ? `sărit (${r.skipReason || 'motiv necunoscut'})` : r.doc ? `${r.duplicate ? 'DUPLICAT — ' : ''}${r.doc.fisier_nume} · furnizor ${r.doc.furnizor || '?'} · nr. ${r.doc.numar_document || '?'} · ${r.doc.suma ?? '?'} · ${r.doc.data_document || '?'} · id ${r.doc.id}` : 'fără document').join(' | ') || 'niciun document'}]`
      }
    }
    const impliciti = atasate.length ? 'Am atașat facturi — spune-mi ce s-a încărcat și dacă e ceva de verificat.' : 'Uită-te la imaginea (imaginile) atașată și spune-mi ce vezi; dacă se poate, spune-mi ce e de făcut în platformă pe baza ei.'
    await pas({ text: (intrebare || impliciti) + context, ...(poze.length ? { imagini: poze.map(p => ({ mediaType: p.mediaType, data: p.data, nume: p.nume })) } : {}) })
  }

  function decide(index: number, aproba: boolean) {
    const item = stare.items[index]
    if (item?.tip !== 'confirma' || item.decis || lucru) return
    actualizeaza(s => ({ ...s, items: s.items.map((x, i) => i === index ? { ...item, decis: aproba ? 'da' : 'nu' } : x) }))
    void pas({ decizii: item.actiuni.map(a => ({ id: a.id, aproba })) })
  }

  function adaugaFisiere(lista: FileList | File[]) {
    const ok = Array.from(lista).filter(f => /\.(pdf|jpe?g|png)$/i.test(f.name) && f.size <= 10 * 1024 * 1024)
    if (ok.length) setFisiere(prev => [...prev, ...ok].slice(0, 10))
  }

  // Imagini lipite din clipboard (captura de ecran, „Copy image”): le vede AI-ul, nu intra in Inbox Facturi.
  async function adaugaImagini(lista: File[]) {
    setEroareImg('')
    const locuri = MAX_IMAGINI - imagini.length
    if (locuri <= 0) { setEroareImg(`Cel mult ${MAX_IMAGINI} imagini într-un mesaj.`); return }
    try {
      const pregatite = await Promise.all(lista.slice(0, locuri).map(f => pregatesteImagine(f, ++nrImg.current)))
      setImagini(prev => [...prev, ...pregatite].slice(0, MAX_IMAGINI))
      if (lista.length > locuri) setEroareImg(`Cel mult ${MAX_IMAGINI} imagini într-un mesaj.`)
    } catch (e) { setEroareImg(e instanceof Error ? e.message : 'Imaginea nu a putut fi citită.') }
    input.current?.focus()
  }
  const adaugaImaginiRef = useRef(adaugaImagini)
  adaugaImaginiRef.current = adaugaImagini
  useEffect(() => {
    if (!open) return
    const lipeste = (e: ClipboardEvent) => {
      const poze = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'))
      if (!poze.length) return
      // „Copy image” din browser aduce si text/html; din captura de ecran vine doar imaginea. Imaginea o luam oricum.
      if (!e.clipboardData?.getData('text/plain')) e.preventDefault()
      void adaugaImaginiRef.current(poze)
    }
    document.addEventListener('paste', lipeste)
    return () => document.removeEventListener('paste', lipeste)
  }, [open])

  if (!open) return null
  const firmaCurenta = firme.find(f => f.slug === firma)
  return <>
    <div className={css.backdrop} onClick={onClose} />
    <aside className={css.panel} role="dialog" aria-label="Asistent ContaFlow">
      <div className={css.head}>
        <div className={css.logo} aria-hidden>✦</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={css.title}>Asistent ContaFlow</div>
          <div className={css.sub}>{firmaCurenta ? `${firmaCurenta.nume} · ${luna}` : 'Toate firmele'} · vede toată platforma</div>
        </div>
        {stare.items.length > 0 && <button type="button" className={css.headBtn} disabled={!!lucru} onClick={() => actualizeaza(() => ({ mesaje: [], items: [] }))}>Conversație nouă</button>}
        <button type="button" className={`${css.headBtn} ${css.close}`} onClick={onClose} aria-label="Închide asistentul">✕</button>
      </div>

      <div className={`${css.body} ${tras ? css.drop : ''}`}
        onDragOver={e => { e.preventDefault(); setTras(true) }} onDragLeave={() => setTras(false)}
        onDrop={e => { e.preventDefault(); setTras(false); adaugaFisiere(e.dataTransfer.files) }}>
        {stare.items.length === 0 && <div className={css.empty}>
          <div className={css.emptyTitle}>Cu ce te ajut?</div>
          <div className={css.emptyText}>Caut facturi și tranzacții, îți spun ce e de făcut în fiecare firmă, bifez sarcini, marchez facturi plătite și adaug facturi noi — trage un PDF aici. Orice modificare îți cere întâi confirmarea.</div>
          {SUGESTII.map(s => <button key={s} type="button" className={css.sugg} onClick={() => void trimite(s)}><Icon name="arrowRight" size={14} />{s}</button>)}
        </div>}
        {stare.items.map((it, i) => it.tip === 'user' ? <Fragment key={i}>
            {it.imagini?.length ? <div className={css.files}>{it.imagini.map((src, k) => <img key={k} src={src} alt={`Imagine lipită ${k + 1}`} className={css.pic} />)}</div>
              : it.nrImagini ? <div className={css.files}><span className={css.fileChip}><Icon name="fileText" size={12} /><span>{it.nrImagini === 1 ? '1 imagine lipită' : `${it.nrImagini} imagini lipite`}</span></span></div> : null}
            {it.fisiere?.length ? <div className={css.files}>{it.fisiere.map(f => <span key={f} className={css.fileChip}><Icon name="fileText" size={12} /><span>{f}</span></span>)}</div> : null}
            <div className={css.user}>{it.text}</div>
          </Fragment>
          : it.tip === 'ai' ? <div key={i} className={css.ai}><Markdown text={it.text} /></div>
          : it.tip === 'eroare' ? <div key={i} className={css.err} role="alert">{it.text}</div>
          : <div key={i} className={css.confirm}>
            <div className={css.confirmTitle}>Confirmă modificarea</div>
            {it.actiuni.map(a => <div key={a.id} className={css.action}>• {a.descriere}</div>)}
            {it.decis ? <div className={css.decided}>{it.decis === 'da' ? '✓ Confirmat' : '✕ Refuzat'}</div>
              : <div className={css.actions}><button type="button" className={css.yes} disabled={!!lucru} onClick={() => decide(i, true)}>✓ Confirmă</button><button type="button" className={css.no} disabled={!!lucru} onClick={() => decide(i, false)}>Refuză</button></div>}
          </div>)}
        {lucru && <div className={css.status} role="status"><span className={css.dots}><i /><i /><i /></span>{lucru}</div>}
        <div ref={jos} />
      </div>

      <div className={css.foot}>
        {imagini.length > 0 && <div className={css.attached} aria-label="Imagini pentru AI">
          {imagini.map((p, i) => <span key={i} className={css.thumb}><img src={p.previzualizare} alt={p.nume} /><button type="button" aria-label={`Scoate ${p.nume}`} onClick={() => setImagini(prev => prev.filter((_, j) => j !== i))}>×</button></span>)}
          <span className={css.hint}>AI-ul le vede; nu se salvează în platformă</span>
        </div>}
        {eroareImg && <div className={css.err} role="alert">{eroareImg}</div>}
        {fisiere.length > 0 && <>
          <div className={css.attached}>{fisiere.map((f, i) => <span key={i} className={css.fileChip}><Icon name="fileText" size={12} /><span>{f.name}</span><button type="button" aria-label={`Scoate ${f.name}`} onClick={() => setFisiere(p => p.filter((_, j) => j !== i))}>×</button></span>)}</div>
          <div className={css.target}>Intră în Inbox Facturi la
            <select value={tinta.firma} onChange={e => setTinta(t => ({ ...t, firma: e.target.value }))} aria-label="Firma"><option value="">— alege firma —</option>{firme.map(f => <option key={f.slug} value={f.slug}>{f.nume}</option>)}</select>
            luna <input value={tinta.luna} onChange={e => setTinta(t => ({ ...t, luna: e.target.value }))} aria-label="Luna (AAAA-LL)" style={{ width: 78 }} />
          </div>
        </>}
        <div className={css.composer}>
          <label className={css.attach} title="Atașează facturi (PDF, JPG, PNG)">
            <Icon name="link" size={16} />
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" aria-label="Atașează facturi" onChange={e => { if (e.target.files) adaugaFisiere(e.target.files); e.target.value = '' }} />
          </label>
          <textarea ref={input} className={css.textarea} rows={1} value={text} onChange={e => setText(e.target.value)} aria-label="Mesaj pentru asistent"
            placeholder="Întreabă, dă-i o sarcină sau lipește o imagine (Ctrl/⌘+V)…"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void trimite() } }} />
          <button type="button" className={css.send} disabled={!!lucru || (!text.trim() && !fisiere.length && !imagini.length)} onClick={() => void trimite()} aria-label="Trimite"><Icon name="send" size={16} /></button>
        </div>
        <div className={css.hint}>Enter trimite · ⌘J deschide/închide · modificările cer confirmare</div>
      </div>
    </aside>
  </>
}

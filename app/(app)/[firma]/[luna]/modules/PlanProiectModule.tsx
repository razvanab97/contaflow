'use client'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ACTIVITATI, INDICATORI, OBLIGATII, PERIOADA, STATUS_PLAN, etapaProiect, etichetaLuna, lunaProiect, statusImplicitActivitate, termenDepasit, type CategorieObligatie, type StarePlan, type StatusPlan } from '@/lib/proiect-plan'
import { BUGET_ACHIZITII, VERSIUNE_BUGET, coduriDin } from '@/lib/achizitii-procedura'
import { CATEGORII_MEMORIE, extrageMemorieDinRaspuns, type Memorie } from '@/lib/proiect-memorie'
import Icon from '@/components/ui/Icon'
import css from './PlanProiect.module.css'
import BugetProiect from './BugetProiect'
import { executieBuget, type PlataProiect } from '@/lib/proiect-buget'

interface Firma { id: string; slug: string; nume: string; culoare: string }
// inPopup = fereastra pop-up globala (components/shell/ProiectPopup.tsx): fara lunaId si fara calculele de inaltime/derulare ale paginii
interface Props { firma: Firma; lunaId?: string; inPopup?: boolean }
interface Intrebare { id?: string; intrebare: string; raspuns: string; created_at?: string; inCurs?: boolean }
type Tab = 'intreaba' | 'memorie' | 'plan' | 'buget' | 'indicatori'

const lei = (n: number) => `${n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`
const dataRo = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('ro-RO')
function toast(text: string, tip: 'ok' | 'err' = 'ok') { window.dispatchEvent(new CustomEvent('cf:toast', { detail: { text, tone: tip === 'ok' ? 'success' : 'error' } })) }

const SUGESTII = [
  'Ce am de făcut luna asta pentru proiect?',
  'Ce linii de buget mai am de cumpărat și câți bani mai sunt pe cofinanțare?',
  'Pot cumpăra manechinul mai scump decât în buget? Cum procedez?',
  'Ce condiții trebuie îndeplinite pentru tranșa următoare?',
  'Ce obligații am în perioada de sustenabilitate?',
  'Ce trebuie să fac pentru statutul de întreprindere socială de inserție?',
]

// Markdown minimal (titluri, liste, **bold**, tabele) -> React, fara HTML injectat.
function inline(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>)
}
function Markdown({ text }: { text: string }) {
  const blocuri: React.ReactNode[] = []
  let lista: { tip: 'ul' | 'ol'; items: string[] } | null = null
  const flush = () => { if (lista) { const L = lista; blocuri.push(L.tip === 'ul' ? <ul key={blocuri.length}>{L.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</ul> : <ol key={blocuri.length}>{L.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</ol>); lista = null } }
  let tabel: string[][] | null = null
  const flushTabel = () => {
    if (!tabel) return
    const [cap, ...rest] = tabel
    blocuri.push(<div key={blocuri.length} className={css.tableWrap}><table>
      <thead><tr>{cap.map((c, i) => <th key={i}>{inline(c)}</th>)}</tr></thead>
      <tbody>{rest.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
    </table></div>)
    tabel = null
  }
  for (const raw of text.split('\n')) {
    const l = raw.trimEnd()
    if (/^\s*\|.*\|\s*$/.test(l)) {
      flush()
      const celule = l.trim().slice(1, -1).split('|').map(c => c.trim())
      if (celule.every(c => /^:?-{2,}:?$/.test(c))) continue
      ;(tabel ||= []).push(celule)
      continue
    }
    flushTabel()
    const ul = l.match(/^\s*[-*•]\s+(.*)/), ol = l.match(/^\s*\d+[.)]\s+(.*)/), h = l.match(/^#{1,4}\s+(.*)/)
    if (ul || ol) { const tip = ul ? 'ul' : 'ol'; if (!lista || lista.tip !== tip) { flush(); lista = { tip, items: [] } } lista.items.push((ul || ol)![1]); continue }
    flush()
    if (h) blocuri.push(<h4 key={blocuri.length}>{inline(h[1])}</h4>)
    else if (l.trim()) blocuri.push(<p key={blocuri.length}>{inline(l)}</p>)
  }
  flush(); flushTabel()
  return <div className={css.md}>{blocuri}</div>
}

function Intro({ icon, titlu, children, actiune }: { icon: Parameters<typeof Icon>[0]['name']; titlu: string; children: React.ReactNode; actiune?: React.ReactNode }) {
  return (
    <div className={css.intro}>
      <div className={css.introIcon}><Icon name={icon} size={20} /></div>
      <div className={css.introBody}>
        <h2 className={css.h2}>{titlu}</h2>
        <div className={css.lead}>{children}</div>
      </div>
      {actiune}
    </div>
  )
}

// --- Intreaba proiectul -------------------------------------------------------------------------
// Fereastra de chat cu inaltime fixa (cat ramane din ecran): doar conversatia se deruleaza, pagina nu.
function Intreaba({ firma, inPopup = false }: { firma: Firma; inPopup?: boolean }) {
  const [lista, setLista] = useState<Intrebare[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [lipsaMigrare, setLipsaMigrare] = useState(false)
  const [inaltime, setInaltime] = useState<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lipitJos = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch(`/api/proiect/intreaba?firmaId=${firma.id}`).then(r => r.json()).then(d => { setLista(d.intrebari || []); setLipsaMigrare(!!d.lipsaMigrare) }).catch(() => {})
  }, [firma.id])
  // Fereastra cat ecranul: pagina coboara singura pana la taburi (titlul iese din vedere), iar fereastra ia
  // tot restul inaltimii - sub antetul fix al aplicatiei si deasupra butonului fix "Pasul urmator".
  useEffect(() => {
    if (inPopup) return // in pop-up inaltimea o da fereastra (CSS), nu pagina
    const ANTET = 56, SUS = 12, JOS = 78
    const taburi = () => document.querySelector<HTMLElement>('[role="tablist"][aria-label="Secțiuni proiect"]')
    const calc = () => {
      const el = panelRef.current
      if (!el) return
      const t = taburi()
      const deasupra = t ? el.getBoundingClientRect().top - t.getBoundingClientRect().top : 0
      setInaltime(Math.max(300, window.innerHeight - ANTET - SUS - deasupra - JOS))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [inPopup])
  // Coborarea paginii se face abia dupa ce fereastra are inaltimea finala (altfel pagina inca e prea scurta).
  const coborat = useRef(false)
  useEffect(() => {
    if (inPopup || !inaltime || coborat.current) return
    coborat.current = true
    const t = document.querySelector<HTMLElement>('[role="tablist"][aria-label="Secțiuni proiect"]')
    if (t) requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, t.getBoundingClientRect().top + window.scrollY - 56 - 12), behavior: 'smooth' }))
  }, [inaltime, inPopup])
  // Raspunsul care curge tine conversatia jos - doar daca utilizatorul nu a urcat sa citeasca ceva mai vechi.
  useEffect(() => { const el = scrollRef.current; if (el && lipitJos.current) el.scrollTop = el.scrollHeight }, [lista, inaltime])
  // Textarea creste odata cu textul (pana la max-height din CSS), fara bara de redimensionare.
  useEffect(() => { const el = inputRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }, [text])

  async function trimite(q?: string) {
    const intrebare = (q ?? text).trim()
    if (!intrebare || busy) return
    setText(''); setBusy(true); lipitJos.current = true
    const istoric = lista.filter(x => !x.inCurs).slice(-6).map(x => ({ intrebare: x.intrebare, raspuns: x.raspuns }))
    setLista(prev => [...prev, { intrebare, raspuns: '', inCurs: true }])
    try {
      const res = await fetch('/api/proiect/intreaba', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id, intrebare, istoric }) })
      if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Întrebarea nu a putut fi trimisă') }
      const reader = res.body.getReader(), dec = new TextDecoder()
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += dec.decode(value, { stream: true })
        setLista(prev => prev.map((x, i) => i === prev.length - 1 ? { ...x, raspuns: acc } : x))
      }
      setLista(prev => prev.map((x, i) => i === prev.length - 1 ? { ...x, raspuns: acc, inCurs: false, created_at: new Date().toISOString() } : x))
    } catch (e) {
      setLista(prev => prev.map((x, i) => i === prev.length - 1 ? { ...x, raspuns: `⚠️ ${e instanceof Error ? e.message : 'Eroare'}`, inCurs: false } : x))
    } finally { setBusy(false); inputRef.current?.focus() }
  }

  async function sterge() {
    if (!confirm('Ștergi tot istoricul întrebărilor?')) return
    await fetch(`/api/proiect/intreaba?firmaId=${firma.id}`, { method: 'DELETE' })
    setLista([])
  }
  async function copiaza(t: string) {
    try { await navigator.clipboard.writeText(t); toast('Răspuns copiat') } catch { toast('Nu s-a putut copia', 'err') }
  }

  return (
    <div ref={panelRef} className={css.chatPanel} style={inaltime ? { height: inaltime } : undefined}>
      <div className={css.chatHeader}>
        <div className={css.introIcon} style={{ width: 34, height: 34, borderRadius: 10 }}><Icon name="sparkles" size={17} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={css.h3}>Întreabă proiectul</div>
          <div className={`${css.faint} ${css.hideMobile}`} style={{ marginTop: 2 }}>Planul, bugetul, actul adițional și memoriul {VERSIUNE_BUGET.split(' ')[0]} + toate datele din ContaFlow, cu sursa citată.</div>
        </div>
        {lista.length > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={sterge} disabled={busy}><Icon name="history" size={14} /> Șterge istoricul</button>}
      </div>
      {lipsaMigrare && <div className={css.warn} style={{ margin: 0, padding: '8px 20px' }}>Istoricul nu se salvează încă — rulează migrarea SQL (tabelul proiect_intrebari). Răspunsurile funcționează oricum.</div>}

      <div ref={scrollRef} className={css.messages} onScroll={e => { const el = e.currentTarget; lipitJos.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}>
        {lista.length === 0 && (
          <div className={css.emptyChat}>
            <div className={css.eyebrow} style={{ marginBottom: 10 }}>Începe cu o întrebare</div>
            <div className={css.suggestions}>
              {SUGESTII.map(q => <button key={q} type="button" className={css.suggestion} onClick={() => trimite(q)} disabled={busy}><Icon name="arrowRight" size={14} /><span>{q}</span></button>)}
            </div>
          </div>
        )}

        {lista.map((x, i) => {
          const { curat, fapte } = extrageMemorieDinRaspuns(x.raspuns)
          return (
            <div key={x.id || i} className={css.turn}>
              <div className={css.question}>{x.intrebare}</div>
              <div className={css.answer}>
                <div className={css.avatar} aria-hidden><Icon name="sparkles" size={16} /></div>
                <div className={css.answerBody}>
                  {curat
                    ? <Markdown text={curat} />
                    : <span className={css.thinking}><span className={css.dots}><i /><i /><i /></span>Caut în documentele și datele proiectului…</span>}
                  {x.inCurs && curat && <span className={css.caret} aria-hidden />}
                  {!x.inCurs && fapte.length > 0 && <div className={css.remembered}>
                    <strong><Icon name="check" size={14} strokeWidth={2.25} /> Reținut în memoria proiectului</strong>
                    <ul>{fapte.map((f, j) => <li key={j}>{f.data.split('-').reverse().join('.')} · {f.categorie}: {f.text}</li>)}</ul>
                  </div>}
                  {!x.inCurs && curat && (
                    <div className={css.meta}>
                      <span className={css.faint}>{x.created_at ? new Date(x.created_at).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      <button type="button" className={css.copy} onClick={() => copiaza(curat)}>Copiază</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className={css.chatFooter}>
        <div className={css.composer}>
          <div className={css.composerRow}>
            <textarea ref={inputRef} className={css.textarea} value={text} onChange={e => setText(e.target.value)} rows={1} aria-label="Întrebarea ta"
              placeholder="Întreabă orice despre proiect — ex.: Ce trebuie să am în dosar pentru tranșa 2?"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); trimite() } }} />
            <button type="button" className={css.send} onClick={() => trimite()} disabled={busy || !text.trim()} aria-label={busy ? 'Se răspunde' : 'Trimite întrebarea'} title="Trimite (Enter)">
              <Icon name="send" size={17} />
            </button>
          </div>
        </div>
        <p className={`${css.hint} ${css.hideMobile}`}><kbd>Enter</kbd> trimite · <kbd>Shift</kbd>+<kbd>Enter</kbd> rând nou · poți pune întrebări de continuare</p>
      </div>
    </div>
  )
}

// --- Memoria proiectului: jurnalul cu ce s-a intamplat (sursa pentru AI si raportul lunar) ---------
function MemorieProiect({ firma }: { firma: Firma }) {
  const [lista, setLista] = useState<Memorie[]>([])
  const [lipsaMigrare, setLipsaMigrare] = useState(false)
  const [text, setText] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [categorie, setCategorie] = useState<string>('Activitate și clienți')
  const [busy, setBusy] = useState(false)
  const incarca = useCallback(() => {
    fetch(`/api/proiect/memorie?firmaId=${firma.id}`).then(r => r.json()).then(d => { setLista(d.memorie || []); setLipsaMigrare(!!d.lipsaMigrare) }).catch(() => {})
  }, [firma.id])
  useEffect(() => { incarca() }, [incarca])

  async function adauga() {
    if (!text.trim()) return
    setBusy(true)
    const r = await fetch('/api/proiect/memorie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id, data, categorie, text }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { toast(d.error || 'Nu s-a salvat', 'err'); return }
    setText(''); incarca(); toast('Reținut în memorie')
  }
  async function sterge(id: string) {
    if (!confirm('Ștergi această intrare din memorie?')) return
    await fetch(`/api/proiect/memorie?firmaId=${firma.id}&id=${id}`, { method: 'DELETE' })
    setLista(prev => prev.filter(m => m.id !== id))
  }
  const peLuni = lista.reduce<Record<string, Memorie[]>>((acc, m) => { (acc[m.data.slice(0, 7)] ||= []).push(m); return acc }, {})
  const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
  const SURSA: Record<string, string> = { manual: 'scris de tine', chat: 'din chat', plan: 'din plan' }

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div className={css.card}>
        <Intro icon="history" titlu="Memoria proiectului">
          Jurnalul cu ce s-a întâmplat efectiv — din ce scrii aici, ce îi spui AI-ului și stările marcate în plan. Din el se completează raportul lunar și răspunsurile AI-ului.
        </Intro>
        {lipsaMigrare && <div className={css.warn}>Memoria nu se poate salva încă — rulează migrarea SQL (tabelul proiect_memorie).</div>}
        <div style={{ marginTop: 18 }}>
          <textarea className={css.field} value={text} onChange={e => setText(e.target.value)} rows={2} aria-label="Ce s-a întâmplat"
            placeholder="Ce s-a întâmplat? Ex.: Am semnat contract de spălare lenjerii cu Pensiunea X (200 kg/lună)."
            style={{ resize: 'vertical' }} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) adauga() }} />
          <div className={css.formRow}>
            <input type="date" className={`${css.field} ${css.fieldSm}`} value={data} onChange={e => setData(e.target.value)} aria-label="Data" />
            <select className={`${css.field} ${css.fieldSm}`} value={categorie} onChange={e => setCategorie(e.target.value)} aria-label="Categorie">{CATEGORII_MEMORIE.map(c => <option key={c}>{c}</option>)}</select>
            <span className={css.grow} />
            <span className={css.faint}>⌘ + Enter</span>
            <button type="button" className="btn btn-primary" onClick={adauga} disabled={busy || !text.trim()}>{busy ? 'Salvez…' : 'Reține'}</button>
          </div>
        </div>
      </div>

      {Object.keys(peLuni).length === 0 && <div className={css.empty}>Nimic reținut încă. Primul fapt scris aici (sau spus AI-ului) apare în această listă.</div>}
      <div className={css.timeline}>
        {Object.entries(peLuni).map(([luna, items]) => (
          <section key={luna}>
            <div className={css.monthHead}>
              <span className={css.monthName}>{LUNI[Number(luna.slice(5, 7)) - 1]} {luna.slice(0, 4)}</span>
              <span className={css.faint}>L{lunaProiect(new Date(luna + '-15'))} · {items.length} {items.length === 1 ? 'intrare' : 'intrări'}</span>
            </div>
            <ul className={css.entries}>
              {items.map(m => (
                <li key={m.id} className={css.entry}>
                  <div className={css.day}>{m.data.slice(8, 10)}.{m.data.slice(5, 7)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className={css.entryText}>{m.text}</div>
                    <div className={css.tags}><span className={css.tag}>{m.categorie}</span><span className={css.tag}>{SURSA[m.sursa] || m.sursa}</span></div>
                  </div>
                  <button type="button" className={css.remove} onClick={() => sterge(m.id)} title="Șterge din memorie" aria-label="Șterge din memorie"><Icon name="close" size={14} /></button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

// --- Plan: unde suntem, activitati, obligatii --------------------------------------------------
function SelectStatus({ value, implicit, onChange }: { value?: StatusPlan; implicit: string; onChange: (s: StatusPlan) => void }) {
  return (
    <select className={css.select} value={value || ''} onChange={e => e.target.value && onChange(e.target.value as StatusPlan)} aria-label="Stare">
      <option value="">{implicit}</option>
      {(Object.keys(STATUS_PLAN) as StatusPlan[]).map(s => <option key={s} value={s}>{STATUS_PLAN[s]}</option>)}
    </select>
  )
}
const BADGE: Record<StatusPlan, string> = { facut: 'badge badge-success', in_curs: 'badge badge-warning', urmeaza: 'badge', amanat: 'badge', nu_se_aplica: 'badge' }

function Nota({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial)
  useEffect(() => setV(initial), [initial])
  return <input className={css.note} value={v} onChange={e => setV(e.target.value)} onBlur={() => v !== initial && onSave(v)} placeholder="+ Adaugă o notă (ex. depus la 12.05, nr. înregistrare…)" aria-label="Notă" />
}

function Plan({ firma, stari, salveaza, achizitii, lipsaMigrare }: { firma: Firma; stari: StarePlan[]; salveaza: (cheie: string, p: Partial<StarePlan>) => void; achizitii: { linie_buget?: string | null; status: string }[]; lipsaMigrare: boolean }) {
  const pathname = usePathname()
  const linkAchizitii = pathname.replace(/\/[^/]+$/, '/achizitii')
  const azi = new Date()
  const L = lunaProiect(azi)
  const etapa = etapaProiect(azi)
  const st = (k: string) => stari.find(s => s.cheie === k)
  // Tot ce are termenul din plan trecut si nu e "Făcut"/"Nu se aplică": nemarcat -> "De confirmat",
  // marcat "În curs" -> lista separata "În lucru, peste termen" (confirmat, dar inca intarziat).
  const pesteTermen = [
    ...ACTIVITATI.filter(a => statusImplicitActivitate(a, L).intarziere).map(a => ({ cheie: a.cheie, titlu: `${a.cod} · ${a.titlu}`, detaliu: `în plan până în ${etichetaLuna(a.luni[1])}` })),
    ...OBLIGATII.filter(o => termenDepasit(o, azi)).map(o => ({ cheie: o.cheie, titlu: o.titlu, detaliu: `termen ${dataRo(o.termen!)}` })),
  ].filter(d => !['facut', 'nu_se_aplica'].includes(st(d.cheie)?.status || ''))
  const deConfirmat = pesteTermen.filter(d => !['in_curs', 'amanat'].includes(st(d.cheie)?.status || ''))
  const inLucru = pesteTermen.filter(d => st(d.cheie)?.status === 'in_curs')
  const amanate = pesteTermen.filter(d => st(d.cheie)?.status === 'amanat')
  const folosite = new Set(achizitii.flatMap(a => coduriDin(a.linie_buget)))
  const cumparate = BUGET_ACHIZITII.filter(l => folosite.has(l.cod)).length
  const pct = Math.max(0, Math.min(100, Math.round((Math.min(L, 18) / 18) * 100)))
  const categorii = [...new Set(OBLIGATII.map(o => o.categorie))] as CategorieObligatie[]
  const facute = ACTIVITATI.filter(a => st(a.cheie)?.status === 'facut').length

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div className={css.card}>
        <div className={css.sectionHead}>
          <h2 className={css.h2}>Unde suntem: {etapa.eticheta}</h2>
          <span className={css.faint}>Implementare {dataRo(PERIOADA.start)} – {dataRo(PERIOADA.sfarsitImplementare)} · sustenabilitate până la {dataRo(PERIOADA.sfarsitSustenabilitate)}</span>
        </div>
        <div className={css.progress}><div style={{ width: `${pct}%` }} /></div>
        <div className={css.progressLabels}><span className={css.faint}>L1</span><span className={css.faint}>{pct}% din implementare</span><span className={css.faint}>L18</span></div>
        {lipsaMigrare && <div className={css.warn}>Stările nu se pot salva încă — rulează migrarea SQL (tabelul proiect_plan_stari).</div>}
      </div>

      <div className={css.stats}>
        <div className={css.stat}><div className={css.eyebrow}>Luna proiectului</div><div className={css.statValue}>L{Math.min(Math.max(L, 1), 18)}<small>/ 18</small></div><div className={css.statHint}>{etichetaLuna(Math.min(Math.max(L, 1), 18))}</div></div>
        <div className={css.stat}><div className={css.eyebrow}>Achiziții pornite</div><div className={css.statValue}>{cumparate}<small>/ {BUGET_ACHIZITII.length}</small></div><div className={css.statHint}><Link href={linkAchizitii}>Deschide Achiziții →</Link></div></div>
        <div className={css.stat}><div className={css.eyebrow}>Activități făcute</div><div className={css.statValue}>{facute}<small>/ {ACTIVITATI.length}</small></div><div className={css.statHint}>marcate „Făcut” în plan</div></div>
        <div className={`${css.stat} ${deConfirmat.length ? css.statWarn : ''}`}><div className={css.eyebrow}>De confirmat</div><div className={css.statValue}>{deConfirmat.length}</div><div className={css.statHint}>{deConfirmat.length ? 'termen din plan trecut' : 'nimic restant'}</div></div>
      </div>

      {deConfirmat.length > 0 && (
        <div className={`${css.card} ${css.callout}`}>
          <h3 className={css.h3}>De confirmat — termenul din plan a trecut</h3>
          <p className={css.lead}>Marchează „Făcut” ce e rezolvat; ce nu e încă făcut e întârziere față de plan (de menționat în raportul lunar).</p>
          <ul className={css.list}>
            {deConfirmat.map(d => (
              <li key={d.cheie} className={css.row}>
                <div className={css.rowMain}><div className={css.rowTitle}>{d.titlu}</div><div className={css.faint} style={{ marginTop: 3 }}>{d.detaliu}</div></div>
                <div className={css.rowActions}>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => salveaza(d.cheie, { status: 'facut' })}><Icon name="check" size={13} strokeWidth={2.25} /> Făcut</button>
                  <button type="button" className="btn btn-sm" onClick={() => salveaza(d.cheie, { status: 'in_curs' })}>În curs</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => salveaza(d.cheie, { status: 'amanat' })} title="Nu e necesar momentan — se mută la „Amânate”, de unde îl poți relua">Amână</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {inLucru.length > 0 && (
        <div className={css.card}>
          <h3 className={css.h3}>În lucru, peste termenul din plan <span className="badge badge-warning" style={{ marginLeft: 6 }}>{inLucru.length}</span></h3>
          <p className={css.lead}>Confirmate ca „În curs” — încă întârziate față de plan. Marchează „Făcut” când se încheie.</p>
          <ul className={css.list}>
            {inLucru.map(d => (
              <li key={d.cheie} className={css.row}>
                <div className={css.rowMain}><div className={css.rowTitle}>{d.titlu}</div><div className={css.faint} style={{ marginTop: 3 }}>{d.detaliu}</div></div>
                <div className={css.rowActions}>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => salveaza(d.cheie, { status: 'facut' })}><Icon name="check" size={13} strokeWidth={2.25} /> Făcut</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => salveaza(d.cheie, { status: 'urmeaza' })} title="Scoate din „În curs” (revine la „De confirmat”)">Anulează</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {amanate.length > 0 && (
        <details className={`${css.card} ${css.details}`}>
          <summary><h3 className={css.h3}>Amânate — nu sunt necesare momentan <span className="badge" style={{ marginLeft: 6 }}>{amanate.length}</span></h3><Icon name="chevronDown" size={16} /></summary>
          <ul className={css.list}>
            {amanate.map(d => (
              <li key={d.cheie} className={css.row}>
                <div className={css.rowMain}><div className={css.rowTitle} style={{ color: 'var(--text-secondary)' }}>{d.titlu}</div><div className={css.faint} style={{ marginTop: 3 }}>{d.detaliu}</div></div>
                <div className={css.rowActions}>
                  <button type="button" className="btn btn-sm" onClick={() => salveaza(d.cheie, { status: 'urmeaza' })} title="Revine la „De confirmat”">Reia</button>
                  <button type="button" className="btn btn-sm" onClick={() => salveaza(d.cheie, { status: 'facut' })}><Icon name="check" size={13} strokeWidth={2.25} /> Făcut</button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className={css.card}>
        <div className={css.sectionHead} style={{ marginBottom: 14 }}>
          <h3 className={css.h3}>Graficul de implementare</h3>
          <span className={css.faint}>A1–A18 · luna curentă evidențiată</span>
        </div>
        <div className={css.gantt}>
          {Array.from({ length: 18 }, (_, i) => <div key={i} className={css.ganttHead} data-now={i + 1 === L}>L{i + 1}</div>)}
        </div>
        {ACTIVITATI.map(a => {
          const s = st(a.cheie), impl = statusImplicitActivitate(a, L)
          return (
            <div key={a.cheie} className={css.activity}>
              <div className={css.gantt}>
                {Array.from({ length: 18 }, (_, i) => {
                  const inPlan = i + 1 >= a.luni[0] && i + 1 <= a.luni[1]
                  return <div key={i} className={css.cell} data-plan={inPlan} data-done={inPlan && s?.status === 'facut'} data-now={i + 1 === L} />
                })}
              </div>
              <div className={css.row} style={{ padding: 0 }}>
                <div className={css.rowMain}>
                  <div className={css.rowTitle}><span className={css.code}>{a.cod}</span>{a.titlu} {s && <span className={BADGE[s.status]} style={{ marginLeft: 6 }}>{STATUS_PLAN[s.status]}</span>}{!s && impl.intarziere && <span className="badge badge-warning" style={{ marginLeft: 6 }}>termen trecut</span>}</div>
                  <div className={css.rowSub}>{etichetaLuna(a.luni[0])} – {etichetaLuna(a.luni[1])} · rezultat: {a.rezultat}</div>
                </div>
                <SelectStatus value={s?.status} implicit={`— ${impl.intarziere ? 'de confirmat' : STATUS_PLAN[impl.status].toLowerCase()} —`} onChange={v => salveaza(a.cheie, { status: v })} />
              </div>
              {s && <Nota initial={s.nota || ''} onSave={v => salveaza(a.cheie, { status: s.status, nota: v })} />}
            </div>
          )
        })}
      </div>

      {categorii.map(c => (
        <div key={c} className={css.card}>
          <h3 className={css.h3}>{c}</h3>
          {OBLIGATII.filter(o => o.categorie === c).map(o => {
            const s = st(o.cheie), dep = termenDepasit(o, azi)
            return (
              <div key={o.cheie} className={css.activity}>
                <div className={css.row} style={{ padding: 0, alignItems: 'flex-start' }}>
                  <div className={css.rowMain}>
                    <div className={css.rowTitle}><strong>{o.titlu}</strong> {s && <span className={BADGE[s.status]} style={{ marginLeft: 6 }}>{STATUS_PLAN[s.status]}</span>}{!s && dep && <span className="badge badge-warning" style={{ marginLeft: 6 }}>termen depășit</span>}</div>
                    <div className={css.rowSub}>{o.ce}</div>
                    <div className={css.faint} style={{ marginTop: 4 }}>{o.termen ? `Termen: ${dataRo(o.termen)} · ` : o.anual ? 'Anual · ' : ''}Sursa: {o.sursa}</div>
                  </div>
                  <SelectStatus value={s?.status} implicit="— nemarcat —" onChange={v => salveaza(o.cheie, { status: v })} />
                </div>
                {s && <Nota initial={s.nota || ''} onSave={v => salveaza(o.cheie, { status: s.status, nota: v })} />}
              </div>
            )
          })}
        </div>
      ))}
      <div className={css.faint} style={{ textAlign: 'center' }}>Proiect: {firma.nume} · documente în vigoare: {VERSIUNE_BUGET}</div>
    </div>
  )
}

function Indicatori() {
  const t2 = INDICATORI.transe2, t3 = INDICATORI.transe3
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div className={css.stats}>
        <div className={css.stat}><div className={css.eyebrow}>Locuri de muncă noi</div><div className={css.statValue}>{INDICATORI.locuriMunca}</div><div className={css.statHint}>din care {INDICATORI.vulnerabili} pentru persoane vulnerabile din mediul rural</div></div>
        <div className={css.stat}><div className={css.eyebrow}>Cofinanțare</div><div className={css.statValue}>{INDICATORI.cofinantareProcent}<small>%</small></div><div className={css.statHint}>contribuție proprie asumată</div></div>
        <div className={css.stat}><div className={css.eyebrow}>Tranșa 1</div><div className={css.statValue} style={{ fontSize: 20 }}>{lei(t2.transa1)}</div><div className={css.statHint}>varianta în 2 tranșe (70%)</div></div>
      </div>
      <div className={css.card}>
        <h3 className={css.h3}>Indicatori economici asumați</h3>
        <table className={css.table}>
          <thead><tr><th>An</th><th>Venituri încasate (plan)</th><th>Profit (plan)</th></tr></thead>
          <tbody>{INDICATORI.profit.map(p => { const v = INDICATORI.venituri.find(x => x.an === p.an); return <tr key={p.an}><td>{p.an}</td><td>{v ? lei(v.valoare) + (v.nota ? ` (${v.nota})` : '') : '—'}</td><td>{lei(p.valoare)}</td></tr> })}</tbody>
        </table>
        <div className={css.source}>Sursa: Plan AA3, I.1.3 (pag. 5); Buget AA3, foaia 4_grafic tranșe</div>
      </div>
      <div className={css.card}>
        <h3 className={css.h3}>Indicatori sociali (pe an, 2026–2028)</h3>
        <table className={css.table}>
          <thead><tr><th>Indicator</th><th>Țintă / an</th></tr></thead>
          <tbody>{INDICATORI.sociali.map(x => <tr key={x.titlu}><td>{x.titlu}</td><td>{x.pe_an} {x.um}</td></tr>)}</tbody>
        </table>
        <div className={css.source}>Sursa: Plan AA3, I.2.3 (pag. 7)</div>
      </div>
      <div className={css.card}>
        <h3 className={css.h3}>Tranșe de finanțare</h3>
        <div className={css.tranches}>
          <div className={css.tranche}>
            <div className={css.rowTitle}><strong>2 tranșe</strong> <span className={css.faint}>70% / 30%</span></div>
            <ul>
              <li>Tranșa 1: <strong>{lei(t2.transa1)}</strong></li>
              <li>Pentru tranșa 2 ({lei(t2.transa2)}): cheltuit minimum {lei(t2.minCheltuitDinT1)} din tranșa 1, cofinanțare minimum {lei(t2.minCofinantare)}, venituri generate minimum {lei(t2.minVenituri)}</li>
            </ul>
          </div>
          <div className={css.tranche}>
            <div className={css.rowTitle}><strong>3 tranșe</strong> <span className={css.faint}>50% / 40% / 10%</span></div>
            <ul>
              <li>Tranșa 1: <strong>{lei(t3.transa1)}</strong>; pentru tranșa 2 ({lei(t3.transa2)}): cheltuit minimum {lei(t3.minCheltuitDinT1)} din tranșa 1 și cofinanțare minimum {lei(t3.minCofinantare)}</li>
              <li>Pentru tranșa 3 ({lei(t3.transa3)}): cheltuit minimum {lei(t3.minCheltuitT1T2)} din tranșele 1+2</li>
            </ul>
          </div>
        </div>
        <div className={css.source}>Sursa: Buget AA3, foaia 4_grafic tranșe. Varianta se alege la prima cerere de plată.</div>
      </div>
    </div>
  )
}

export default function PlanProiectModule({ firma, inPopup = false }: Props) {
  const [tab, setTab] = useState<Tab>('intreaba')
  const [stari, setStari] = useState<StarePlan[]>([])
  const [lipsaMigrare, setLipsaMigrare] = useState(false)
  const [achizitii, setAchizitii] = useState<{ linie_buget?: string | null; status: string }[]>([])
  const [platiIntarziate, setPlatiIntarziate] = useState(0)

  useEffect(() => {
    fetch(`/api/proiect/plan-stari?firmaId=${firma.id}`).then(r => r.json()).then(d => { setStari(d.stari || []); setLipsaMigrare(!!d.lipsaMigrare) }).catch(() => {})
    fetch(`/api/achizitii?firmaId=${firma.id}`).then(r => r.json()).then(d => setAchizitii(Array.isArray(d) ? d : [])).catch(() => {})
    // Numarul de pe tab-ul Buget: lunile trecute cu plati planificate fara OP inregistrat
    fetch(`/api/proiect/plati?firmaId=${firma.id}`).then(r => r.json()).then(d => setPlatiIntarziate(new Set(executieBuget(((d.plati || []) as PlataProiect[]).map(p => ({ ...p, suma: Number(p.suma) }))).urmatoare.filter(u => u.intarziat).map(u => u.luna)).size)).catch(() => {})
  }, [firma.id])

  const salveaza = useCallback(async (cheie: string, p: Partial<StarePlan>) => {
    const vechi = stari
    const urm: StarePlan = { cheie, status: p.status || 'in_curs', nota: p.nota ?? vechi.find(s => s.cheie === cheie)?.nota ?? null }
    setStari(prev => [...prev.filter(s => s.cheie !== cheie), urm])
    const r = await fetch('/api/proiect/plan-stari', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaId: firma.id, cheie, status: urm.status, nota: urm.nota }) })
    if (!r.ok) { const d = await r.json().catch(() => ({})); toast(d.error || 'Nu s-a salvat', 'err'); setStari(vechi) }
  }, [firma.id, stari])

  const deConfirmat = useMemo(() => {
    const L = lunaProiect()
    const ok = (k: string) => ['facut', 'nu_se_aplica', 'in_curs', 'amanat'].includes(stari.find(s => s.cheie === k)?.status || '')
    return ACTIVITATI.filter(a => statusImplicitActivitate(a, L).intarziere && !ok(a.cheie)).length + OBLIGATII.filter(o => termenDepasit(o) && !ok(o.cheie)).length
  }, [stari])

  // In pop-up (480 px) etichetele sunt scurte, ca sa incapa toate cele 5 sectiuni
  const TABURI: { k: Tab; label: string; icon: Parameters<typeof Icon>[0]['name']; count?: number }[] = [
    { k: 'intreaba', label: inPopup ? 'Întreabă' : 'Întreabă proiectul', icon: 'sparkles' },
    { k: 'memorie', label: inPopup ? 'Memorie' : 'Memoria proiectului', icon: 'history' },
    { k: 'plan', label: inPopup ? 'Plan' : 'Plan și obligații', icon: 'calendar', count: deConfirmat },
    { k: 'buget', label: inPopup ? 'Buget' : 'Buget și plăți', icon: 'bank', count: platiIntarziate },
    { k: 'indicatori', label: inPopup ? 'Indicatori' : 'Indicatori și tranșe', icon: 'chart' },
  ]
  const continut = (
    <>
      {tab === 'intreaba' && <Intreaba firma={firma} inPopup={inPopup} />}
      {tab === 'memorie' && <MemorieProiect firma={firma} />}
      {tab === 'plan' && <Plan firma={firma} stari={stari} salveaza={salveaza} achizitii={achizitii} lipsaMigrare={lipsaMigrare} />}
      {tab === 'buget' && <BugetProiect firma={firma} onIntarziate={setPlatiIntarziate} />}
      {tab === 'indicatori' && <Indicatori />}
    </>
  )
  const taburi = (
    <div className={css.tabs} role="tablist" aria-label={inPopup ? 'Secțiuni proiect (fereastră)' : 'Secțiuni proiect'}>
      {TABURI.map(t => (
        <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={css.tab} onClick={() => setTab(t.k)}>
          <Icon name={t.icon} size={15} />{t.label}{t.count ? <span className={css.count} title={t.k === 'buget' ? `${t.count} luni trecute cu plăți planificate fără OP` : `${t.count} de confirmat`}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  )
  if (inPopup) return <div className={`${css.root} ${css.rootPopup}`}>{taburi}<div className={css.popBody}>{continut}</div></div>
  return (
    <div className={css.root}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {taburi}
        <button type="button" className="btn btn-sm" onClick={() => window.dispatchEvent(new CustomEvent('cf:proiect-popup', { detail: { open: true } }))}
          title="Deschide Plan & AI proiect într-o fereastră care rămâne deschisă peste celelalte pagini (Alt+P)">
          <span aria-hidden>⧉</span> Deschide ca pop-up
        </button>
      </div>
      {continut}
    </div>
  )
}

'use client'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ACTIVITATI, INDICATORI, OBLIGATII, PERIOADA, STATUS_PLAN, etapaProiect, etichetaLuna, lunaProiect, statusImplicitActivitate, termenDepasit, type CategorieObligatie, type StarePlan, type StatusPlan } from '@/lib/proiect-plan'
import { BUGET_ACHIZITII, VERSIUNE_BUGET, coduriDin } from '@/lib/achizitii-procedura'
import { CATEGORII_MEMORIE, extrageMemorieDinRaspuns, type Memorie } from '@/lib/proiect-memorie'

interface Firma { id: string; slug: string; nume: string; culoare: string }
interface Props { firma: Firma; lunaId: string }
interface Intrebare { id?: string; intrebare: string; raspuns: string; created_at?: string; inCurs?: boolean }
type Tab = 'intreaba' | 'memorie' | 'plan' | 'indicatori'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }
const MUTED: React.CSSProperties = { fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }
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

// Markdown minimal (titluri, liste, **bold**) -> React, fara HTML injectat.
function inline(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>)
}
function Markdown({ text }: { text: string }) {
  const blocuri: React.ReactNode[] = []
  let lista: { tip: 'ul' | 'ol'; items: string[] } | null = null
  const flush = () => { if (lista) { const L = lista; blocuri.push(L.tip === 'ul' ? <ul key={blocuri.length} style={{ margin: '4px 0 8px', paddingLeft: 20 }}>{L.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</ul> : <ol key={blocuri.length} style={{ margin: '4px 0 8px', paddingLeft: 22 }}>{L.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</ol>); lista = null } }
  let tabel: string[][] | null = null
  const flushTabel = () => {
    if (!tabel) return
    const [cap, ...rest] = tabel
    blocuri.push(<div key={blocuri.length} style={{ overflowX: 'auto', margin: '4px 0 10px' }}><table style={{ borderCollapse: 'collapse', fontSize: 'var(--fs-sm)', minWidth: '60%' }}>
      <thead><tr>{cap.map((c, i) => <th key={i} style={{ textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600 }}>{inline(c)}</th>)}</tr></thead>
      <tbody>{rest.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>{inline(c)}</td>)}</tr>)}</tbody>
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
    if (h) blocuri.push(<div key={blocuri.length} style={{ fontWeight: 700, margin: '10px 0 4px', color: 'var(--text-primary)' }}>{inline(h[1])}</div>)
    else if (l.trim()) blocuri.push(<p key={blocuri.length} style={{ margin: '0 0 8px' }}>{inline(l)}</p>)
  }
  flush(); flushTabel()
  return <div style={{ fontSize: 'var(--fs-md)', lineHeight: 1.6, color: 'var(--text-primary)' }}>{blocuri}</div>
}

// --- Intreaba proiectul -------------------------------------------------------------------------
function Intreaba({ firma }: { firma: Firma }) {
  const [lista, setLista] = useState<Intrebare[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [lipsaMigrare, setLipsaMigrare] = useState(false)
  const josRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/proiect/intreaba?firmaId=${firma.id}`).then(r => r.json()).then(d => { setLista(d.intrebari || []); setLipsaMigrare(!!d.lipsaMigrare) }).catch(() => {})
  }, [firma.id])
  useEffect(() => { josRef.current?.scrollIntoView({ block: 'nearest' }) }, [lista])

  async function trimite(q?: string) {
    const intrebare = (q ?? text).trim()
    if (!intrebare || busy) return
    setText(''); setBusy(true)
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
      setLista(prev => prev.map((x, i) => i === prev.length - 1 ? { ...x, raspuns: acc, inCurs: false } : x))
    } catch (e) {
      setLista(prev => prev.map((x, i) => i === prev.length - 1 ? { ...x, raspuns: `⚠️ ${e instanceof Error ? e.message : 'Eroare'}`, inCurs: false } : x))
    } finally { setBusy(false) }
  }

  async function sterge() {
    if (!confirm('Ștergi tot istoricul întrebărilor?')) return
    await fetch(`/api/proiect/intreaba?firmaId=${firma.id}`, { method: 'DELETE' })
    setLista([])
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...card, display: 'flex', gap: 14, alignItems: 'flex-start', borderColor: 'var(--accent)' }}>
        <div style={{ fontSize: 26, lineHeight: 1 }}>✦</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-primary)' }}>Întreabă proiectul</div>
          <div style={MUTED}>Răspunde din planul de afaceri, bugetul, actul adițional și memoriul {VERSIUNE_BUGET.split(' ')[0]}, plus datele reale din ContaFlow (achiziții, stări, raport lunar), cu sursa citată. Ce nu reiese din documente îți spune clar și îți sugerează ce să întrebi la PROSOCIAL.</div>
          {lipsaMigrare && <div style={{ ...MUTED, color: 'var(--warning)', marginTop: 6 }}>Istoricul nu se salvează încă — rulează migrarea SQL (tabelul proiect_intrebari). Răspunsurile funcționează oricum.</div>}
        </div>
        {lista.length > 0 && <button type="button" className="btn btn-sm" onClick={sterge} disabled={busy}>Șterge istoricul</button>}
      </div>

      {lista.length === 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SUGESTII.map(s => <button key={s} type="button" className="btn btn-sm" onClick={() => trimite(s)} disabled={busy} style={{ textAlign: 'left', whiteSpace: 'normal' }}>{s}</button>)}
        </div>
      )}

      {lista.map((x, i) => (
        <div key={x.id || i} style={{ display: 'grid', gap: 8 }}>
          <div style={{ justifySelf: 'end', maxWidth: '85%', background: 'var(--accent)', color: 'var(--accent-contrast, #fff)', borderRadius: 'var(--r-lg)', padding: '10px 14px', fontSize: 'var(--fs-md)', whiteSpace: 'pre-wrap' }}>{x.intrebare}</div>
          <div style={{ ...card, padding: '14px 18px' }}>
            {(() => {
              const { curat, fapte } = extrageMemorieDinRaspuns(x.raspuns)
              return <>
                {curat ? <Markdown text={curat} /> : <div style={MUTED}>Caut în documentele proiectului…</div>}
                {!x.inCurs && fapte.length > 0 && <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--surface-sunken)', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--success)' }}>✓ Reținut în memoria proiectului</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{fapte.map((f, i) => <li key={i}>{f.data.split('-').reverse().join('.')} · {f.categorie}: {f.text}</li>)}</ul>
                </div>}
              </>
            })()}
            {x.inCurs && x.raspuns && <span style={{ ...MUTED, display: 'inline-block', marginTop: 4 }}>▍</span>}
            {x.created_at && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 6 }}>{new Date(x.created_at).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
          </div>
        </div>
      ))}
      <div ref={josRef} />

      <div style={{ ...card, padding: 12, position: 'sticky', bottom: 12, boxShadow: 'var(--shadow-md, 0 4px 18px rgba(0,0,0,.08))' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Ex.: Pot cumpăra un uscător mai scump decât în buget? Ce trebuie să am în dosar pentru tranșa 2?"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); trimite() } }}
            style={{ flex: 1, resize: 'vertical', fontSize: 'var(--fs-md)', background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
          <button type="button" className="btn btn-primary" onClick={() => trimite()} disabled={busy || !text.trim()}>{busy ? 'Răspunde…' : 'Întreabă'}</button>
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 6 }}>Enter trimite · Shift+Enter rând nou · poți pune întrebări de continuare</div>
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
    setText(''); incarca()
  }
  async function sterge(id: string) {
    if (!confirm('Ștergi această intrare din memorie?')) return
    await fetch(`/api/proiect/memorie?firmaId=${firma.id}&id=${id}`, { method: 'DELETE' })
    setLista(prev => prev.filter(m => m.id !== id))
  }
  const peLuni = lista.reduce<Record<string, Memorie[]>>((acc, m) => { (acc[m.data.slice(0, 7)] ||= []).push(m); return acc }, {})
  const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
  const SURSA: Record<string, string> = { manual: 'scris de tine', chat: 'din chat', plan: 'din plan' }
  const inp: React.CSSProperties = { fontSize: 'var(--fs-md)', padding: '8px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...card, display: 'grid', gap: 10, borderColor: 'var(--accent)' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-primary)' }}>Memoria proiectului</div>
          <div style={MUTED}>Ce s-a întâmplat efectiv în proiect. Se completează din trei locuri: ce scrii aici, ce îi spui AI-ului în „Întreabă proiectul” (ex. „am primit autorizația de mediu azi”) și stările marcate în plan. De aici se completează raportul lunar („Completează din memoria proiectului”) și răspunsurile AI-ului.</div>
          {lipsaMigrare && <div style={{ ...MUTED, color: 'var(--warning)', marginTop: 6 }}>Memoria nu se poate salva încă — rulează migrarea SQL (tabelul proiect_memorie).</div>}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Ce s-a întâmplat? Ex.: Am semnat contract de spălare lenjerii cu Pensiunea X (200 kg/lună). / Control APM la locație pe 08.10, fără observații."
          style={{ ...inp, width: '100%', resize: 'vertical' }} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) adauga() }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={data} onChange={e => setData(e.target.value)} style={inp} />
          <select value={categorie} onChange={e => setCategorie(e.target.value)} style={inp}>{CATEGORII_MEMORIE.map(c => <option key={c}>{c}</option>)}</select>
          <button type="button" className="btn btn-primary" onClick={adauga} disabled={busy || !text.trim()}>{busy ? 'Salvez…' : 'Reține'}</button>
        </div>
      </div>
      {Object.keys(peLuni).length === 0 && <div style={MUTED}>Nimic reținut încă.</div>}
      {Object.entries(peLuni).map(([luna, items]) => (
        <div key={luna} style={{ ...card, display: 'grid', gap: 2 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, textTransform: 'capitalize' }}>{LUNI[Number(luna.slice(5, 7)) - 1]} {luna.slice(0, 4)} <span style={{ ...MUTED, fontWeight: 400, textTransform: 'none' }}>· L{lunaProiect(new Date(luna + '-15'))} · {items.length} {items.length === 1 ? 'intrare' : 'intrări'}</span></div>
          {items.map(m => (
            <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', minWidth: 46 }}>{m.data.slice(8, 10)}.{m.data.slice(5, 7)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }}>{m.text}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{m.categorie} · {SURSA[m.sursa] || m.sursa}</div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => sterge(m.id)} title="Șterge din memorie">×</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// --- Plan: unde suntem, activitati, obligatii --------------------------------------------------
function SelectStatus({ value, implicit, onChange }: { value?: StatusPlan; implicit: string; onChange: (s: StatusPlan) => void }) {
  return (
    <select value={value || ''} onChange={e => e.target.value && onChange(e.target.value as StatusPlan)}
      style={{ fontSize: 'var(--fs-sm)', padding: '5px 8px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-primary)' }}>
      <option value="">{implicit}</option>
      {(Object.keys(STATUS_PLAN) as StatusPlan[]).map(s => <option key={s} value={s}>{STATUS_PLAN[s]}</option>)}
    </select>
  )
}
const BADGE: Record<StatusPlan, string> = { facut: 'badge badge-success', in_curs: 'badge badge-warning', urmeaza: 'badge', amanat: 'badge', nu_se_aplica: 'badge' }

function Nota({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial)
  useEffect(() => setV(initial), [initial])
  return <input value={v} onChange={e => setV(e.target.value)} onBlur={() => v !== initial && onSave(v)} placeholder="Notă (ex. depus la 12.05, nr. înregistrare…)"
    style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '6px 9px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface-sunken)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }} />
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

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...card, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-primary)' }}>Unde suntem: {etapa.eticheta}</div>
          <div style={MUTED}>Implementare {dataRo(PERIOADA.start)}–{dataRo(PERIOADA.sfarsitImplementare)} · sustenabilitate până la {dataRo(PERIOADA.sfarsitSustenabilitate)}</div>
        </div>
        <div style={{ height: 8, background: 'var(--surface-sunken)', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} /></div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', ...MUTED }}>
          <span>Achiziții: <strong>{cumparate}</strong> din {BUGET_ACHIZITII.length} linii de buget pornite — <Link href={linkAchizitii}>deschide Achiziții →</Link></span>
          <span>Activități marcate făcute: <strong>{ACTIVITATI.filter(a => st(a.cheie)?.status === 'facut').length}</strong> din {ACTIVITATI.length}</span>
        </div>
        {lipsaMigrare && <div style={{ ...MUTED, color: 'var(--warning)' }}>Stările nu se pot salva încă — rulează migrarea SQL (tabelul proiect_plan_stari).</div>}
      </div>

      {deConfirmat.length > 0 && (
        <div style={{ ...card, borderColor: 'var(--warning)', display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>De confirmat ({deConfirmat.length}) — termenul din plan a trecut</div>
          <div style={MUTED}>Marchează „Făcut” ce e rezolvat; ce nu e încă făcut e întârziere față de plan (de menționat în raportul lunar).</div>
          {deConfirmat.map(d => (
            <div key={d.cheie} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }}>{d.titlu}</div><div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{d.detaliu}</div></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => salveaza(d.cheie, { status: 'facut' })}>✓ Făcut</button>
                <button type="button" className="btn btn-sm" onClick={() => salveaza(d.cheie, { status: 'in_curs' })}>În curs</button>
                <button type="button" className="btn btn-sm" onClick={() => salveaza(d.cheie, { status: 'amanat' })} title="Nu e necesar momentan — se mută la „Amânate”, de unde îl poți relua">Amână</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {inLucru.length > 0 && (
        <div style={{ ...card, display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>În lucru, peste termenul din plan ({inLucru.length})</div>
          <div style={MUTED}>Confirmate ca „În curs” — încă întârziate față de plan. Marchează „Făcut” când se încheie.</div>
          {inLucru.map(d => (
            <div key={d.cheie} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }}>{d.titlu} <span className="badge badge-warning" style={{ marginLeft: 4 }}>În curs</span></div><div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{d.detaliu}</div></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => salveaza(d.cheie, { status: 'facut' })}>✓ Făcut</button>
                <button type="button" className="btn btn-sm" onClick={() => salveaza(d.cheie, { status: 'urmeaza' })} title="Scoate din „În curs” (revine la „De confirmat”)">Anulează</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {amanate.length > 0 && (
        <details style={{ ...card, display: 'grid', gap: 8 }}>
          <summary style={{ fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>Amânate — nu sunt necesare momentan ({amanate.length})</summary>
          {amanate.map(d => (
            <div key={d.cheie} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--border)', marginTop: 6 }}>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-secondary)' }}>{d.titlu}</div><div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{d.detaliu}</div></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-sm" onClick={() => salveaza(d.cheie, { status: 'urmeaza' })} title="Revine la „De confirmat”">Reia</button>
                <button type="button" className="btn btn-sm" onClick={() => salveaza(d.cheie, { status: 'facut' })}>✓ Făcut</button>
              </div>
            </div>
          ))}
        </details>
      )}

      <div style={{ ...card, display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Activitățile din graficul de implementare (A1–A18)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(18, 1fr)', gap: 2, marginLeft: 0, fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
          {Array.from({ length: 18 }, (_, i) => <div key={i} style={{ fontWeight: i + 1 === L ? 700 : 400, color: i + 1 === L ? 'var(--accent)' : undefined }}>L{i + 1}</div>)}
        </div>
        {ACTIVITATI.map(a => {
          const s = st(a.cheie), impl = statusImplicitActivitate(a, L)
          return (
            <div key={a.cheie} style={{ display: 'grid', gap: 6, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(18, 1fr)', gap: 2 }}>
                {Array.from({ length: 18 }, (_, i) => {
                  const inPlan = i + 1 >= a.luni[0] && i + 1 <= a.luni[1]
                  return <div key={i} style={{ height: 6, borderRadius: 3, background: inPlan ? (s?.status === 'facut' ? 'var(--success)' : 'var(--accent)') : 'var(--surface-sunken)', opacity: inPlan ? 1 : .6, outline: i + 1 === L ? '1px solid var(--text-muted)' : undefined }} />
                })}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-primary)' }}><strong>{a.cod}</strong> · {a.titlu} {s && <span className={BADGE[s.status]} style={{ marginLeft: 6 }}>{STATUS_PLAN[s.status]}</span>}{!s && impl.intarziere && <span className="badge badge-warning" style={{ marginLeft: 6 }}>termen trecut</span>}</div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{etichetaLuna(a.luni[0])} – {etichetaLuna(a.luni[1])} · rezultat: {a.rezultat}</div>
                </div>
                <SelectStatus value={s?.status} implicit={`— ${impl.intarziere ? 'de confirmat' : STATUS_PLAN[impl.status].toLowerCase()} —`} onChange={v => salveaza(a.cheie, { status: v })} />
              </div>
              {s && <Nota initial={s.nota || ''} onSave={v => salveaza(a.cheie, { status: s.status, nota: v })} />}
            </div>
          )
        })}
      </div>

      {categorii.map(c => (
        <div key={c} style={{ ...card, display: 'grid', gap: 4 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{c}</div>
          {OBLIGATII.filter(o => o.categorie === c).map(o => {
            const s = st(o.cheie), dep = termenDepasit(o, azi)
            return (
              <div key={o.cheie} style={{ display: 'grid', gap: 6, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-primary)', fontWeight: 600 }}>{o.titlu} {s && <span className={BADGE[s.status]} style={{ marginLeft: 6, fontWeight: 400 }}>{STATUS_PLAN[s.status]}</span>}{!s && dep && <span className="badge badge-warning" style={{ marginLeft: 6, fontWeight: 400 }}>termen depășit</span>}</div>
                    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: 2 }}>{o.ce}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{o.termen ? `Termen: ${dataRo(o.termen)} · ` : o.anual ? 'Anual · ' : ''}Sursa: {o.sursa}</div>
                  </div>
                  <SelectStatus value={s?.status} implicit="— nemarcat —" onChange={v => salveaza(o.cheie, { status: v })} />
                </div>
                {s && <Nota initial={s.nota || ''} onSave={v => salveaza(o.cheie, { status: s.status, nota: v })} />}
              </div>
            )
          })}
        </div>
      ))}
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Proiect: {firma.nume} · documente în vigoare: {VERSIUNE_BUGET}</div>
    </div>
  )
}

function Indicatori() {
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { fontSize: 'var(--fs-md)', color: 'var(--text-primary)', padding: '7px 8px', borderBottom: '1px solid var(--border)' }
  const t2 = INDICATORI.transe2, t3 = INDICATORI.transe3
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Indicatori economici asumați</div>
        <div style={MUTED}>{INDICATORI.locuriMunca} locuri de muncă noi, din care {INDICATORI.vulnerabili} pentru persoane vulnerabile din mediul rural · cofinanțare {INDICATORI.cofinantareProcent}%</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead><tr><th style={th}>An</th><th style={th}>Venituri încasate (plan)</th><th style={th}>Profit (plan)</th></tr></thead>
          <tbody>{INDICATORI.profit.map(p => { const v = INDICATORI.venituri.find(x => x.an === p.an); return <tr key={p.an}><td style={td}>{p.an}</td><td style={td}>{v ? lei(v.valoare) + (v.nota ? ` (${v.nota})` : '') : '—'}</td><td style={td}>{lei(p.valoare)}</td></tr> })}</tbody>
        </table>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 6 }}>Sursa: Plan AA3, I.1.3 (pag. 5); Buget AA3, foaia 4_grafic tranșe</div>
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Indicatori sociali (pe an, 2026–2028)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Indicator</th><th style={th}>Țintă / an</th></tr></thead>
          <tbody>{INDICATORI.sociali.map(s => <tr key={s.titlu}><td style={td}>{s.titlu}</td><td style={td}>{s.pe_an} {s.um}</td></tr>)}</tbody>
        </table>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 6 }}>Sursa: Plan AA3, I.2.3 (pag. 7)</div>
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Tranșe de finanțare</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Varianta în 2 tranșe (70% / 30%)</div>
            <ul style={{ ...MUTED, paddingLeft: 18, margin: '6px 0 0' }}>
              <li>Tranșa 1: <strong>{lei(t2.transa1)}</strong></li>
              <li>Pentru tranșa 2 ({lei(t2.transa2)}): cheltuit minimum {lei(t2.minCheltuitDinT1)} din tranșa 1, cofinanțare minimum {lei(t2.minCofinantare)}, venituri generate minimum {lei(t2.minVenituri)}</li>
            </ul>
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Varianta în 3 tranșe (50% / 40% / 10%)</div>
            <ul style={{ ...MUTED, paddingLeft: 18, margin: '6px 0 0' }}>
              <li>Tranșa 1: <strong>{lei(t3.transa1)}</strong>; pentru tranșa 2 ({lei(t3.transa2)}): cheltuit minimum {lei(t3.minCheltuitDinT1)} din tranșa 1 și cofinanțare minimum {lei(t3.minCofinantare)}</li>
              <li>Pentru tranșa 3 ({lei(t3.transa3)}): cheltuit minimum {lei(t3.minCheltuitT1T2)} din tranșele 1+2</li>
            </ul>
          </div>
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 8 }}>Sursa: Buget AA3, foaia 4_grafic tranșe. Varianta se alege la prima cerere de plată.</div>
      </div>
    </div>
  )
}

export default function PlanProiectModule({ firma }: Props) {
  const [tab, setTab] = useState<Tab>('intreaba')
  const [stari, setStari] = useState<StarePlan[]>([])
  const [lipsaMigrare, setLipsaMigrare] = useState(false)
  const [achizitii, setAchizitii] = useState<{ linie_buget?: string | null; status: string }[]>([])

  useEffect(() => {
    fetch(`/api/proiect/plan-stari?firmaId=${firma.id}`).then(r => r.json()).then(d => { setStari(d.stari || []); setLipsaMigrare(!!d.lipsaMigrare) }).catch(() => {})
    fetch(`/api/achizitii?firmaId=${firma.id}`).then(r => r.json()).then(d => setAchizitii(Array.isArray(d) ? d : [])).catch(() => {})
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

  const TABURI: { k: Tab; label: string }[] = [
    { k: 'intreaba', label: '✦ Întreabă proiectul' },
    { k: 'memorie', label: 'Memoria proiectului' },
    { k: 'plan', label: `Plan și obligații${deConfirmat ? ` (${deConfirmat} de confirmat)` : ''}` },
    { k: 'indicatori', label: 'Indicatori și tranșe' },
  ]
  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TABURI.map(t => <button key={t.k} type="button" className={tab === t.k ? 'btn btn-primary' : 'btn'} onClick={() => setTab(t.k)}>{t.label}</button>)}
      </div>
      {tab === 'intreaba' && <Intreaba firma={firma} />}
      {tab === 'memorie' && <MemorieProiect firma={firma} />}
      {tab === 'plan' && <Plan firma={firma} stari={stari} salveaza={salveaza} achizitii={achizitii} lipsaMigrare={lipsaMigrare} />}
      {tab === 'indicatori' && <Indicatori />}
    </div>
  )
}

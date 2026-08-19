'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import UploadExtras from './UploadExtras'
import CopyButton from '@/components/CopyButton'
import DocumentSearch from '@/components/DocumentSearch'
import FacturiModule from '../modules/FacturiModule'
import NoteTranzactii from './NoteTranzactii'
import type { TaskItem } from '../modules/TaskSection'
import { legibil, tint } from '@/lib/colors'

const CAT: Record<string, { bg: string; c: string }> = {
  client:   { bg: 'rgba(74,222,128,.15)',  c: 'var(--accent-green)' },
  furnizor: { bg: 'light-dark(rgba(37,99,235,.35), rgba(96,165,250,.15))',  c: 'var(--accent-blue)' },
  taxa:     { bg: 'light-dark(rgba(220,38,38,.35), rgba(248,113,113,.15))', c: 'var(--accent-red)' },
  angajat:  { bg: 'rgba(167,139,250,.15)', c: '#A78BFA' },
  transfer: { bg: 'rgba(150,150,150,.15)', c: 'var(--c-aaaaaa)' },
  comision: { bg: 'rgba(251,146,60,.15)',  c: '#FB923C' },
  banca:    { bg: 'rgba(100,100,100,.15)', c: 'var(--c-888888)' },
  altele:   { bg: 'rgba(80,80,80,.12)',    c: 'var(--c-777777)' },
}

const PER = 10

interface Tx {
  id: string; extras_id: string; data_tranzactie: string
  descriere: string; descriere_curatata: string
  tip: 'debit'|'credit'; suma: number; valuta: string
  referinta: string|null
  categorie: string; document_id: string|null; note: string|null; status_note: string|null
  documente: { id:string; tip_document:string; furnizor:string; numar_document:string; fisier_nume:string }|null
  documenteToate?: { id:string; tip_document:string; furnizor:string; numar_document:string; fisier_nume:string }[]
}
interface Extras { id:string; valuta:string; iban?:string|null; pdf_path?:string|null; pdf_nume?:string|null; nr_tranzactii:number; nr_documentate:number; sold_final?:number }
interface Firma { id:string; slug:string; nume:string; culoare:string }

export default function ExtrasClient({ firma, lunaId, luna, lunaLabel, extrase: initExtrase, slug, facturiTasks, extrasFinalizat: initFinalizat }: {
  firma: Firma; lunaId: string; luna: string; lunaLabel: string; extrase: Extras[]; slug: string; facturiTasks: TaskItem[]; extrasFinalizat: boolean
}) {
  const [pageTab, setPageTab] = useState<'extras'|'facturi'|'note'>('extras')
  const [finalizat, setFinalizat] = useState(initFinalizat)
  const [finalizing, setFinalizing] = useState(false)
  const [txs, setTxs] = useState<Tx[]>([])
  const [extrase, setExtrase] = useState<Extras[]>(initExtrase)
  const [newSlots, setNewSlots] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all'|'lipsa'|'ok'|'na'>('all')
  const [flowFilter, setFlowFilter] = useState<'all'|'debit'|'credit'>('all')
  const [activeExtrasId, setActiveExtrasId] = useState(initExtrase[0]?.id || '')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<'list'|'workspace'>('workspace')
  const [activeTxIndex, setActiveTxIndex] = useState(0)
  const [exportingDocs, setExportingDocs] = useState(false)
  const [exportError, setExportError] = useState('')
  const restoredActiveId = useRef<string|null>(null)
  const pendingFocusId = useRef<string|null>(null)
  const restoredScrollY = useRef(0)
  const restored = useRef(false)
  const positionRestored = useRef(false)
  const c = firma.culoare || '#F27A1A'
  const workspaceKey = `contaflow:extras-workspace:${lunaId}`

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      // Load extrase counts
      const eRes = await fetch(`/api/extras/list?lunaId=${lunaId}`)
      if (eRes.ok) {
        const eData = await eRes.json()
        if (Array.isArray(eData) && eData.length) setExtrase(eData)
      }
      // Load tranzactii via server API (avoids RLS/CORS issues)
      const res = await fetch(`/api/tranzactii/list?lunaId=${lunaId}`)
      if (!res.ok) { setError(`Server error ${res.status}`); if (!silent) setLoading(false); return }
      const data = await res.json()
      if (!Array.isArray(data)) { setError('Format invalid'); if (!silent) setLoading(false); return }
      // Sort unresolved first
      data.sort((a: Tx, b: Tx) => {
        const aR = !!a.document_id || a.note === 'na'
        const bR = !!b.document_id || b.note === 'na'
        if (aR === bR) return new Date(a.data_tranzactie).getTime() - new Date(b.data_tranzactie).getTime()
        return aR ? 1 : -1
      })
      setTxs(data)
      if (restoredActiveId.current) {
        const restoredIndex = data.findIndex((tx: Tx) => tx.id === restoredActiveId.current)
        if (restoredIndex >= 0) setActiveTxIndex(restoredIndex)
      }
    } catch(e) {
      setError(String(e))
    }
    if (!silent) setLoading(false)
  }, [lunaId])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(workspaceKey) || '{}')
      if (saved.filter) setFilter(saved.filter)
      if (saved.flowFilter) setFlowFilter(saved.flowFilter)
      if (saved.viewMode) setViewMode(saved.viewMode)
      if (saved.activeExtrasId) setActiveExtrasId(saved.activeExtrasId)
      restoredActiveId.current = saved.activeTxId || null
      restoredScrollY.current = Number(saved.scrollY) || 0
    } catch {}
    restored.current = true
    load()
  }, [load, workspaceKey])

  const selectedExtras = extrase.find(extras => extras.id === activeExtrasId) || extrase[0]
  const scopedTxs = selectedExtras ? txs.filter(tx => tx.extras_id === selectedExtras.id) : txs
  const filtered = scopedTxs.filter(t => {
    const matchesStatus =
      filter === 'lipsa' ? (!t.document_id && t.note !== 'na') :
      filter === 'ok' ? !!t.document_id :
      filter === 'na' ? t.note === 'na' : true
    return matchesStatus && (flowFilter === 'all' || t.tip === flowFilter)
  })
  const pages = Math.ceil(filtered.length / PER)
  const pageItems = filtered.slice((page-1)*PER, page*PER)
  const counts = {
    all: scopedTxs.length,
    lipsa: scopedTxs.filter(t => !t.document_id && t.note !== 'na').length,
    ok: scopedTxs.filter(t => !!t.document_id).length,
    na: scopedTxs.filter(t => t.note === 'na').length,
  }
  const flowCounts = {
    all: scopedTxs.length,
    debit: scopedTxs.filter(t => t.tip === 'debit').length,
    credit: scopedTxs.filter(t => t.tip === 'credit').length,
  }
  const rez = counts.ok + counts.na
  const pct = scopedTxs.length > 0 ? Math.round((rez/scopedTxs.length)*100) : 0
  const overallRez = txs.filter(t => !!t.document_id || t.note === 'na').length
  const overallGata = txs.length > 0 && overallRez === txs.length
  const activeTx = filtered[Math.min(activeTxIndex, Math.max(filtered.length - 1, 0))]

  useEffect(() => {
    if (!restored.current || loading || positionRestored.current) return
    const activeIndex = restoredActiveId.current ? filtered.findIndex(tx => tx.id === restoredActiveId.current) : -1
    if (activeIndex >= 0) setActiveTxIndex(activeIndex)
    restoredActiveId.current = null
    requestAnimationFrame(() => window.scrollTo({ top: restoredScrollY.current }))
    positionRestored.current = true
  }, [filtered, loading])

  useEffect(() => {
    if (!pendingFocusId.current) return
    const nextIndex = filtered.findIndex(tx => tx.id === pendingFocusId.current)
    if (nextIndex >= 0) setActiveTxIndex(nextIndex)
    pendingFocusId.current = null
  }, [filtered])

  useEffect(() => {
    if (extrase.length && !extrase.some(extras => extras.id === activeExtrasId)) {
      setActiveExtrasId(extrase[0].id)
    }
  }, [activeExtrasId, extrase])

  useEffect(() => {
    if (!restored.current) return
    const save = () => localStorage.setItem(workspaceKey, JSON.stringify({
      filter, flowFilter, viewMode, activeExtrasId:selectedExtras?.id || null, activeTxId: activeTx?.id || null, scrollY: window.scrollY
    }))
    save()
    window.addEventListener('scroll', save, { passive:true })
    return () => window.removeEventListener('scroll', save)
  }, [activeTx?.id, filter, flowFilter, selectedExtras?.id, viewMode, workspaceKey])

  function setF(f: typeof filter) { setFilter(f); setPage(1); setActiveTxIndex(0) }
  function setFlow(f: typeof flowFilter) { setFlowFilter(f); setPage(1); setActiveTxIndex(0) }
  function selectExtras(id: string) { setActiveExtrasId(id); setPage(1); setActiveTxIndex(0) }

  async function exportDocuments() {
    setExportingDocs(true)
    setExportError('')
    const res = await fetch('/api/tranzactii/documente-pdf', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ lunaId, extrasId:selectedExtras?.id, extrasLabel:selectedExtras ? `documente_${selectedExtras.valuta}` : undefined, firmaNume:firma.nume, luna })
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${firma.nume}_${luna}_documente_${selectedExtras?.valuta || 'tranzactii'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const data = await res.json().catch(() => ({}))
      setExportError(data.error || 'PDF-ul nu a putut fi generat')
    }
    setExportingDocs(false)
  }

  async function updateNote(id: string, note: string|null) {
    const previous = txs.find(tx => tx.id === id)?.note || null
    setTxs(current => current.map(tx => tx.id === id ? { ...tx, note } : tx))
    try {
      const res = await fetch('/api/tranzactii/note', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, note}) })
      if (!res.ok) setTxs(current => current.map(tx => tx.id === id ? { ...tx, note:previous } : tx))
    } catch {
      setTxs(current => current.map(tx => tx.id === id ? { ...tx, note:previous } : tx))
    }
  }
  function markNA(id: string) {
    updateNote(id, 'na')
    if (filter === 'lipsa') {
      setActiveTxIndex(index => Math.min(index, Math.max(filtered.length - 2, 0)))
    } else {
      setActiveTxIndex(index => Math.min(index + 1, Math.max(filtered.length - 1, 0)))
    }
  }
  function clearNA(id: string) {
    updateNote(id, null)
  }

  async function toggleFinalizat(value: boolean) {
    setFinalizing(true)
    const previous = finalizat
    setFinalizat(value)
    try {
      // Daca marcam finalizat, extrasul e evident si incarcat (altfel n-ar exista tranzactii de documentat)
      const taskKeys = value ? ['extras.tranzactii_documentate', 'extras.incarcat'] : ['extras.tranzactii_documentate']
      const results = await Promise.all(taskKeys.map(taskKey =>
        fetch('/api/tasks/toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lunaId, taskKey, completat:value }) })
      ))
      if (results.some(res => !res.ok)) setFinalizat(previous)
    } catch {
      setFinalizat(previous)
    }
    setFinalizing(false)
  }

  async function updateStatusNote(id: string, statusNote: string|null) {
    const previous = txs.find(tx => tx.id === id)?.status_note || null
    setTxs(current => current.map(tx => tx.id === id ? { ...tx, status_note: statusNote } : tx))
    try {
      const res = await fetch('/api/tranzactii/status-note', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, statusNote}) })
      if (!res.ok) setTxs(current => current.map(tx => tx.id === id ? { ...tx, status_note:previous } : tx))
    } catch {
      setTxs(current => current.map(tx => tx.id === id ? { ...tx, status_note:previous } : tx))
    }
  }

  const onUploadSuccess = useCallback((uploadedTxId: string) => {
    // Mergi pur si simplu la urmatoarea tranzactie in ordine, nu la urmatoarea "nerezolvata"
    const nextIdx = activeTxIndex + 1
    if (nextIdx < filtered.length && filtered[nextIdx].id !== uploadedTxId) {
      pendingFocusId.current = filtered[nextIdx].id
    }
    load(true)
  }, [activeTxIndex, filtered, load])

  const PB = (dis: boolean, act=false): React.CSSProperties => ({
    fontSize:'12px', fontWeight:600, padding:'5px 11px', borderRadius:'7px',
    border:`1px solid ${act?c:'var(--c-2a2a2a)'}`, background:act?c:'var(--c-1a1a1a)',
    color:dis?'var(--c-333333)':act?'var(--c-ffffff)':'var(--c-888888)', cursor:dis?'not-allowed':'pointer', opacity:dis?.5:1
  })

  return (
    <>
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--c-0a0a0a)' }}>
      {/* Sidebar */}
      <aside style={{ width:'220px', flexShrink:0, background:'var(--c-0d0d0d)', borderRight:'1px solid var(--c-1e1e1e)', display:'flex', flexDirection:'column', padding:'20px 0', position:'sticky', top:0, height:'100vh' }}>
        <Link href="/dashboard" style={{ padding:'4px 18px 24px', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ width:'28px', height:'28px', background:'var(--c-ffffff)', borderRadius:'7px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <img src="/logo-icon.png" alt="ContaFlow" width={19} height={19} />
          </div>
          <span style={{ fontSize:'15px', fontWeight:700, color:'var(--c-ffffff)' }}>ContaFlow</span>
        </Link>
        <Link href={`/${slug}/${luna}`} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'8px 18px', fontSize:'13px', color:'var(--c-888888)' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          {firma.nume.replace(' SRL','')}
        </Link>
        <div style={{ height:'1px', background:'var(--c-1e1e1e)', margin:'8px 14px' }}/>
        <DocumentSearch firmaId={firma.id} culoare={c}/>
        <div style={{ height:'1px', background:'var(--c-1e1e1e)', margin:'8px 14px' }}/>
        <div style={{ padding:'8px 18px 4px', fontSize:'13px', fontWeight:600, color:'var(--c-dddddd)' }}>Extras de cont</div>
        {extrase.map(e => (
          <button key={e.id} onClick={()=>selectExtras(e.id)} style={{ padding:'7px 18px 7px 28px', display:'flex', justifyContent:'space-between', gap:'8px', border:'none', borderLeft:`2px solid ${selectedExtras?.id===e.id?c:'transparent'}`, background:selectedExtras?.id===e.id?'var(--c-181818)':'transparent', cursor:'pointer', textAlign:'left' }}>
            <span style={{ fontSize:'12px', color:selectedExtras?.id===e.id?'var(--c-ffffff)':'var(--c-777777)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.valuta}{e.iban ? ` · ${e.iban.slice(-6)}` : ''}</span>
            <span style={{ fontSize:'11px', fontWeight:600, color:'var(--accent-green)' }}>{e.nr_tranzactii} tx</span>
          </button>
        ))}
        {scopedTxs.length > 0 && <>
          <div style={{ height:'1px', background:'var(--c-1e1e1e)', margin:'12px 14px' }}/>
          <div style={{ padding:'0 18px' }}>
            <div style={{ fontSize:'10px', fontWeight:700, color:'var(--c-555555)', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'.08em' }}>Progres</div>
            <div style={{ height:'3px', background:'var(--c-1e1e1e)', borderRadius:'2px', marginBottom:'6px' }}>
              <div style={{ height:'3px', background:c, borderRadius:'2px', width:`${pct}%` }}/>
            </div>
            <div style={{ fontSize:'14px', fontWeight:700, color:'var(--c-ffffff)' }}>{rez}/{scopedTxs.length}</div>
            <div style={{ fontSize:'11px', color:'var(--c-888888)', marginTop:'2px' }}>{pct}% rezolvate</div>
          </div>
          <div style={{ padding:'12px 18px 0' }}>
            {finalizat ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', padding:'8px 10px', background:'light-dark(rgba(5,150,105,.15), rgba(110,231,176,.06))', border:'1px solid light-dark(rgba(5,150,105,.3), rgba(110,231,176,.2))', borderRadius:'8px' }}>
                <span style={{ fontSize:'11px', fontWeight:600, color:'var(--accent-mint)' }}>✓ Extras finalizat</span>
                <button onClick={()=>toggleFinalizat(false)} disabled={finalizing} style={{ border:'none', background:'transparent', color:'var(--c-666666)', fontSize:'10px', cursor:'pointer', textDecoration:'underline' }}>anulează</button>
              </div>
            ) : overallGata ? (
              <button onClick={()=>toggleFinalizat(true)} disabled={finalizing} style={{ width:'100%', fontSize:'11px', fontWeight:700, padding:'9px 10px', borderRadius:'8px', border:`1px solid ${c}`, background:c, color:'var(--c-ffffff)', cursor:'pointer', opacity:finalizing?.6:1 }}>
                Marchează extras finalizat
              </button>
            ) : null}
          </div>
        </>}
        <div style={{ marginTop:'auto', padding:'12px 18px 26px', fontSize:'11px', color:'var(--c-555555)' }}>{lunaLabel}</div>
      </aside>

      {/* Main */}
      <main style={{ flex:1, minWidth:0, padding:'40px 44px', background:'var(--c-0f0f0f)', overflowX:'hidden' }}>
        <div style={{ marginBottom:'28px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
            <div style={{ width:'9px', height:'9px', borderRadius:'50%', background:c }}/>
            <h1 style={{ fontSize:'20px', fontWeight:700, color:'var(--c-ffffff)' }}>Extras de cont</h1>
          </div>
          <p style={{ fontSize:'13px', color:'var(--c-888888)', marginLeft:'17px' }}>{firma.nume} · {lunaLabel}</p>
        </div>

        <div style={{ display:'flex', background:'var(--c-161616)', border:'1px solid var(--c-242424)', padding:'3px', borderRadius:'10px', gap:'3px', marginBottom:'24px', width:'fit-content' }}>
          <button onClick={()=>setPageTab('extras')} style={{ padding:'7px 16px', borderRadius:'7px', border:'none', cursor:'pointer', fontSize:'12px', fontWeight:700, background:pageTab==='extras'?c:'transparent', color:pageTab==='extras'?'var(--c-ffffff)':'var(--c-888888)' }}>Extras de cont</button>
          <button onClick={()=>setPageTab('facturi')} style={{ padding:'7px 16px', borderRadius:'7px', border:'none', cursor:'pointer', fontSize:'12px', fontWeight:700, background:pageTab==='facturi'?c:'transparent', color:pageTab==='facturi'?'var(--c-ffffff)':'var(--c-888888)' }}>Facturi + chitanță</button>
          <button onClick={()=>setPageTab('note')} style={{ padding:'7px 16px', borderRadius:'7px', border:'none', cursor:'pointer', fontSize:'12px', fontWeight:700, background:pageTab==='note'?c:'transparent', color:pageTab==='note'?'var(--c-ffffff)':'var(--c-888888)' }}>Note</button>
        </div>

        {pageTab === 'facturi' ? (
          <FacturiModule firma={firma} lunaId={lunaId} tasks={facturiTasks} section="facturi-chitanta"/>
        ) : pageTab === 'note' ? (
          <NoteTranzactii txs={txs} firmaNume={firma.nume} lunaId={lunaId} lunaLabel={lunaLabel} culoare={c} onSetStatusNote={updateStatusNote}/>
        ) : (
        <>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
          {/* Conturi existente din BD */}
          {extrase.map(e => (
            <UploadExtras key={e.id} extrasId={e.id} valuta={e.valuta||'RON'} firmaId={firma.id} lunaId={lunaId}
              extras={e} culoare={c} onDone={load}/>
          ))}
          {/* Slot gol RON dacă nu există */}
          {!extrase.some(e => e.valuta==='RON') && (
            <UploadExtras key="ron-empty" valuta="RON" firmaId={firma.id} lunaId={lunaId} extras={null} culoare={c} onDone={load}/>
          )}
          {/* Slot gol EUR dacă nu există */}
          {!extrase.some(e => e.valuta==='EUR') && (
            <UploadExtras key="eur-empty" valuta="EUR" firmaId={firma.id} lunaId={lunaId} extras={null} culoare={c} onDone={load}/>
          )}
          {/* Sloturi noi pentru conturi adiționale */}
          {Array.from({length:newSlots}).map((_,i) => (
            <UploadExtras key={`new-${i}`} valuta="AUTO" firmaId={firma.id} lunaId={lunaId} extras={null} culoare={c}
              onDone={()=>{setNewSlots(s=>Math.max(0,s-1));load()}}/>
          ))}
        </div>
        <div style={{ display:'flex', gap:'12px', marginBottom:'40px', alignItems:'stretch' }}>
          <div style={{ flex:1 }}>
            <UploadExtras valuta="AUTO" firmaId={firma.id} lunaId={lunaId} extras={null} culoare={c} onDone={load}/>
          </div>
          <button
            onClick={()=>setNewSlots(s=>s+1)}
            style={{ padding:'0 18px', border:'1px solid var(--c-2a2a2a)', borderRadius:'14px', background:'var(--c-111111)', color:'var(--c-888888)', fontSize:'12px', fontWeight:600, cursor:'pointer', flexShrink:0 }}
          >+ Adaugă cont</button>
        </div>

        {extrase.length > 0 && (
          <div style={{ marginBottom:'22px' }}>
            <div style={{ fontSize:'10px', fontWeight:700, color:'var(--c-555555)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'8px' }}>Lucrează pe extrasul</div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {extrase.map(e => (
                <button key={e.id} onClick={()=>selectExtras(e.id)} style={{ padding:'9px 14px', borderRadius:'9px', border:`1px solid ${selectedExtras?.id===e.id?c:'var(--c-292929)'}`, background:selectedExtras?.id===e.id?c:'var(--c-171717)', color:selectedExtras?.id===e.id?'var(--c-ffffff)':'var(--c-888888)', cursor:'pointer', fontSize:'12px', fontWeight:700 }}>
                  {e.valuta}{e.iban ? ` · cont ${e.iban.slice(-6)}` : ''} · {e.nr_tranzactii} tranzacții
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign:'center', padding:'60px' }}>
            <div style={{ width:'24px', height:'24px', border:`2px solid ${c}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite', margin:'0 auto 12px' }}/>
            <p style={{ fontSize:'13px', color:'var(--c-777777)' }}>Se încarcă tranzacțiile...</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : error ? (
          <div style={{ padding:'24px', background:'light-dark(rgba(220,38,38,.2), rgba(248,113,113,.08))', border:'1px solid light-dark(rgba(220,38,38,.45), rgba(248,113,113,.3))', borderRadius:'12px' }}>
            <p style={{ fontSize:'13px', color:'var(--accent-red)' }}>Eroare: {error}</p>
            <button onClick={()=>load()} style={{ marginTop:'10px', fontSize:'12px', padding:'6px 14px', borderRadius:'7px', border:'none', background:c, color:'var(--c-ffffff)', cursor:'pointer' }}>Reîncearcă</button>
          </div>
        ) : scopedTxs.length === 0 ? (
          <div style={{ padding:'40px', background:'var(--c-161616)', border:'1px solid var(--c-242424)', borderRadius:'12px', textAlign:'center' }}>
            <p style={{ fontSize:'13px', color:'var(--c-888888)' }}>Importă CSV sau PDF mai sus.</p>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px', flexWrap:'wrap', gap:'10px' }}>
              <div>
                <h2 style={{ fontSize:'16px', fontWeight:700, color:'var(--c-ffffff)' }}>
                  Tranzacții individuale <span style={{ color:'var(--c-666666)', fontWeight:400 }}>({filtered.length})</span>
                </h2>
                <p style={{ fontSize:'11px', color:'var(--c-666666)', marginTop:'3px' }}>Extras selectat: {selectedExtras?.valuta || '—'}{selectedExtras?.iban ? ` · ${selectedExtras.iban}` : ''}. Asociază documentele pe rând.</p>
                <button onClick={exportDocuments} disabled={exportingDocs || counts.ok===0} style={{ marginTop:'10px', fontSize:'11px', fontWeight:700, padding:'7px 12px', borderRadius:'8px', border:`1px solid ${counts.ok>0?c:'var(--c-2a2a2a)'}`, background:'transparent', color:counts.ok>0?c:'var(--c-555555)', cursor:counts.ok>0?'pointer':'not-allowed', opacity:exportingDocs?.6:1 }}>
                  {exportingDocs ? 'Se generează PDF-ul...' : `Descarcă toate documentele (${counts.ok}) ↓`}
                </button>
                {exportError && <p style={{ fontSize:'11px', color:'var(--accent-red)', marginTop:'6px' }}>{exportError}</p>}
              </div>
              <div style={{ display:'flex', gap:'10px', alignItems:'flex-end', flexDirection:'column' }}>
                {/* View Mode Toggle */}
                <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <div style={{ display:'flex', background:'var(--c-161616)', border:'1px solid var(--c-242424)', padding:'3px', borderRadius:'10px' }}>
                    <button onClick={()=>setViewMode('workspace')} style={{ fontSize:'12px', fontWeight:600, padding:'6px 14px', borderRadius:'7px', border:'none', background:viewMode==='workspace'?c:'transparent', color:viewMode==='workspace'?'var(--c-ffffff)':'var(--c-888888)', cursor:'pointer' }}>
                      Workspace App
                    </button>
                    <button onClick={()=>setViewMode('list')} style={{ fontSize:'12px', fontWeight:600, padding:'6px 14px', borderRadius:'7px', border:'none', background:viewMode==='list'?c:'transparent', color:viewMode==='list'?'var(--c-ffffff)':'var(--c-888888)', cursor:'pointer' }}>
                      Listă
                    </button>
                  </div>
                  <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                    {([['all',`Toate (${flowCounts.all})`],['debit',`Doar ieșiri (${flowCounts.debit})`],['credit',`Doar încasări (${flowCounts.credit})`]] as const).map(([f,l])=>(
                      <button key={f} onClick={()=>setFlow(f)} style={PB(false,flowFilter===f)}>{l}</button>
                    ))}
                  </div>
                </div>

                <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                  {([['all',`Toate (${counts.all})`],['lipsa',`Fără doc (${counts.lipsa})`],['ok',`Cu doc (${counts.ok})`],['na',`N/A (${counts.na})`]] as const).map(([f,l])=>(
                    <button key={f} onClick={()=>setF(f)} style={PB(false,filter===f)}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            {viewMode === 'workspace' ? (
              <WorkspaceView 
                txs={filtered} 
                activeTxIndex={activeTxIndex} 
                setActiveTxIndex={setActiveTxIndex} 
                firmaId={firma.id} 
                lunaId={lunaId} 
                culoare={c}
                onNA={(id)=>markNA(id)}
                onClearNA={(id)=>clearNA(id)}
                onUploadSuccess={onUploadSuccess}
                onRefresh={()=>load(true)}
              />
            ) : (
              <>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {pageItems.map(tx => (
                    <TxCard key={tx.id} tx={tx} firmaId={firma.id} lunaId={lunaId} culoare={c}
                      onNA={()=>markNA(tx.id)} onClearNA={()=>clearNA(tx.id)} onDone={load}/>
                  ))}
                  {pageItems.length===0 && (
                    <div style={{ padding:'32px', background:'var(--c-161616)', border:'1px solid var(--c-242424)', borderRadius:'12px', textAlign:'center' }}>
                      <p style={{ fontSize:'13px', color:'var(--c-666666)' }}>Nicio tranzacție în această categorie.</p>
                    </div>
                  )}
                </div>

                {pages > 1 && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'16px', padding:'12px 18px', background:'var(--c-161616)', border:'1px solid var(--c-242424)', borderRadius:'12px' }}>
                    <span style={{ fontSize:'12px', color:'var(--c-888888)' }}>Pagina {page}/{pages} · {filtered.length} total</span>
                    <div style={{ display:'flex', gap:'5px' }}>
                      <button onClick={()=>setPage(1)} disabled={page===1} style={PB(page===1)}>«</button>
                      <button onClick={()=>setPage(p=>p-1)} disabled={page===1} style={PB(page===1)}>‹</button>
                      {Array.from({length:pages},(_,i)=>i+1).filter(p=>p===1||p===pages||Math.abs(p-page)<=1)
                        .reduce<(number|string)[]>((a,p,i,arr)=>{if(i>0&&(p as number)-(arr[i-1] as number)>1)a.push('…');a.push(p);return a},[])
                        .map((p,i)=>typeof p==='string'
                          ?<span key={`e${i}`} style={{fontSize:'12px',color:'var(--c-555555)',padding:'0 4px'}}>…</span>
                          :<button key={p} onClick={()=>setPage(p as number)} style={PB(false,page===p)}>{p}</button>
                        )
                      }
                      <button onClick={()=>setPage(p=>p+1)} disabled={page===pages} style={PB(page===pages)}>›</button>
                      <button onClick={()=>setPage(pages)} disabled={page===pages} style={PB(page===pages)}>»</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
        </>
        )}
      </main>
    </div>
    </>
  )
}

function TxCard({ tx, firmaId, lunaId, culoare, onNA, onClearNA, onDone }: {
  tx: Tx; firmaId: string; lunaId: string; culoare: string
  onNA:()=>void; onClearNA:()=>void; onDone:()=>void
}) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tip, setTip] = useState('factura')
  const [furnizor, setFurnizor] = useState('')
  const [numDoc, setNumDoc] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [drag, setDrag] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const isNA = tx.note==='na', isDone=!!tx.document_id
  const cat = tx.categorie ? CAT[tx.categorie]||CAT.altele : CAT.altele
  const data = new Date(tx.data_tranzactie).toLocaleDateString('ro-RO',{day:'2-digit',month:'short',year:'2-digit'})
  const r = `${parseInt(culoare.slice(1,3),16)},${parseInt(culoare.slice(3,5),16)},${parseInt(culoare.slice(5,7),16)}`

  async function upload(files: FileList) {
    if (!files.length) return
    setUploading(true)
    setUploadError('')
    const fd = new FormData()
    fd.append('file', files[0]); fd.append('txId', tx.id)
    fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
    fd.append('tip', tip); fd.append('furnizor', furnizor); fd.append('numDoc', numDoc)
    const res = await fetch('/api/tranzactii/doc', { method:'POST', body:fd })
    setUploading(false)
    if (res.ok) { setOpen(false); onDone(); return }
    const data = await res.json().catch(() => ({}))
    setUploadError(data.error || 'Documentul nu a putut fi asociat')
  }

  async function importUrl() {
    setUploading(true); setUploadError('')
    const res = await fetch('/api/chitante/import-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      url:sourceUrl, firmaId, lunaId, transactionId:tx.id, documentType:tip, supplier:furnizor, reference:numDoc,
    }) })
    setUploading(false)
    if (res.ok) { setSourceUrl(''); setOpen(false); onDone(); return }
    setUploadError((await res.json().catch(()=>({}))).error || 'Importul din link nu a reușit')
  }

  const INP: React.CSSProperties = { fontSize:'12px', background:'var(--c-0f0f0f)', border:'1px solid var(--c-2a2a2a)', borderRadius:'8px', padding:'7px 11px', color:'var(--c-bbbbbb)', outline:'none', width:'100%' }
  const bg = isDone?'rgba(74,222,128,.04)':isNA?'var(--c-141414)':'var(--c-161616)'
  const border = isDone?'rgba(74,222,128,.2)':isNA?'var(--c-1e1e1e)':'var(--c-242424)'

  return (
    <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:'12px', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'13px 16px' }}>
        <div style={{ width:'20px', height:'20px', borderRadius:'6px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:isDone?'var(--accent-green)':isNA?'var(--c-252525)':'transparent', border:isDone?'none':isNA?'1px solid var(--c-333333)':'1.5px solid var(--c-2a2a2a)' }}>
          {isDone&&<svg width="11" height="11" fill="none" stroke="var(--c-0a0a0a)" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>}
          {isNA&&<svg width="10" height="10" fill="none" stroke="var(--c-555555)" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>}
        </div>
        <span style={{ fontSize:'11px', fontWeight:600, color:'var(--c-666666)', flexShrink:0, width:'52px' }}>{data}</span>
        <div style={{ flex:1, minWidth:0 }}>
          {tx.documente?.furnizor
            ? <p style={{ fontSize:'13px', fontWeight:700, color:isNA?'var(--c-555555)':'var(--c-eeeeee)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration:isNA?'line-through':'none' }}>{tx.documente.furnizor}</p>
            : <p style={{ fontSize:'13px', fontWeight:600, color:isNA?'var(--c-555555)':'var(--c-dddddd)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration:isNA?'line-through':'none' }}>{tx.descriere_curatata||tx.descriere}</p>
          }
          <div style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'2px' }}>
            <span style={{ fontSize:'10px', fontWeight:600, padding:'1px 7px', borderRadius:'20px', background:cat.bg, color:cat.c }}>{tx.categorie||'altele'}</span>
            {tx.documente?.furnizor && <span style={{ fontSize:'10px', color:'var(--c-555555)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.descriere_curatata||tx.descriere}</span>}
          </div>
        </div>
        <span style={{ fontSize:'14px', fontWeight:700, flexShrink:0, color:tx.tip==='credit'?'var(--accent-green)':'var(--accent-red)' }}>
          {tx.tip==='credit'?'+':'-'}{tx.suma?.toFixed(2)} {tx.valuta}
        </span>
        <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
          {!isDone&&!isNA&&<>
            <button onClick={()=>setOpen(o=>!o)} style={{ fontSize:'11px', fontWeight:700, padding:'5px 12px', borderRadius:'7px', border:'none', background:open?'var(--c-333333)':culoare, color:'var(--c-ffffff)', cursor:'pointer' }}>
              {open?'✕':'+ Doc'}
            </button>
            <button onClick={onNA} style={{ fontSize:'11px', fontWeight:600, padding:'5px 9px', borderRadius:'7px', border:'1px solid var(--c-2a2a2a)', background:'var(--c-1a1a1a)', color:'var(--c-888888)', cursor:'pointer' }}>N/A</button>
          </>}
          {isDone&&<span style={{ fontSize:'11px', fontWeight:600, padding:'5px 12px', borderRadius:'7px', background:'rgba(74,222,128,.15)', color:'var(--accent-green)' }}>{tx.documente?.tip_document||'doc'} ✓</span>}
          {isNA&&<button onClick={onClearNA} style={{ fontSize:'11px', fontWeight:600, padding:'5px 9px', borderRadius:'7px', border:'1px solid var(--c-2a2a2a)', background:'var(--c-1a1a1a)', color:'var(--c-666666)', cursor:'pointer' }}>Anulează N/A</button>}
        </div>
      </div>

      {open&&!isDone&&(
        <div style={{ padding:'12px 16px 14px', borderTop:'1px solid var(--c-1a1a1a)', background:'var(--c-111111)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'10px' }}>
            <select value={tip} onChange={e=>setTip(e.target.value)} style={INP}>
              <option value="factura">Factură</option>
              <option value="aviz_plata">Aviz plată</option>
              <option value="chitanta">Chitanță</option>
              <option value="ordin_plata">Ordin plată</option>
              <option value="contract">Contract</option>
              <option value="dispozitie_plata">Dispoziție plată</option>
              <option value="altul">Altul</option>
            </select>
            <input type="text" placeholder="Furnizor" value={furnizor} onChange={e=>setFurnizor(e.target.value)} style={INP}/>
            <input type="text" placeholder="Nr. document" value={numDoc} onChange={e=>setNumDoc(e.target.value)} style={INP}/>
          </div>
          <div style={{ padding:'10px', marginBottom:'10px', background:'var(--c-171717)', border:'1px solid var(--c-282828)', borderRadius:'9px' }}>
            <p style={{ fontSize:'11px', fontWeight:700, color:'var(--c-aaaaaa)', marginBottom:'7px' }}>Adaugă factura prin link</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'8px' }}>
              <input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="Link PDF Oblio, Booking, Airbnb sau altă platformă" style={INP}/>
              <button onClick={importUrl} disabled={uploading||!sourceUrl} style={{ padding:'8px 14px', border:'none', borderRadius:'8px', background:culoare, color:'var(--c-ffffff)', cursor:'pointer', opacity:uploading?.6:1 }}>Adaugă din link</button>
            </div>
          </div>
          <div onClick={()=>fileRef.current?.click()}
            onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files.length&&upload(e.dataTransfer.files)}}
            style={{ border:`1.5px dashed ${drag?culoare:'var(--c-2a2a2a)'}`, borderRadius:'10px', padding:'18px', textAlign:'center', cursor:'pointer', background:drag?`${tint(r,.06)}`:'var(--c-0d0d0d)' }}>
            {uploading?<p style={{fontSize:'12px',color:'var(--c-777777)'}}>Se încarcă...</p>:<p style={{fontSize:'12px',fontWeight:600,color:'var(--c-888888)'}}>drag & drop sau click · PDF / JPG / PNG</p>}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e=>e.target.files&&upload(e.target.files)}/>
          {uploadError && <p style={{ fontSize:'11px', color:'var(--accent-red)', marginTop:'8px' }}>{uploadError}</p>}
        </div>
      )}

      {isDone&&tx.documente&&(
        <div style={{ padding:'7px 16px 9px', borderTop:'1px solid rgba(74,222,128,.1)', background:'rgba(74,222,128,.03)', display:'flex', alignItems:'center', gap:'8px' }}>
          <svg width="13" height="13" fill="none" stroke="var(--accent-green)" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          {tx.documente.furnizor
            ? <span style={{fontSize:'13px',fontWeight:600,color:'var(--accent-green)'}}>{tx.documente.furnizor}</span>
            : <span style={{fontSize:'12px',fontWeight:500,color:'var(--accent-green)'}}>{tx.documente.fisier_nume}</span>
          }
          {tx.documente.furnizor&&<span style={{fontSize:'11px',color:'var(--c-777777)'}}>· {tx.documente.fisier_nume}</span>}
          {tx.documente.numar_document&&<span style={{fontSize:'11px',color:'var(--c-888888)', fontWeight:600}}>· {tx.documente.numar_document}</span>}
          <a href={`/api/tranzactii/document?id=${encodeURIComponent(tx.documente.id)}`} style={{ marginLeft:'auto', fontSize:'11px', fontWeight:700, color:'var(--accent-green)', textDecoration:'none' }}>Descarcă ↓</a>
        </div>
      )}
    </div>
  )
}

interface WorkspaceViewProps {
  txs: Tx[]
  activeTxIndex: number
  setActiveTxIndex: (idx: number) => void
  firmaId: string
  lunaId: string
  culoare: string
  onNA: (id: string) => void
  onClearNA: (id: string) => void
  onUploadSuccess: (id: string) => void
  onRefresh: () => void
}

function WorkspaceView({ txs, activeTxIndex, setActiveTxIndex, firmaId, lunaId, culoare, onNA, onClearNA, onUploadSuccess, onRefresh }: WorkspaceViewProps) {
  const safeIndex = Math.min(activeTxIndex, Math.max(txs.length - 1, 0))
  const activeTx = txs[safeIndex]
  const selectorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activeTx) return
    selectorRef.current?.querySelector(`[data-tx-id="${activeTx.id}"]`)?.scrollIntoView({ block:'nearest', inline:'nearest' })
  }, [activeTx])

  useEffect(() => {
    if (!activeTx) return
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement|null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft' && safeIndex > 0) {
        event.preventDefault()
        setActiveTxIndex(safeIndex - 1)
      } else if (event.key === 'ArrowRight' && safeIndex < txs.length - 1) {
        event.preventDefault()
        setActiveTxIndex(safeIndex + 1)
      } else if (event.key === 'Enter' && !activeTx.document_id && activeTx.note !== 'na') {
        event.preventDefault()
        onNA(activeTx.id)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeTx, onNA, safeIndex, setActiveTxIndex, txs.length])

  if (!activeTx) {
    return (
      <div style={{ padding:'60px', background:'var(--c-161616)', border:'1px solid var(--c-242424)', borderRadius:'16px', textAlign:'center' }}>
        <p style={{ fontSize:'14px', color:'var(--c-888888)' }}>Nicio tranzacție în această categorie.</p>
      </div>
    )
  }

  return (
    <div style={{ minWidth:0, maxWidth:'100%' }}>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', marginBottom:'7px', fontSize:'10px', color:'var(--c-555555)' }}>
        <span>← → navigare</span>
        <span>Enter = Sari</span>
      </div>
      {/* Transaction selector */}
      <div ref={selectorRef} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(145px, 1fr))', gap:'7px', maxHeight:'156px', overflowY:'auto', overflowX:'hidden', padding:'8px', marginBottom:'20px', background:'var(--c-111111)', border:'1px solid var(--c-202020)', borderRadius:'12px', scrollbarWidth:'thin' }}>
        {txs.map((tx, idx) => {
          const isCurrent = idx === activeTxIndex
          const isDone = !!tx.document_id
          const isNA = tx.note === 'na'
          
          let borderCol = 'var(--c-2a2a2a)'
          let bgCol = 'var(--c-161616)'
          let txtCol = 'var(--c-888888)'
          
          if (isCurrent) {
            borderCol = culoare
            bgCol = culoare
            txtCol = 'var(--c-ffffff)'
          } else if (isDone) {
            borderCol = 'rgba(74,222,128,.15)'
            bgCol = 'rgba(74,222,128,.05)'
            txtCol = 'var(--accent-green)'
          } else if (isNA) {
            borderCol = 'var(--c-222222)'
            bgCol = 'var(--c-121212)'
            txtCol = 'var(--c-555555)'
          }

          return (
            <button
              key={tx.id}
              data-tx-id={tx.id}
              onClick={() => setActiveTxIndex(idx)}
              style={{
                padding:'8px 10px',
                borderRadius:'9px',
                fontSize:'11px',
                fontWeight:600,
                cursor:'pointer',
                border:`1px solid ${borderCol}`,
                background:bgCol,
                color:txtCol,
                transition:'all .2s ease',
                display:'flex',
                alignItems:'center',
                justifyContent:'space-between',
                gap:'5px',
                minWidth:0
              }}
            >
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:'2px', flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', gap:'4px' }}>
                  <span style={{ opacity:.7, flexShrink:0 }}>{new Date(tx.data_tranzactie).toLocaleDateString('ro-RO',{day:'2-digit',month:'2-digit'})}</span>
                  <span style={{ fontWeight:700 }}>{tx.tip==='credit'?'+':'-'}{tx.suma.toFixed(2)} {tx.valuta}</span>
                  {isDone && <span style={{ fontSize:'10px', flexShrink:0 }}>✓</span>}
                  {isNA && <span style={{ fontSize:'10px', flexShrink:0 }}>✕</span>}
                </div>
                <span style={{ fontSize:'11px', fontWeight: tx.documente?.furnizor ? 600 : 400, color: isCurrent ? 'var(--text-strong)' : tx.documente?.furnizor ? 'var(--c-aaaaaa)' : 'var(--c-666666)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%', textAlign:'left' }}>
                  {tx.documente?.furnizor || tx.descriere_curatata || tx.descriere}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Active Transaction Workspace Card */}
      <WorkspaceCard 
        tx={activeTx} 
        index={safeIndex}
        total={txs.length} 
        firmaId={firmaId} 
        lunaId={lunaId} 
        culoare={culoare}
        onPrev={safeIndex > 0 ? () => setActiveTxIndex(safeIndex - 1) : undefined}
        onNext={safeIndex < txs.length - 1 ? () => setActiveTxIndex(safeIndex + 1) : undefined}
        onNA={() => onNA(activeTx.id)}
        onClearNA={() => onClearNA(activeTx.id)}
        onUploadSuccess={() => onUploadSuccess(activeTx.id)}
        onRefresh={onRefresh}
      />
    </div>
  )
}

function WorkspaceCard({ tx, index, total, firmaId, lunaId, culoare, onPrev, onNext, onNA, onClearNA, onUploadSuccess, onRefresh }: {
  tx: Tx
  index: number
  total: number
  firmaId: string
  lunaId: string
  culoare: string
  onPrev?: () => void
  onNext?: () => void
  onNA: () => void
  onClearNA: () => void
  onUploadSuccess: () => void
  onRefresh: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [editDoc, setEditDoc] = useState(false)
  const [tip, setTip] = useState('factura')
  const [furnizor, setFurnizor] = useState('')
  const [numDoc, setNumDoc] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [drag, setDrag] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [showAddMore, setShowAddMore] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState('')
  const [addDrag, setAddDrag] = useState(false)
  const addFileRef = useRef<HTMLInputElement>(null)

  const isNA = tx.note==='na', isDone=!!tx.document_id
  const cat = tx.categorie ? CAT[tx.categorie]||CAT.altele : CAT.altele
  const data = new Date(tx.data_tranzactie).toLocaleDateString('ro-RO',{day:'2-digit',month:'long',year:'numeric'})
  const r = `${parseInt(culoare.slice(1,3),16)},${parseInt(culoare.slice(3,5),16)},${parseInt(culoare.slice(5,7),16)}`

  // Reset fields when active transaction changes
  useEffect(() => {
    setFurnizor(tx.documente?.furnizor || '')
    setNumDoc(tx.documente?.numar_document || '')
    setTip(tx.documente?.tip_document || 'factura')
    setSourceUrl('')
    setEditDoc(false)
    setUploadError('')
    setShowAddMore(false)
    setAddUrl('')
    setAddError('')
  }, [tx])

  async function addMoreUrl() {
    if (!addUrl) return
    setAddBusy(true); setAddError('')
    const res = await fetch('/api/chitante/import-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      url:addUrl, firmaId, lunaId, transactionId:tx.id, documentType:'factura', mode:'add',
    }) })
    setAddBusy(false)
    if (res.ok) { setAddUrl(''); onRefresh(); return }
    setAddError((await res.json().catch(()=>({}))).error || 'Importul din link nu a reușit')
  }

  async function addMoreFile(files: FileList) {
    if (!files.length) return
    setAddBusy(true); setAddError('')
    const fd = new FormData()
    fd.append('file', files[0]); fd.append('txId', tx.id)
    fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
    fd.append('tip', 'factura'); fd.append('mode', 'add')
    const res = await fetch('/api/tranzactii/doc', { method:'POST', body:fd })
    setAddBusy(false)
    if (res.ok) { onRefresh(); return }
    setAddError((await res.json().catch(()=>({}))).error || 'Documentul nu a putut fi asociat')
  }

  async function upload(files: FileList) {
    if (!files.length) return
    setUploading(true)
    setUploadError('')
    const fd = new FormData()
    fd.append('file', files[0]); fd.append('txId', tx.id)
    fd.append('firmaId', firmaId); fd.append('lunaId', lunaId)
    fd.append('tip', tip); fd.append('furnizor', furnizor); fd.append('numDoc', numDoc)
    const res = await fetch('/api/tranzactii/doc', { method:'POST', body:fd })
    setUploading(false)
    if (res.ok) {
      onUploadSuccess()
      return
    }
    const data = await res.json().catch(() => ({}))
    setUploadError(data.error || 'Documentul nu a putut fi asociat')
  }

  async function importUrl() {
    setUploading(true); setUploadError('')
    const res = await fetch('/api/chitante/import-url', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      url:sourceUrl, firmaId, lunaId, transactionId:tx.id, documentType:tip, supplier:furnizor, reference:numDoc,
    }) })
    setUploading(false)
    if (res.ok) { setSourceUrl(''); onUploadSuccess(); return }
    setUploadError((await res.json().catch(()=>({}))).error || 'Importul din link nu a reușit')
  }

  const INP: React.CSSProperties = { fontSize:'13px', background:'var(--c-0f0f0f)', border:'1px solid var(--c-2a2a2a)', borderRadius:'8px', padding:'10px 14px', color:'var(--c-bbbbbb)', outline:'none', width:'100%' }
  
  const BTN: React.CSSProperties = {
    fontSize:'13px', fontWeight:700, padding:'10px 20px', borderRadius:'8px', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px', transition:'all .2s'
  }

  return (
    <div style={{ background:'var(--c-141414)', border:'1px solid var(--c-222222)', borderRadius:'16px', display:'flex', flexDirection:'column', padding:'28px 32px', minHeight:'420px', position:'relative', overflow:'hidden', maxWidth:'100%' }}>
      {/* Background radial highlight */}
      <div style={{ position:'absolute', width:'300px', height:'300px', background:`radial-gradient(circle, ${tint(r,0.04)} 0%, rgba(0,0,0,0) 70%)`, top:'-100px', left:'-100px', pointerEvents:'none' }} />

      {/* Left Column: Details & Nav */}
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'space-between', zIndex:1, minWidth:0 }}>
        <div>
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
            <span style={{ fontSize:'12px', fontWeight:700, color:'var(--c-555555)', textTransform:'uppercase', letterSpacing:'.08em' }}>Tranzacția {index + 1} din {total}</span>
            <span style={{ fontSize:'11px', fontWeight:600, padding:'3px 9px', borderRadius:'20px', background:cat.bg, color:cat.c }}>{tx.categorie||'altele'}</span>
          </div>

          {/* Amount & Currency */}
          <div style={{ fontSize:'36px', fontWeight:800, color:tx.tip==='credit'?'var(--accent-green)':'var(--accent-red)', letterSpacing:'-0.5px', marginBottom:'16px' }}>
            {tx.tip==='credit'?'+':'-'}{tx.suma?.toFixed(2)} {tx.valuta}
          </div>

          {/* Info Rows */}
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {/* Entitate / Furnizor — mereu vizibil, prioritate maximă */}
            <div style={{ padding:'12px 16px', background: tx.documente?.furnizor ? `${tint(r,.06)}` : 'var(--c-111111)', border:`1px solid ${tx.documente?.furnizor ? `${tint(r,.25)}` : 'var(--c-222222)'}`, borderRadius:'10px' }}>
              <div style={{ fontSize:'10px', fontWeight:700, color: tx.documente?.furnizor ? culoare : 'var(--c-555555)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'4px' }}>
                {tx.documente?.furnizor ? 'Furnizor' : 'Entitate (extras bancă)'}
              </div>
              <div style={{ fontSize:'16px', fontWeight:700, color:'var(--c-eeeeee)', lineHeight:'1.3', wordBreak:'break-word' }}>
                {tx.documente?.furnizor || tx.descriere_curatata || tx.descriere}
              </div>
              {tx.documente?.furnizor && (
                <div style={{ fontSize:'11px', color:'var(--c-666666)', marginTop:'5px', wordBreak:'break-word' }}>{tx.descriere_curatata || tx.descriere}</div>
              )}
            </div>

            {/* Descriere originală din bancă (dacă diferă de curatată și nu e deja afișată sus) */}
            {!tx.documente?.furnizor && tx.descriere_curatata && tx.descriere_curatata !== tx.descriere && (
              <div>
                <div style={{ fontSize:'10px', fontWeight:600, color:'var(--c-555555)', textTransform:'uppercase', marginBottom:'2px' }}>Descriere originală</div>
                <div style={{ fontSize:'11px', color:'var(--c-555555)', lineHeight:'1.4', wordBreak:'break-word' }}>{tx.descriere}</div>
              </div>
            )}

            <div>
              <div style={{ fontSize:'10px', fontWeight:600, color:'var(--c-777777)', textTransform:'uppercase', marginBottom:'3px' }}>Data tranzacție</div>
              <div style={{ fontSize:'14px', color:'var(--c-dddddd)', fontWeight:500 }}>{data}</div>
            </div>

            {tx.referinta && (
              <div>
                <div style={{ fontSize:'10px', fontWeight:600, color:'var(--c-777777)', textTransform:'uppercase', marginBottom:'3px' }}>Referință internă</div>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <div style={{ fontSize:'15px', fontWeight:600, color:'var(--c-ffffff)', fontFamily:'monospace', wordBreak:'break-all' }}>{tx.referinta}</div>
                  <CopyButton value={tx.referinta} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div style={{ display:'flex', gap:'8px', marginTop:'24px' }}>
          <button 
            disabled={!onPrev} 
            onClick={onPrev} 
            style={{ ...BTN, background:'var(--c-1f1f1f)', border:'1px solid var(--c-2a2a2a)', color:onPrev?'var(--c-dddddd)':'var(--c-444444)', cursor:onPrev?'pointer':'not-allowed' }}
          >
            ← Înapoi
          </button>
          
          {!isDone && (
            isNA ? (
              <button onClick={onClearNA} style={{ ...BTN, background:'var(--c-1a1a1a)', border:'1px solid var(--c-2a2a2a)', color:'var(--c-888888)' }}>
                Re-activează
              </button>
            ) : (
              <button onClick={onNA} style={{ ...BTN, background:'var(--c-1a1a1a)', border:'1px solid var(--c-2a2a2a)', color:'var(--c-666666)' }}>
                N/A (Sari)
              </button>
            )
          )}

          <button 
            disabled={!onNext} 
            onClick={onNext} 
            style={{ ...BTN, background:'var(--c-1f1f1f)', border:'1px solid var(--c-2a2a2a)', color:onNext?'var(--c-dddddd)':'var(--c-444444)', cursor:onNext?'pointer':'not-allowed' }}
          >
            Înainte →
          </button>
        </div>
      </div>

      {/* Bottom: Upload / Success */}
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', borderTop:'1px solid var(--c-1e1e1e)', paddingTop:'24px', marginTop:'26px', zIndex:1 }}>
        {isDone && !editDoc ? (
          /* Success Card */
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ width:'48px', height:'48px', borderRadius:'50%', background:'rgba(74,222,128,.1)', border:'1px solid rgba(74,222,128,.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="22" height="22" fill="none" stroke="var(--accent-green)" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
            </div>
            <h3 style={{ fontSize:'16px', fontWeight:700, color:'var(--c-ffffff)', marginBottom:'8px' }}>Tranzacție Rezolvată</h3>
            <p style={{ fontSize:'13px', color:'var(--c-888888)', marginBottom:'20px' }}>Documentul a fost asociat cu succes în arhivă.</p>
            
            {/* Associated Doc(s) Details — o tranzactie poate avea mai multe facturi atasate */}
            <div style={{ display:'flex', flexDirection:'column', gap:'6px', textAlign:'left', marginBottom:'16px' }}>
              {(tx.documenteToate?.length ? tx.documenteToate : tx.documente ? [tx.documente] : []).map(doc => (
                <div key={doc.id} style={{ background:'var(--c-0d0d0d)', border:'1px solid var(--c-1a1a1a)', borderRadius:'10px', padding:'10px 14px', display:'flex', alignItems:'center', gap:'10px' }}>
                  <svg width="14" height="14" fill="none" stroke="var(--accent-green)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink:0 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'12px', fontWeight:600, color:'var(--accent-green)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.fisier_nume}</div>
                    {(doc.furnizor || doc.numar_document) && (
                      <div style={{ fontSize:'10px', color:'var(--c-666666)', marginTop:'2px' }}>{[doc.furnizor, doc.numar_document && `nr. ${doc.numar_document}`].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                  <a href={`/api/tranzactii/document?id=${encodeURIComponent(doc.id)}`} style={{ fontSize:'11px', fontWeight:600, color:legibil(culoare), flexShrink:0 }}>↓</a>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', justifyContent:'center', gap:'8px', flexWrap:'wrap', marginBottom: showAddMore ? '16px' : 0 }}>
              <button onClick={() => setShowAddMore(v=>!v)} style={{ ...BTN, background:'transparent', border:`1px solid ${tint(r,.3)}`, color:legibil(culoare) }}>
                {showAddMore ? 'Ascunde' : '+ Adaugă altă factură'}
              </button>
              <button onClick={() => setEditDoc(true)} style={{ ...BTN, background:'transparent', border:'1px solid var(--c-2a2a2a)', color:'var(--c-888888)' }}>
                Schimbă documentul principal
              </button>
            </div>

            {showAddMore && (
              <div style={{ textAlign:'left', padding:'14px', background:'var(--c-0f0f0f)', border:'1px solid var(--c-1e1e1e)', borderRadius:'10px' }}>
                <div style={{ fontSize:'11px', color:'var(--c-666666)', marginBottom:'9px' }}>Adaugă încă o factură pentru această plată — link sau fișier. Poți repeta pentru fiecare factură.</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'8px', marginBottom:'10px' }}>
                  <input value={addUrl} onChange={e=>setAddUrl(e.target.value)} placeholder="Lipește linkul facturii PDF" style={INP}/>
                  <button onClick={addMoreUrl} disabled={addBusy||!addUrl} style={{ ...BTN, background:culoare, color:'var(--c-ffffff)', opacity:(addBusy||!addUrl)?.5:1 }}>
                    Adaugă din link
                  </button>
                </div>
                <div
                  onClick={()=>addFileRef.current?.click()}
                  onDragOver={e=>{e.preventDefault();setAddDrag(true)}}
                  onDragLeave={()=>setAddDrag(false)}
                  onDrop={e=>{e.preventDefault();setAddDrag(false);e.dataTransfer.files.length&&addMoreFile(e.dataTransfer.files)}}
                  style={{ border:`1.5px dashed ${addDrag?culoare:'var(--c-2a2a2a)'}`, borderRadius:'8px', padding:'14px', textAlign:'center', cursor:'pointer', background:addDrag?`${tint(r,.06)}`:'var(--c-0d0d0d)' }}
                >
                  <p style={{ fontSize:'12px', color: addBusy ? 'var(--c-777777)' : 'var(--c-888888)', fontWeight:600 }}>{addBusy ? 'Se adaugă...' : 'sau adaugă fișier'}</p>
                </div>
                <input ref={addFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e=>{ if (e.target.files?.length) addMoreFile(e.target.files); e.target.value='' }}/>
                {addError && <p style={{ fontSize:'11px', color:'var(--accent-red)', marginTop:'8px' }}>{addError}</p>}
              </div>
            )}
          </div>
        ) : isNA ? (
          /* N/A Card */
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ width:'48px', height:'48px', borderRadius:'50%', background:'var(--overlay-hover-soft)', border:'1px solid var(--c-222222)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="20" height="20" fill="none" stroke="var(--c-555555)" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </div>
            <h3 style={{ fontSize:'16px', fontWeight:700, color:'var(--c-dddddd)', marginBottom:'8px' }}>Tranzacție ignorată (N/A)</h3>
            <p style={{ fontSize:'13px', color:'var(--c-666666)', marginBottom:'24px' }}>Această tranzacție a fost marcată ca N/A (nu necesită document).</p>
            <button onClick={onClearNA} style={{ ...BTN, background:culoare, color:'var(--c-ffffff)', margin:'0 auto' }}>
              Activează pentru adăugare doc
            </button>
          </div>
        ) : (
          /* Upload Form */
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
              <h3 style={{ fontSize:'14px', fontWeight:700, color:'var(--c-ffffff)' }}>Asociază Document</h3>
              {editDoc && (
                <button onClick={() => setEditDoc(false)} style={{ background:'transparent', border:'none', color:'var(--c-666666)', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                  Anulează
                </button>
              )}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'14px' }}>
              <div>
                <label style={{ fontSize:'10px', color:'var(--c-555555)', fontWeight:700, textTransform:'uppercase', display:'block', marginBottom:'4px' }}>Tip Document</label>
                <select value={tip} onChange={e=>setTip(e.target.value)} style={INP}>
                  <option value="factura">Factură</option>
                  <option value="aviz_plata">Aviz plată</option>
                  <option value="chitanta">Chitanță</option>
                  <option value="ordin_plata">Ordin plată</option>
                  <option value="contract">Contract</option>
                  <option value="dispozitie_plata">Dispoziție plată</option>
                  <option value="altul">Altul</option>
                </select>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                <div>
                  <label style={{ fontSize:'10px', color:'var(--c-555555)', fontWeight:700, textTransform:'uppercase', display:'block', marginBottom:'4px' }}>Furnizor / Client</label>
                  <input type="text" placeholder="Nume firmă" value={furnizor} onChange={e=>setFurnizor(e.target.value)} style={INP}/>
                </div>
                <div>
                  <label style={{ fontSize:'10px', color:'var(--c-555555)', fontWeight:700, textTransform:'uppercase', display:'block', marginBottom:'4px' }}>Număr Document</label>
                  <input type="text" placeholder="Ex: 10243" value={numDoc} onChange={e=>setNumDoc(e.target.value)} style={INP}/>
                </div>
              </div>
            </div>

            <div style={{ padding:'12px', marginBottom:'12px', background:'var(--c-171717)', border:'1px solid var(--c-282828)', borderRadius:'10px' }}>
              <div style={{ fontSize:'12px', fontWeight:700, color:'var(--c-dddddd)', marginBottom:'4px' }}>Adaugă factura prin link</div>
              <div style={{ fontSize:'10px', color:'var(--c-666666)', marginBottom:'9px' }}>Oblio, Booking, Airbnb sau orice link HTTPS care returnează un PDF.</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'8px' }}>
                <input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="Lipește linkul facturii PDF" style={INP}/>
                <button onClick={importUrl} disabled={uploading||!sourceUrl} style={{ ...BTN, background:culoare, color:'var(--c-ffffff)', opacity:(uploading||!sourceUrl)?.5:1 }}>
                  Adaugă din link
                </button>
              </div>
            </div>

            <div 
              onClick={()=>fileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setDrag(true)}} 
              onDragLeave={()=>setDrag(false)}
              onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files.length&&upload(e.dataTransfer.files)}}
              style={{ 
                border:`1.5px dashed ${drag?culoare:'var(--c-2a2a2a)'}`, 
                borderRadius:'10px', 
                padding:'24px', 
                textAlign:'center', 
                cursor:'pointer', 
                background:drag?`${tint(r,.06)}`:'var(--c-0d0d0d)',
                transition:'all .2s'
              }}
            >
              {uploading ? (
                <p style={{fontSize:'12px',color:'var(--c-777777)'}}>Se încarcă...</p>
              ) : (
                <div>
                  <svg width="20" height="20" fill="none" stroke={culoare} strokeWidth="2.5" viewBox="0 0 24 24" style={{ margin:'0 auto 8px' }}><path d="M12 4v16m8-8H4"/></svg>
                  <p style={{fontSize:'12px',fontWeight:600,color:'var(--c-888888)',marginBottom:'4px'}}>Adaugă fișier (PDF / JPG / PNG)</p>
                  <p style={{fontSize:'10px',color:'var(--c-555555)'}}>drag & drop sau click pentru navigare</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ position:'absolute', width:1, height:1, padding:0, margin:-1, overflow:'hidden', clip:'rect(0,0,0,0)', whiteSpace:'nowrap', border:0 }} onChange={e=>e.target.files&&upload(e.target.files)}/>
            {uploadError && <p style={{ fontSize:'11px', color:'var(--accent-red)', marginTop:'8px' }}>{uploadError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

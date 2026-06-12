'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import UploadExtras from './UploadExtras'

const CAT: Record<string, { bg: string; c: string }> = {
  client:   { bg: 'rgba(74,222,128,.15)',  c: '#4ADE80' },
  furnizor: { bg: 'rgba(96,165,250,.15)',  c: '#60A5FA' },
  taxa:     { bg: 'rgba(248,113,113,.15)', c: '#F87171' },
  angajat:  { bg: 'rgba(167,139,250,.15)', c: '#A78BFA' },
  transfer: { bg: 'rgba(150,150,150,.15)', c: '#AAA' },
  comision: { bg: 'rgba(251,146,60,.15)',  c: '#FB923C' },
  banca:    { bg: 'rgba(100,100,100,.15)', c: '#888' },
  altele:   { bg: 'rgba(80,80,80,.12)',    c: '#777' },
}

const PER = 10

interface Tx {
  id: string; extras_id: string; data_tranzactie: string
  descriere: string; descriere_curatata: string
  tip: 'debit'|'credit'; suma: number; valuta: string
  referinta: string|null
  categorie: string; document_id: string|null; note: string|null
  documente: { id:string; tip_document:string; furnizor:string; numar_document:string; fisier_nume:string }|null
}
interface Extras { id:string; valuta:string; iban?:string|null; pdf_nume?:string|null; nr_tranzactii:number; nr_documentate:number; sold_final?:number }
interface Firma { id:string; slug:string; nume:string; culoare:string }

export default function ExtrasClient({ firma, lunaId, luna, lunaLabel, extrase: initExtrase, slug }: {
  firma: Firma; lunaId: string; luna: string; lunaLabel: string; extrase: Extras[]; slug: string
}) {
  const [txs, setTxs] = useState<Tx[]>([])
  const [extrase, setExtrase] = useState<Extras[]>(initExtrase)
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

  const onUploadSuccess = useCallback((uploadedTxId: string) => {
    let nextIdx = -1
    for (let i = activeTxIndex + 1; i < filtered.length; i++) {
      if (!filtered[i].document_id && filtered[i].note !== 'na' && filtered[i].id !== uploadedTxId) {
        nextIdx = i
        break
      }
    }
    if (nextIdx === -1) {
      for (let i = 0; i < activeTxIndex; i++) {
        if (!filtered[i].document_id && filtered[i].note !== 'na' && filtered[i].id !== uploadedTxId) {
          nextIdx = i
          break
        }
      }
    }
    if (nextIdx !== -1) {
      pendingFocusId.current = filtered[nextIdx].id
    }
    load(true)
  }, [activeTxIndex, filtered, load])

  const PB = (dis: boolean, act=false): React.CSSProperties => ({
    fontSize:'12px', fontWeight:600, padding:'5px 11px', borderRadius:'7px',
    border:`1px solid ${act?c:'#2A2A2A'}`, background:act?c:'#1A1A1A',
    color:dis?'#333':act?'#fff':'#888', cursor:dis?'not-allowed':'pointer', opacity:dis?.5:1
  })

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0A0A0A' }}>
      {/* Sidebar */}
      <aside style={{ width:'220px', flexShrink:0, background:'#0D0D0D', borderRight:'1px solid #1E1E1E', display:'flex', flexDirection:'column', padding:'20px 0', position:'sticky', top:0, height:'100vh' }}>
        <div style={{ padding:'4px 18px 24px', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ width:'28px', height:'28px', background:'#FFF', borderRadius:'7px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="14" fill="none" stroke="#111" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <span style={{ fontSize:'15px', fontWeight:700, color:'#FFF' }}>ContaFlow</span>
        </div>
        <Link href={`/${slug}/${luna}`} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'8px 18px', fontSize:'13px', color:'#888' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          {firma.nume.replace(' SRL','')}
        </Link>
        <div style={{ height:'1px', background:'#1E1E1E', margin:'8px 14px' }}/>
        <div style={{ padding:'8px 18px 4px', fontSize:'13px', fontWeight:600, color:'#DDD' }}>Extras de cont</div>
        {extrase.map(e => (
          <button key={e.id} onClick={()=>selectExtras(e.id)} style={{ padding:'7px 18px 7px 28px', display:'flex', justifyContent:'space-between', gap:'8px', border:'none', borderLeft:`2px solid ${selectedExtras?.id===e.id?c:'transparent'}`, background:selectedExtras?.id===e.id?'#181818':'transparent', cursor:'pointer', textAlign:'left' }}>
            <span style={{ fontSize:'12px', color:selectedExtras?.id===e.id?'#FFF':'#777', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.valuta}{e.iban ? ` · ${e.iban.slice(-6)}` : ''}</span>
            <span style={{ fontSize:'11px', fontWeight:600, color:'#4ADE80' }}>{e.nr_tranzactii} tx</span>
          </button>
        ))}
        {scopedTxs.length > 0 && <>
          <div style={{ height:'1px', background:'#1E1E1E', margin:'12px 14px' }}/>
          <div style={{ padding:'0 18px' }}>
            <div style={{ fontSize:'10px', fontWeight:700, color:'#555', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'.08em' }}>Progres</div>
            <div style={{ height:'3px', background:'#1E1E1E', borderRadius:'2px', marginBottom:'6px' }}>
              <div style={{ height:'3px', background:c, borderRadius:'2px', width:`${pct}%` }}/>
            </div>
            <div style={{ fontSize:'14px', fontWeight:700, color:'#FFF' }}>{rez}/{scopedTxs.length}</div>
            <div style={{ fontSize:'11px', color:'#888', marginTop:'2px' }}>{pct}% rezolvate</div>
          </div>
        </>}
        <div style={{ marginTop:'auto', padding:'12px 18px', fontSize:'11px', color:'#555' }}>{lunaLabel}</div>
      </aside>

      {/* Main */}
      <main style={{ flex:1, minWidth:0, padding:'40px 44px', background:'#0F0F0F', overflowX:'hidden' }}>
        <div style={{ marginBottom:'28px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
            <div style={{ width:'9px', height:'9px', borderRadius:'50%', background:c }}/>
            <h1 style={{ fontSize:'20px', fontWeight:700, color:'#FFF' }}>Extras de cont</h1>
          </div>
          <p style={{ fontSize:'13px', color:'#888', marginLeft:'17px' }}>{firma.nume} · {lunaLabel}</p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
          {['RON','EUR'].map(v => (
            <UploadExtras key={v} valuta={v} firmaId={firma.id} lunaId={lunaId}
              extras={extrase.find(x => x.valuta===v)||null} culoare={c} onDone={load}/>
          ))}
        </div>
        <div style={{ marginBottom:'40px' }}>
          <UploadExtras valuta="AUTO" firmaId={firma.id} lunaId={lunaId} extras={null} culoare={c} onDone={load}/>
        </div>

        {extrase.length > 0 && (
          <div style={{ marginBottom:'22px' }}>
            <div style={{ fontSize:'10px', fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'8px' }}>Lucrează pe extrasul</div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {extrase.map(e => (
                <button key={e.id} onClick={()=>selectExtras(e.id)} style={{ padding:'9px 14px', borderRadius:'9px', border:`1px solid ${selectedExtras?.id===e.id?c:'#292929'}`, background:selectedExtras?.id===e.id?c:'#171717', color:selectedExtras?.id===e.id?'#FFF':'#888', cursor:'pointer', fontSize:'12px', fontWeight:700 }}>
                  {e.valuta}{e.iban ? ` · cont ${e.iban.slice(-6)}` : ''} · {e.nr_tranzactii} tranzacții
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign:'center', padding:'60px' }}>
            <div style={{ width:'24px', height:'24px', border:`2px solid ${c}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite', margin:'0 auto 12px' }}/>
            <p style={{ fontSize:'13px', color:'#777' }}>Se încarcă tranzacțiile...</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : error ? (
          <div style={{ padding:'24px', background:'rgba(248,113,113,.08)', border:'1px solid rgba(248,113,113,.3)', borderRadius:'12px' }}>
            <p style={{ fontSize:'13px', color:'#F87171' }}>Eroare: {error}</p>
            <button onClick={()=>load()} style={{ marginTop:'10px', fontSize:'12px', padding:'6px 14px', borderRadius:'7px', border:'none', background:c, color:'#fff', cursor:'pointer' }}>Reîncearcă</button>
          </div>
        ) : scopedTxs.length === 0 ? (
          <div style={{ padding:'40px', background:'#161616', border:'1px solid #242424', borderRadius:'12px', textAlign:'center' }}>
            <p style={{ fontSize:'13px', color:'#888' }}>Importă CSV sau PDF mai sus.</p>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px', flexWrap:'wrap', gap:'10px' }}>
              <div>
                <h2 style={{ fontSize:'16px', fontWeight:700, color:'#FFF' }}>
                  Tranzacții individuale <span style={{ color:'#666', fontWeight:400 }}>({filtered.length})</span>
                </h2>
                <p style={{ fontSize:'11px', color:'#666', marginTop:'3px' }}>Extras selectat: {selectedExtras?.valuta || '—'}{selectedExtras?.iban ? ` · ${selectedExtras.iban}` : ''}. Asociază documentele pe rând.</p>
                <button onClick={exportDocuments} disabled={exportingDocs || counts.ok===0} style={{ marginTop:'10px', fontSize:'11px', fontWeight:700, padding:'7px 12px', borderRadius:'8px', border:`1px solid ${counts.ok>0?c:'#2A2A2A'}`, background:'transparent', color:counts.ok>0?c:'#555', cursor:counts.ok>0?'pointer':'not-allowed', opacity:exportingDocs?.6:1 }}>
                  {exportingDocs ? 'Se generează PDF-ul...' : `Descarcă toate documentele (${counts.ok}) ↓`}
                </button>
                {exportError && <p style={{ fontSize:'11px', color:'#F87171', marginTop:'6px' }}>{exportError}</p>}
              </div>
              <div style={{ display:'flex', gap:'10px', alignItems:'flex-end', flexDirection:'column' }}>
                {/* View Mode Toggle */}
                <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <div style={{ display:'flex', background:'#161616', border:'1px solid #242424', padding:'3px', borderRadius:'10px' }}>
                    <button onClick={()=>setViewMode('workspace')} style={{ fontSize:'12px', fontWeight:600, padding:'6px 14px', borderRadius:'7px', border:'none', background:viewMode==='workspace'?c:'transparent', color:viewMode==='workspace'?'#fff':'#888', cursor:'pointer' }}>
                      Workspace App
                    </button>
                    <button onClick={()=>setViewMode('list')} style={{ fontSize:'12px', fontWeight:600, padding:'6px 14px', borderRadius:'7px', border:'none', background:viewMode==='list'?c:'transparent', color:viewMode==='list'?'#fff':'#888', cursor:'pointer' }}>
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
              />
            ) : (
              <>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {pageItems.map(tx => (
                    <TxCard key={tx.id} tx={tx} firmaId={firma.id} lunaId={lunaId} culoare={c}
                      onNA={()=>markNA(tx.id)} onClearNA={()=>clearNA(tx.id)} onDone={load}/>
                  ))}
                  {pageItems.length===0 && (
                    <div style={{ padding:'32px', background:'#161616', border:'1px solid #242424', borderRadius:'12px', textAlign:'center' }}>
                      <p style={{ fontSize:'13px', color:'#666' }}>Nicio tranzacție în această categorie.</p>
                    </div>
                  )}
                </div>

                {pages > 1 && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'16px', padding:'12px 18px', background:'#161616', border:'1px solid #242424', borderRadius:'12px' }}>
                    <span style={{ fontSize:'12px', color:'#888' }}>Pagina {page}/{pages} · {filtered.length} total</span>
                    <div style={{ display:'flex', gap:'5px' }}>
                      <button onClick={()=>setPage(1)} disabled={page===1} style={PB(page===1)}>«</button>
                      <button onClick={()=>setPage(p=>p-1)} disabled={page===1} style={PB(page===1)}>‹</button>
                      {Array.from({length:pages},(_,i)=>i+1).filter(p=>p===1||p===pages||Math.abs(p-page)<=1)
                        .reduce<(number|string)[]>((a,p,i,arr)=>{if(i>0&&(p as number)-(arr[i-1] as number)>1)a.push('…');a.push(p);return a},[])
                        .map((p,i)=>typeof p==='string'
                          ?<span key={`e${i}`} style={{fontSize:'12px',color:'#555',padding:'0 4px'}}>…</span>
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
      </main>
    </div>
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

  const INP: React.CSSProperties = { fontSize:'12px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'8px', padding:'7px 11px', color:'#BBB', outline:'none', width:'100%' }
  const bg = isDone?'rgba(74,222,128,.04)':isNA?'#141414':'#161616'
  const border = isDone?'rgba(74,222,128,.2)':isNA?'#1E1E1E':'#242424'

  return (
    <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:'12px', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'13px 16px' }}>
        <div style={{ width:'20px', height:'20px', borderRadius:'6px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:isDone?'#4ADE80':isNA?'#252525':'transparent', border:isDone?'none':isNA?'1px solid #333':'1.5px solid #2A2A2A' }}>
          {isDone&&<svg width="11" height="11" fill="none" stroke="#0A0A0A" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>}
          {isNA&&<svg width="10" height="10" fill="none" stroke="#555" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>}
        </div>
        <span style={{ fontSize:'11px', fontWeight:600, color:'#666', flexShrink:0, width:'52px' }}>{data}</span>
        <div style={{ flex:1, minWidth:0 }}>
          {tx.documente?.furnizor
            ? <p style={{ fontSize:'13px', fontWeight:700, color:isNA?'#555':'#EEE', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration:isNA?'line-through':'none' }}>{tx.documente.furnizor}</p>
            : <p style={{ fontSize:'13px', fontWeight:600, color:isNA?'#555':'#DDD', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration:isNA?'line-through':'none' }}>{tx.descriere_curatata||tx.descriere}</p>
          }
          <div style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'2px' }}>
            <span style={{ fontSize:'10px', fontWeight:600, padding:'1px 7px', borderRadius:'20px', background:cat.bg, color:cat.c }}>{tx.categorie||'altele'}</span>
            {tx.documente?.furnizor && <span style={{ fontSize:'10px', color:'#555', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.descriere_curatata||tx.descriere}</span>}
          </div>
        </div>
        <span style={{ fontSize:'14px', fontWeight:700, flexShrink:0, color:tx.tip==='credit'?'#4ADE80':'#F87171' }}>
          {tx.tip==='credit'?'+':'-'}{tx.suma?.toFixed(2)} {tx.valuta}
        </span>
        <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
          {!isDone&&!isNA&&<>
            <button onClick={()=>setOpen(o=>!o)} style={{ fontSize:'11px', fontWeight:700, padding:'5px 12px', borderRadius:'7px', border:'none', background:open?'#333':culoare, color:'#fff', cursor:'pointer' }}>
              {open?'✕':'+ Doc'}
            </button>
            <button onClick={onNA} style={{ fontSize:'11px', fontWeight:600, padding:'5px 9px', borderRadius:'7px', border:'1px solid #2A2A2A', background:'#1A1A1A', color:'#888', cursor:'pointer' }}>N/A</button>
          </>}
          {isDone&&<span style={{ fontSize:'11px', fontWeight:600, padding:'5px 12px', borderRadius:'7px', background:'rgba(74,222,128,.15)', color:'#4ADE80' }}>{tx.documente?.tip_document||'doc'} ✓</span>}
          {isNA&&<button onClick={onClearNA} style={{ fontSize:'11px', fontWeight:600, padding:'5px 9px', borderRadius:'7px', border:'1px solid #2A2A2A', background:'#1A1A1A', color:'#666', cursor:'pointer' }}>Anulează N/A</button>}
        </div>
      </div>

      {open&&!isDone&&(
        <div style={{ padding:'12px 16px 14px', borderTop:'1px solid #1A1A1A', background:'#111' }}>
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
          <div style={{ padding:'10px', marginBottom:'10px', background:'#171717', border:'1px solid #282828', borderRadius:'9px' }}>
            <p style={{ fontSize:'11px', fontWeight:700, color:'#AAA', marginBottom:'7px' }}>Adaugă factura prin link</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'8px' }}>
              <input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="Link PDF Oblio, Booking, Airbnb sau altă platformă" style={INP}/>
              <button onClick={importUrl} disabled={uploading||!sourceUrl} style={{ padding:'8px 14px', border:'none', borderRadius:'8px', background:culoare, color:'#FFF', cursor:'pointer', opacity:uploading?.6:1 }}>Adaugă din link</button>
            </div>
          </div>
          <div onClick={()=>fileRef.current?.click()}
            onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files.length&&upload(e.dataTransfer.files)}}
            style={{ border:`1.5px dashed ${drag?culoare:'#2A2A2A'}`, borderRadius:'10px', padding:'18px', textAlign:'center', cursor:'pointer', background:drag?`rgba(${r},.06)`:'#0D0D0D' }}>
            {uploading?<p style={{fontSize:'12px',color:'#777'}}>Se încarcă...</p>:<p style={{fontSize:'12px',fontWeight:600,color:'#888'}}>drag & drop sau click · PDF / JPG / PNG</p>}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:'none'}} onChange={e=>e.target.files&&upload(e.target.files)}/>
          {uploadError && <p style={{ fontSize:'11px', color:'#F87171', marginTop:'8px' }}>{uploadError}</p>}
        </div>
      )}

      {isDone&&tx.documente&&(
        <div style={{ padding:'7px 16px 9px', borderTop:'1px solid rgba(74,222,128,.1)', background:'rgba(74,222,128,.03)', display:'flex', alignItems:'center', gap:'8px' }}>
          <svg width="13" height="13" fill="none" stroke="#4ADE80" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          {tx.documente.furnizor
            ? <span style={{fontSize:'13px',fontWeight:600,color:'#4ADE80'}}>{tx.documente.furnizor}</span>
            : <span style={{fontSize:'12px',fontWeight:500,color:'#4ADE80'}}>{tx.documente.fisier_nume}</span>
          }
          {tx.documente.furnizor&&<span style={{fontSize:'11px',color:'#777'}}>· {tx.documente.fisier_nume}</span>}
          {tx.documente.numar_document&&<span style={{fontSize:'11px',color:'#888', fontWeight:600}}>· {tx.documente.numar_document}</span>}
          <a href={`/api/tranzactii/document?id=${encodeURIComponent(tx.documente.id)}`} style={{ marginLeft:'auto', fontSize:'11px', fontWeight:700, color:'#4ADE80', textDecoration:'none' }}>Descarcă ↓</a>
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
}

function WorkspaceView({ txs, activeTxIndex, setActiveTxIndex, firmaId, lunaId, culoare, onNA, onClearNA, onUploadSuccess }: WorkspaceViewProps) {
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
      <div style={{ padding:'60px', background:'#161616', border:'1px solid #242424', borderRadius:'16px', textAlign:'center' }}>
        <p style={{ fontSize:'14px', color:'#888' }}>Nicio tranzacție în această categorie.</p>
      </div>
    )
  }

  return (
    <div style={{ minWidth:0, maxWidth:'100%' }}>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', marginBottom:'7px', fontSize:'10px', color:'#555' }}>
        <span>← → navigare</span>
        <span>Enter = Sari</span>
      </div>
      {/* Transaction selector */}
      <div ref={selectorRef} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(145px, 1fr))', gap:'7px', maxHeight:'156px', overflowY:'auto', overflowX:'hidden', padding:'8px', marginBottom:'20px', background:'#111', border:'1px solid #202020', borderRadius:'12px', scrollbarWidth:'thin' }}>
        {txs.map((tx, idx) => {
          const isCurrent = idx === activeTxIndex
          const isDone = !!tx.document_id
          const isNA = tx.note === 'na'
          
          let borderCol = '#2A2A2A'
          let bgCol = '#161616'
          let txtCol = '#888'
          
          if (isCurrent) {
            borderCol = culoare
            bgCol = culoare
            txtCol = '#fff'
          } else if (isDone) {
            borderCol = 'rgba(74,222,128,.15)'
            bgCol = 'rgba(74,222,128,.05)'
            txtCol = '#4ADE80'
          } else if (isNA) {
            borderCol = '#222'
            bgCol = '#121212'
            txtCol = '#555'
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
                <span style={{ fontSize:'11px', fontWeight: tx.documente?.furnizor ? 600 : 400, color: isCurrent ? 'rgba(255,255,255,.85)' : tx.documente?.furnizor ? '#AAAAAA' : '#666', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%', textAlign:'left' }}>
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
      />
    </div>
  )
}

function WorkspaceCard({ tx, index, total, firmaId, lunaId, culoare, onPrev, onNext, onNA, onClearNA, onUploadSuccess }: {
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
  }, [tx])

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

  const INP: React.CSSProperties = { fontSize:'13px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'8px', padding:'10px 14px', color:'#BBB', outline:'none', width:'100%' }
  
  const BTN: React.CSSProperties = {
    fontSize:'13px', fontWeight:700, padding:'10px 20px', borderRadius:'8px', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px', transition:'all .2s'
  }

  return (
    <div style={{ background:'#141414', border:'1px solid #222', borderRadius:'16px', display:'flex', flexDirection:'column', padding:'28px 32px', minHeight:'420px', position:'relative', overflow:'hidden', maxWidth:'100%' }}>
      {/* Background radial highlight */}
      <div style={{ position:'absolute', width:'300px', height:'300px', background:`radial-gradient(circle, rgba(${r},0.04) 0%, rgba(0,0,0,0) 70%)`, top:'-100px', left:'-100px', pointerEvents:'none' }} />

      {/* Left Column: Details & Nav */}
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'space-between', zIndex:1, minWidth:0 }}>
        <div>
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
            <span style={{ fontSize:'12px', fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:'.08em' }}>Tranzacția {index + 1} din {total}</span>
            <span style={{ fontSize:'11px', fontWeight:600, padding:'3px 9px', borderRadius:'20px', background:cat.bg, color:cat.c }}>{tx.categorie||'altele'}</span>
          </div>

          {/* Amount & Currency */}
          <div style={{ fontSize:'36px', fontWeight:800, color:tx.tip==='credit'?'#4ADE80':'#F87171', letterSpacing:'-0.5px', marginBottom:'16px' }}>
            {tx.tip==='credit'?'+':'-'}{tx.suma?.toFixed(2)} {tx.valuta}
          </div>

          {/* Info Rows */}
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {/* Entitate / Furnizor — mereu vizibil, prioritate maximă */}
            <div style={{ padding:'12px 16px', background: tx.documente?.furnizor ? `rgba(${r},.06)` : '#111', border:`1px solid ${tx.documente?.furnizor ? `rgba(${r},.25)` : '#222'}`, borderRadius:'10px' }}>
              <div style={{ fontSize:'10px', fontWeight:700, color: tx.documente?.furnizor ? culoare : '#555', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'4px' }}>
                {tx.documente?.furnizor ? 'Furnizor' : 'Entitate (extras bancă)'}
              </div>
              <div style={{ fontSize:'16px', fontWeight:700, color:'#EEE', lineHeight:'1.3', wordBreak:'break-word' }}>
                {tx.documente?.furnizor || tx.descriere_curatata || tx.descriere}
              </div>
              {tx.documente?.furnizor && (
                <div style={{ fontSize:'11px', color:'#666', marginTop:'5px', wordBreak:'break-word' }}>{tx.descriere_curatata || tx.descriere}</div>
              )}
            </div>

            {/* Descriere originală din bancă (dacă diferă de curatată și nu e deja afișată sus) */}
            {!tx.documente?.furnizor && tx.descriere_curatata && tx.descriere_curatata !== tx.descriere && (
              <div>
                <div style={{ fontSize:'10px', fontWeight:600, color:'#555', textTransform:'uppercase', marginBottom:'2px' }}>Descriere originală</div>
                <div style={{ fontSize:'11px', color:'#555', lineHeight:'1.4', wordBreak:'break-word' }}>{tx.descriere}</div>
              </div>
            )}

            <div>
              <div style={{ fontSize:'10px', fontWeight:600, color:'#777', textTransform:'uppercase', marginBottom:'3px' }}>Data tranzacție</div>
              <div style={{ fontSize:'14px', color:'#DDD', fontWeight:500 }}>{data}</div>
            </div>

            {tx.referinta && (
              <div>
                <div style={{ fontSize:'10px', fontWeight:600, color:'#555', textTransform:'uppercase', marginBottom:'2px' }}>Referință internă</div>
                <div style={{ fontSize:'11px', color:'#555', fontFamily:'monospace', wordBreak:'break-all' }}>{tx.referinta}</div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div style={{ display:'flex', gap:'8px', marginTop:'24px' }}>
          <button 
            disabled={!onPrev} 
            onClick={onPrev} 
            style={{ ...BTN, background:'#1F1F1F', border:'1px solid #2A2A2A', color:onPrev?'#DDD':'#444', cursor:onPrev?'pointer':'not-allowed' }}
          >
            ← Înapoi
          </button>
          
          {!isDone && (
            isNA ? (
              <button onClick={onClearNA} style={{ ...BTN, background:'#1A1A1A', border:'1px solid #2A2A2A', color:'#888' }}>
                Re-activează
              </button>
            ) : (
              <button onClick={onNA} style={{ ...BTN, background:'#1A1A1A', border:'1px solid #2A2A2A', color:'#666' }}>
                N/A (Sari)
              </button>
            )
          )}

          <button 
            disabled={!onNext} 
            onClick={onNext} 
            style={{ ...BTN, background:'#1F1F1F', border:'1px solid #2A2A2A', color:onNext?'#DDD':'#444', cursor:onNext?'pointer':'not-allowed' }}
          >
            Înainte →
          </button>
        </div>
      </div>

      {/* Bottom: Upload / Success */}
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', borderTop:'1px solid #1E1E1E', paddingTop:'24px', marginTop:'26px', zIndex:1 }}>
        {isDone && !editDoc ? (
          /* Success Card */
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ width:'48px', height:'48px', borderRadius:'50%', background:'rgba(74,222,128,.1)', border:'1px solid rgba(74,222,128,.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="22" height="22" fill="none" stroke="#4ADE80" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
            </div>
            <h3 style={{ fontSize:'16px', fontWeight:700, color:'#FFF', marginBottom:'8px' }}>Tranzacție Rezolvată</h3>
            <p style={{ fontSize:'13px', color:'#888', marginBottom:'20px' }}>Documentul a fost asociat cu succes în arhivă.</p>
            
            {/* Associated Doc Details */}
            <div style={{ background:'#0D0D0D', border:'1px solid #1A1A1A', borderRadius:'10px', padding:'12px 16px', display:'flex', flexDirection:'column', gap:'6px', textAlign:'left', marginBottom:'24px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <svg width="14" height="14" fill="none" stroke="#4ADE80" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                <span style={{ fontSize:'12px', fontWeight:600, color:'#4ADE80', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.documente?.fisier_nume}</span>
              </div>
              <div style={{ fontSize:'11px', color:'#666' }}>
                Tip: <span style={{ color:'#888', fontWeight:500 }}>{tx.documente?.tip_document || '—'}</span>
              </div>
              {tx.documente?.furnizor && (
                <div style={{ fontSize:'11px', color:'#666' }}>
                  Furnizor: <span style={{ color:'#888', fontWeight:500 }}>{tx.documente.furnizor}</span>
                </div>
              )}
              {tx.documente?.numar_document && (
                <div style={{ fontSize:'11px', color:'#666' }}>
                  Număr doc: <span style={{ color:'#888', fontWeight:500 }}>{tx.documente.numar_document}</span>
                </div>
              )}
            </div>

            <div style={{ display:'flex', justifyContent:'center', gap:'8px', flexWrap:'wrap' }}>
              {tx.documente && (
                <a href={`/api/tranzactii/document?id=${encodeURIComponent(tx.documente.id)}`} style={{ ...BTN, background:culoare, color:'#fff', textDecoration:'none' }}>
                  Descarcă Documentul ↓
                </a>
              )}
              <button onClick={() => setEditDoc(true)} style={{ ...BTN, background:'transparent', border:`1px solid rgba(${r},.3)`, color:culoare }}>
                Schimbă Documentul
              </button>
            </div>
          </div>
        ) : isNA ? (
          /* N/A Card */
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ width:'48px', height:'48px', borderRadius:'50%', background:'rgba(255,255,255,.03)', border:'1px solid #222', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <svg width="20" height="20" fill="none" stroke="#555" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </div>
            <h3 style={{ fontSize:'16px', fontWeight:700, color:'#DDD', marginBottom:'8px' }}>Tranzacție ignorată (N/A)</h3>
            <p style={{ fontSize:'13px', color:'#666', marginBottom:'24px' }}>Această tranzacție a fost marcată ca N/A (nu necesită document).</p>
            <button onClick={onClearNA} style={{ ...BTN, background:culoare, color:'#fff', margin:'0 auto' }}>
              Activează pentru adăugare doc
            </button>
          </div>
        ) : (
          /* Upload Form */
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
              <h3 style={{ fontSize:'14px', fontWeight:700, color:'#FFF' }}>Asociază Document</h3>
              {editDoc && (
                <button onClick={() => setEditDoc(false)} style={{ background:'transparent', border:'none', color:'#666', fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                  Anulează
                </button>
              )}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'14px' }}>
              <div>
                <label style={{ fontSize:'10px', color:'#555', fontWeight:700, textTransform:'uppercase', display:'block', marginBottom:'4px' }}>Tip Document</label>
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
                  <label style={{ fontSize:'10px', color:'#555', fontWeight:700, textTransform:'uppercase', display:'block', marginBottom:'4px' }}>Furnizor / Client</label>
                  <input type="text" placeholder="Nume firmă" value={furnizor} onChange={e=>setFurnizor(e.target.value)} style={INP}/>
                </div>
                <div>
                  <label style={{ fontSize:'10px', color:'#555', fontWeight:700, textTransform:'uppercase', display:'block', marginBottom:'4px' }}>Număr Document</label>
                  <input type="text" placeholder="Ex: 10243" value={numDoc} onChange={e=>setNumDoc(e.target.value)} style={INP}/>
                </div>
              </div>
            </div>

            <div style={{ padding:'12px', marginBottom:'12px', background:'#171717', border:'1px solid #282828', borderRadius:'10px' }}>
              <div style={{ fontSize:'12px', fontWeight:700, color:'#DDD', marginBottom:'4px' }}>Adaugă factura prin link</div>
              <div style={{ fontSize:'10px', color:'#666', marginBottom:'9px' }}>Oblio, Booking, Airbnb sau orice link HTTPS care returnează un PDF.</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'8px' }}>
                <input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="Lipește linkul facturii PDF" style={INP}/>
                <button onClick={importUrl} disabled={uploading||!sourceUrl} style={{ ...BTN, background:culoare, color:'#FFF', opacity:(uploading||!sourceUrl)?.5:1 }}>
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
                border:`1.5px dashed ${drag?culoare:'#2A2A2A'}`, 
                borderRadius:'10px', 
                padding:'24px', 
                textAlign:'center', 
                cursor:'pointer', 
                background:drag?`rgba(${r},.06)`:'#0D0D0D',
                transition:'all .2s'
              }}
            >
              {uploading ? (
                <p style={{fontSize:'12px',color:'#777'}}>Se încarcă...</p>
              ) : (
                <div>
                  <svg width="20" height="20" fill="none" stroke={culoare} strokeWidth="2.5" viewBox="0 0 24 24" style={{ margin:'0 auto 8px' }}><path d="M12 4v16m8-8H4"/></svg>
                  <p style={{fontSize:'12px',fontWeight:600,color:'#888',marginBottom:'4px'}}>Adaugă fișier (PDF / JPG / PNG)</p>
                  <p style={{fontSize:'10px',color:'#555'}}>drag & drop sau click pentru navigare</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:'none'}} onChange={e=>e.target.files&&upload(e.target.files)}/>
            {uploadError && <p style={{ fontSize:'11px', color:'#F87171', marginTop:'8px' }}>{uploadError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

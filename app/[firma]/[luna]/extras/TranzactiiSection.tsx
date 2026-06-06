'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Tx {
  id: string
  data_tranzactie: string
  descriere_curatata?: string
  descriere: string
  tip: 'debit'|'credit'
  suma: number
  valuta: string
  categorie?: string
  document_id?: string
  note?: string
  documente?: { tip_document?:string; furnizor?:string; numar_document?:string; fisier_nume?:string } | null
}

const CAT_STYLE: Record<string,{bg:string;c:string}> = {
  client:   {bg:'rgba(74,222,128,.12)',  c:'#4ADE80'},
  furnizor: {bg:'rgba(96,165,250,.12)',  c:'#60A5FA'},
  taxa:     {bg:'rgba(248,113,113,.12)', c:'#F87171'},
  angajat:  {bg:'rgba(167,139,250,.12)', c:'#A78BFA'},
  transfer: {bg:'rgba(120,120,120,.15)', c:'#999'},
  comision: {bg:'rgba(251,146,60,.12)',  c:'#FB923C'},
  banca:    {bg:'rgba(80,80,80,.15)',    c:'#888'},
  altele:   {bg:'rgba(60,60,60,.15)',    c:'#777'},
}
const PER_PAGE = 10

export default function TranzactiiSection({ tranzactii, firmaId, lunaId, culoare }:
  { tranzactii: Tx[]; firmaId: string; lunaId: string; culoare: string }
) {
  const [filter, setFilter] = useState<'all'|'lipsa'|'ok'|'na'>('all')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<Record<string,boolean>>({})
  const router = useRouter()
  const c = culoare

  const filtered = tranzactii.filter(t =>
    filter==='lipsa' ? (!t.document_id && t.note!=='na') :
    filter==='ok'    ? !!t.document_id :
    filter==='na'    ? t.note==='na' : true
  )
  const total = Math.ceil(filtered.length/PER_PAGE)
  const page_items = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)
  const counts = {
    all: tranzactii.length,
    lipsa: tranzactii.filter(t=>!t.document_id&&t.note!=='na').length,
    ok: tranzactii.filter(t=>!!t.document_id).length,
    na: tranzactii.filter(t=>t.note==='na').length,
  }

  function setF(f: typeof filter) { setFilter(f); setPage(1) }

  async function markNA(id: string) {
    setBusy(b=>({...b,[id]:true}))
    await fetch('/api/tranzactii/note', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,note:'na'}) })
    setBusy(b=>({...b,[id]:false}))
    router.refresh()
  }
  async function clearNA(id: string) {
    setBusy(b=>({...b,[id]:true}))
    await fetch('/api/tranzactii/note', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,note:null}) })
    setBusy(b=>({...b,[id]:false}))
    router.refresh()
  }

  const PB = (dis: boolean, active=false): React.CSSProperties => ({
    fontSize:'12px', fontWeight:600, padding:'5px 11px', borderRadius:'7px',
    border:`1px solid ${active?c:'#2A2A2A'}`,
    background: active ? c : '#1A1A1A',
    color: dis ? '#333' : active ? '#fff' : '#888',
    cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? .5 : 1,
  })

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px', flexWrap:'wrap', gap:'10px' }}>
        <h2 style={{ fontSize:'16px', fontWeight:700, color:'#FFF' }}>
          Tranzacții <span style={{ color:'#777', fontWeight:400 }}>({tranzactii.length})</span>
        </h2>
        <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
          {([['all',`Toate (${counts.all})`],['lipsa',`Lipsă doc (${counts.lipsa})`],['ok',`Documentate (${counts.ok})`],['na',`N/A (${counts.na})`]] as const).map(([f,l])=>(
            <button key={f} onClick={()=>setF(f)} style={{ ...PB(false, filter===f) }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
        {page_items.map(t => (
          <TxCard key={t.id} t={t} firmaId={firmaId} lunaId={lunaId} culoare={c}
            busy={!!busy[t.id]} onNA={()=>markNA(t.id)} onClearNA={()=>clearNA(t.id)} onSaved={()=>router.refresh()}/>
        ))}
        {page_items.length===0 && (
          <div style={{ padding:'40px', textAlign:'center', background:'#161616', border:'1px solid #242424', borderRadius:'14px' }}>
            <p style={{ fontSize:'14px', fontWeight:600, color:'#555' }}>Toate tranzacțiile din această categorie sunt rezolvate ✓</p>
          </div>
        )}
      </div>

      {total > 1 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'16px', padding:'12px 18px', background:'#161616', border:'1px solid #242424', borderRadius:'12px' }}>
          <span style={{ fontSize:'12px', color:'#888' }}>Pagina {page}/{total} · {filtered.length} tranzacții</span>
          <div style={{ display:'flex', gap:'5px' }}>
            <button onClick={()=>setPage(1)} disabled={page===1} style={PB(page===1)}>«</button>
            <button onClick={()=>setPage(p=>p-1)} disabled={page===1} style={PB(page===1)}>‹</button>
            {Array.from({length:total},(_,i)=>i+1)
              .filter(p=>p===1||p===total||Math.abs(p-page)<=1)
              .reduce<(number|'…')[]>((a,p,i,arr)=>{ if(i>0&&(p as number)-(arr[i-1] as number)>1) a.push('…'); a.push(p); return a },[])
              .map((p,i) => typeof p==='string'
                ? <span key={`e${i}`} style={{ fontSize:'12px', color:'#555', padding:'0 4px' }}>…</span>
                : <button key={p} onClick={()=>setPage(p as number)} style={PB(false, page===p)}>{p}</button>
              )
            }
            <button onClick={()=>setPage(p=>p+1)} disabled={page===total} style={PB(page===total)}>›</button>
            <button onClick={()=>setPage(total)} disabled={page===total} style={PB(page===total)}>»</button>
          </div>
        </div>
      )}
    </div>
  )
}

function TxCard({ t, firmaId, lunaId, culoare, busy, onNA, onClearNA, onSaved }:
  { t:Tx; firmaId:string; lunaId:string; culoare:string; busy:boolean; onNA:()=>void; onClearNA:()=>void; onSaved:()=>void }
) {
  const [showUp, setShowUp] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tipDoc, setTipDoc] = useState('factura')
  const [furnizor, setFurnizor] = useState('')
  const [numDoc, setNumDoc] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const isNA = t.note==='na'
  const isDone = !!t.document_id
  const cat = t.categorie ? CAT_STYLE[t.categorie]||CAT_STYLE.altele : null
  const data = new Date(t.data_tranzactie).toLocaleDateString('ro-RO',{day:'2-digit',month:'short',year:'2-digit'})
  const r = `${parseInt(culoare.slice(1,3),16)},${parseInt(culoare.slice(3,5),16)},${parseInt(culoare.slice(5,7),16)}`

  async function upload(files: FileList) {
    setUploading(true)
    const fd = new FormData()
    fd.append('file',files[0]); fd.append('txId',t.id); fd.append('firmaId',firmaId); fd.append('lunaId',lunaId)
    fd.append('tip',tipDoc); fd.append('furnizor',furnizor); fd.append('numDoc',numDoc)
    await fetch('/api/tranzactii/doc', { method:'POST', body:fd })
    setUploading(false); setShowUp(false); onSaved(); router.refresh()
  }

  const cardBg = isDone ? 'rgba(74,222,128,.04)' : isNA ? 'rgba(80,80,80,.04)' : '#161616'
  const cardBorder = isDone ? 'rgba(74,222,128,.18)' : isNA ? '#1E1E1E' : '#242424'
  const INP: React.CSSProperties = { fontSize:'12px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'8px', padding:'8px 11px', color:'#BBB', outline:'none', width:'100%' }

  return (
    <div style={{ background:cardBg, border:`1px solid ${cardBorder}`, borderRadius:'12px', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'13px 16px' }}>
        {/* Status */}
        <div style={{ width:'20px', height:'20px', borderRadius:'6px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
          background: isDone?'#4ADE80': isNA?'#252525':'transparent',
          border: isDone?'none': isNA?'1px solid #333':'1.5px solid #2A2A2A' }}>
          {isDone && <svg width="11" height="11" fill="none" stroke="#0A0A0A" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>}
          {isNA  && <svg width="10" height="10" fill="none" stroke="#555" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>}
        </div>

        {/* Date */}
        <span style={{ fontSize:'11px', fontWeight:600, color:'#666', flexShrink:0, width:'50px' }}>{data}</span>

        {/* Description */}
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:'13px', fontWeight:500, color:isNA?'#555':'#DDD', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration:isNA?'line-through':'none' }}>
            {t.descriere_curatata||t.descriere}
          </p>
          {cat && <span style={{ fontSize:'10px', fontWeight:600, padding:'1px 6px', borderRadius:'20px', background:cat.bg, color:cat.c, display:'inline-block', marginTop:'2px' }}>{t.categorie}</span>}
        </div>

        {/* Amount */}
        <span style={{ fontSize:'14px', fontWeight:700, flexShrink:0, color:t.tip==='credit'?'#4ADE80':'#F87171' }}>
          {t.tip==='credit'?'+':'-'}{t.suma.toFixed(2)} {t.valuta}
        </span>

        {/* Actions */}
        <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
          {!isDone && !isNA && <>
            <button onClick={()=>setShowUp(s=>!s)} style={{ fontSize:'11px', fontWeight:700, padding:'5px 11px', borderRadius:'7px', border:'none', background:culoare, color:'#fff', cursor:'pointer' }}>
              {showUp?'Anulează':'+ Doc'}
            </button>
            <button onClick={onNA} disabled={busy} style={{ fontSize:'11px', fontWeight:600, padding:'5px 9px', borderRadius:'7px', border:'1px solid #2A2A2A', background:'#1A1A1A', color:'#888', cursor:'pointer' }}>
              N/A
            </button>
          </>}
          {isDone && <span style={{ fontSize:'11px', fontWeight:600, padding:'5px 11px', borderRadius:'7px', background:'rgba(74,222,128,.15)', color:'#4ADE80' }}>
            {t.documente?.tip_document||'doc'} ✓
          </span>}
          {isNA && <button onClick={onClearNA} disabled={busy} style={{ fontSize:'11px', fontWeight:600, padding:'5px 9px', borderRadius:'7px', border:'1px solid #2A2A2A', background:'#1A1A1A', color:'#666', cursor:'pointer' }}>
            Anulează N/A
          </button>}
        </div>
      </div>

      {/* Upload panel */}
      {showUp && !isDone && (
        <div style={{ padding:'10px 16px 14px', borderTop:'1px solid #1A1A1A', background:'#111' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'10px' }}>
            <select value={tipDoc} onChange={e=>setTipDoc(e.target.value)} style={INP}>
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
          <div onClick={()=>fileRef.current?.click()}
            onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files.length&&upload(e.dataTransfer.files)}}
            style={{ border:`1.5px dashed ${drag?culoare:'#2A2A2A'}`, borderRadius:'10px', padding:'16px', textAlign:'center', cursor:'pointer', background:drag?`rgba(${r},.06)`:'#0D0D0D' }}>
            {uploading
              ? <p style={{ fontSize:'12px', color:'#777' }}>Se încarcă...</p>
              : <p style={{ fontSize:'12px', fontWeight:600, color:'#888' }}>drag & drop sau click · PDF / JPG / PNG</p>
            }
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={e=>e.target.files&&upload(e.target.files)}/>
        </div>
      )}

      {/* Attached doc info */}
      {isDone && t.documente && (
        <div style={{ padding:'7px 16px 9px', borderTop:'1px solid rgba(74,222,128,.1)', background:'rgba(74,222,128,.03)', display:'flex', alignItems:'center', gap:'8px' }}>
          <svg width="13" height="13" fill="none" stroke="#4ADE80" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><polyline points="9,15 12,18 15,15"/><line x1="12" y1="12" x2="12" y2="18"/></svg>
          <span style={{ fontSize:'12px', fontWeight:500, color:'#4ADE80' }}>{t.documente.fisier_nume}</span>
          {t.documente.furnizor && <span style={{ fontSize:'11px', color:'#555' }}>· {t.documente.furnizor}</span>}
          {t.documente.numar_document && <span style={{ fontSize:'11px', color:'#555' }}>· {t.documente.numar_document}</span>}
        </div>
      )}
    </div>
  )
}

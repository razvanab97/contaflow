'use client'
import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const MOD_LABELS: Record<string,string> = { extras:'Extras de cont', emag:'Emag facturi', trendyol:'Trendyol', booking:'Booking', airbnb:'Airbnb', '5stardesk':'5starDesk', angajati:'Documente angajați', resurse_umane:'Resurse umane', acte_contabile:'Acte contabile' }
const UPLOAD_MODS = ['emag','trendyol','booking','airbnb','5stardesk','angajati','resurse_umane','acte_contabile']
const TIP_OPT = ['aviz_plata','factura','borderou','raport_csv','chenzina','foaie_prezenta','stat_plata','contract','altul']
const TIP_LBL: Record<string,string> = { aviz_plata:'Aviz plată', factura:'Factură', borderou:'Borderou', raport_csv:'Raport CSV', chenzina:'Chenzina', foaie_prezenta:'Foaie prezență', stat_plata:'Stat plată', contract:'Contract', altul:'Altul' }

function rgb(h: string) { return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}` }

interface Firma { id:string; slug:string; nume:string; culoare:string }
interface Item { id:string; completat:boolean; checklist_templates?:{ titlu:string; descriere?:string; modul:string; necesita_semnatura:boolean; spre_proiect:boolean; ordine:number } }
interface Extras { id:string; valuta:string; nr_tranzactii:number; nr_documentate:number; procesat_ai:boolean }

export default function ChecklistClient({ firma, lunaId, lunaStatus, progresPct, items, extrase, slug, luna, lunaLabel }:
  { firma:Firma; lunaId:string; lunaStatus:string; progresPct:number; items:Item[]; extrase:Extras[]; slug:string; luna:string; lunaLabel:string }
) {
  const sorted = [...items].sort((a,b)=>(a.checklist_templates?.ordine||0)-(b.checklist_templates?.ordine||0))
  const byMod: Record<string,Item[]> = {}
  for (const i of sorted) { const m=i.checklist_templates?.modul||'altul'; if(!byMod[m]) byMod[m]=[]; byMod[m]!.push(i) }
  const total = sorted.length, done = sorted.filter(i=>i.completat).length, pct = total>0?Math.round((done/total)*100):0
  const r = rgb(firma.culoare)

  const [exportLoading, setExportLoading] = useState(false)
  async function handleExport() {
    setExportLoading(true)
    const res = await fetch('/api/export/zip', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ firmaId:firma.id, firmaNume:firma.nume, lunaId, luna }) })
    if (res.ok) { const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${firma.nome}_${luna}.zip`; a.click(); URL.revokeObjectURL(url) }
    setExportLoading(false)
  }

  const SB: React.CSSProperties = { fontSize:'13px', fontWeight:500, color:'#888', display:'flex', alignItems:'center', gap:'9px', padding:'8px 18px' }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0A0A0A' }}>
      <aside style={{ width:'220px', flexShrink:0, background:'#0D0D0D', borderRight:'1px solid #1E1E1E', display:'flex', flexDirection:'column', padding:'20px 0', position:'sticky', top:0, height:'100vh' }}>
        <div style={{ padding:'4px 18px 24px', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ width:'28px', height:'28px', background:'#FFF', borderRadius:'7px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="14" fill="none" stroke="#111" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <span style={{ fontSize:'15px', fontWeight:700, color:'#FFF' }}>ContaFlow</span>
        </div>
        <Link href="/dashboard" style={SB}><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>Dashboard</Link>
        <div style={{ height:'1px', background:'#1E1E1E', margin:'8px 14px' }}/>
        <div style={{ padding:'0 18px 8px', fontSize:'10px', fontWeight:700, color:'#444', letterSpacing:'.12em', textTransform:'uppercase' }}>{firma.nume.replace(' SRL','')}</div>
        <Link href={`/${slug}/${luna}`} style={{ ...SB, color:'#BBB' }}>Checklist</Link>
        <Link href={`/${slug}/${luna}/extras`} style={SB}>Extras de cont</Link>
        {extrase.length>0 && extrase.map(e=>(
          <div key={e.id} style={{ padding:'3px 18px 3px 36px', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:'11px', color:'#666' }}>{e.valuta}</span>
            <span style={{ fontSize:'11px', color:e.procesat_ai?'#4ADE80':'#555' }}>{e.procesat_ai?`${e.nr_tranzactii} tx`:'—'}</span>
          </div>
        ))}
        <div style={{ marginTop:'auto', padding:'12px 18px', fontSize:'11px', color:'#555' }}>{lunaLabel}</div>
      </aside>

      <main style={{ flex:1, padding:'40px 44px', background:'#0F0F0F' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'22px' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
              <div style={{ width:'9px', height:'9px', borderRadius:'50%', background:firma.culoare }}/>
              <h1 style={{ fontSize:'22px', fontWeight:700, color:'#FFF', letterSpacing:'-0.4px' }}>{firma.nume}</h1>
            </div>
            <p style={{ fontSize:'13px', color:'#888', marginLeft:'19px' }}>{lunaLabel}</p>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:'30px', fontWeight:700, color:firma.culoare, letterSpacing:'-0.8px' }}>{pct}%</div>
            <div style={{ fontSize:'12px', color:'#888' }}>{done}/{total} completate</div>
          </div>
        </div>

        <div style={{ height:'3px', background:'#1E1E1E', borderRadius:'2px', marginBottom:'28px' }}>
          <div style={{ height:'3px', borderRadius:'2px', background:firma.culoare, width:`${pct}%` }}/>
        </div>

        {extrase.length>0 && (
          <div style={{ background:'#161616', border:`1px solid rgba(${r},.25)`, borderRadius:'12px', padding:'14px 18px', marginBottom:'20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:'13px', fontWeight:600, color:'#FFF', marginBottom:'4px' }}>Extrase procesate AI</div>
              <div style={{ display:'flex', gap:'16px' }}>
                {extrase.map(e=>(
                  <span key={e.id} style={{ fontSize:'12px', fontWeight:500, color:firma.culoare }}>
                    {e.valuta}: {e.nr_tranzactii} tranzacții · {e.nr_documentate} documentate
                  </span>
                ))}
              </div>
            </div>
            <Link href={`/${slug}/${luna}/extras`} style={{ fontSize:'12px', fontWeight:600, color:firma.culoare, padding:'6px 14px', borderRadius:'8px', border:`1px solid rgba(${r},.3)` }}>
              Gestionează →
            </Link>
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {Object.entries(byMod).map(([mod, modItems]) => {
            const modDone = modItems.filter(i=>i.completat).length
            return (
              <div key={mod} style={{ background:'#161616', border:'1px solid #242424', borderRadius:'14px', overflow:'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 18px', borderBottom:'1px solid #1E1E1E' }}>
                  <span style={{ fontSize:'12px', fontWeight:700, color:'#CCC', textTransform:'uppercase', letterSpacing:'.06em' }}>{MOD_LABELS[mod]||mod}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <span style={{ fontSize:'11px', color:'#666' }}>{modDone}/{modItems.length}</span>
                    {mod==='extras' && <Link href={`/${slug}/${luna}/extras`} style={{ fontSize:'11px', fontWeight:600, color:firma.culoare }}>deschide →</Link>}
                  </div>
                </div>
                {modItems.map((item, idx) => (
                  <ChecklistItemRow key={item.id} item={item} firmaId={firma.id} lunaId={lunaId} culoare={firma.culoare} hasUpload={UPLOAD_MODS.includes(mod)} borderTop={idx>0} />
                ))}
              </div>
            )
          })}
        </div>

        <div style={{ display:'flex', gap:'10px', marginTop:'28px' }}>
          <Link href={`/${slug}/${luna}/extras`} style={{ fontSize:'13px', fontWeight:600, padding:'9px 18px', borderRadius:'9px', border:'1px solid #282828', color:'#999', background:'#161616' }}>
            Extras de cont →
          </Link>
          <button onClick={handleExport} disabled={exportLoading} style={{ fontSize:'13px', fontWeight:600, padding:'9px 18px', borderRadius:'9px', border:'none', background:firma.culoare, color:'#fff', cursor:'pointer', opacity:exportLoading?.6:1 }}>
            {exportLoading ? 'Se generează...' : 'Export ZIP ↓'}
          </button>
        </div>
      </main>
    </div>
  )
}

function ChecklistItemRow({ item, firmaId, lunaId, culoare, hasUpload, borderTop }:
  { item:Item; firmaId:string; lunaId:string; culoare:string; hasUpload:boolean; borderTop:boolean }
) {
  const [expanded, setExpanded] = useState(false)
  const [docs, setDocs] = useState<{id:string;fisier_nume:string;tip_document?:string}[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [merging, setMerging] = useState(false)
  const [tip, setTip] = useState('aviz_plata')
  const [desc, setDesc] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const t = item.checklist_templates
  const r = rgb(culoare)

  const loadDocs = useCallback(async () => {
    setLoadingDocs(true)
    const res = await fetch(`/api/checklist/docs?itemId=${item.id}`)
    if (res.ok) { const d = await res.json(); setDocs(d.docs||[]) }
    setLoadingDocs(false)
  }, [item.id])

  async function toggle() {
    if (!expanded && hasUpload && docs.length===0) await loadDocs()
    setExpanded(e=>!e)
  }

  async function upload(files: FileList) {
    setUploading(true)
    for (const f of Array.from(files)) {
      const fd = new FormData()
      fd.append('file',f); fd.append('itemId',item.id); fd.append('firmaId',firmaId); fd.append('lunaId',lunaId); fd.append('tip',tip); fd.append('desc',desc)
      await fetch('/api/checklist/upload', { method:'POST', body:fd })
    }
    await loadDocs(); setUploading(false); router.refresh()
  }

  async function merge() {
    setMerging(true)
    const res = await fetch('/api/checklist/merge', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ itemId:item.id, titlu:t?.titlu||'document' }) })
    if (res.ok) { const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${(t?.titlu||'doc').replace(/[^a-zA-Z0-9]/g,'_')}.pdf`; a.click(); URL.revokeObjectURL(url) }
    setMerging(false)
  }

  const INP: React.CSSProperties = { fontSize:'12px', background:'#0F0F0F', border:'1px solid #2A2A2A', borderRadius:'8px', padding:'8px 12px', color:'#BBB', outline:'none', width:'100%' }

  return (
    <div style={{ borderTop:borderTop?'1px solid #1A1A1A':'none', background:item.completat?'rgba(74,222,128,.04)':'transparent' }}>
      <div onClick={hasUpload?toggle:undefined} style={{ display:'flex', alignItems:'flex-start', gap:'12px', padding:'13px 18px', cursor:hasUpload?'pointer':'default' }}>
        <div style={{ width:'17px', height:'17px', borderRadius:'5px', flexShrink:0, marginTop:'1px', border:item.completat?'none':'1.5px solid #333', background:item.completat?'#4ADE80':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {item.completat && <svg width="10" height="10" fill="none" stroke="#0A0A0A" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'7px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'14px', fontWeight:item.completat?400:500, color:item.completat?'#555':'#DDD', textDecoration:item.completat?'line-through':'none' }}>{t?.titlu}</span>
            {t?.necesita_semnatura && <span style={{ fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'20px', background:'rgba(251,146,60,.15)', color:'#FB923C' }}>semnat</span>}
            {t?.spre_proiect && <span style={{ fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'20px', background:'rgba(167,139,250,.15)', color:'#A78BFA' }}>→ proiect</span>}
            {hasUpload && docs.length>0 && <span style={{ fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'20px', background:`rgba(${r},.15)`, color:culoare }}>{docs.length} fișiere</span>}
          </div>
          {t?.descriere && <p style={{ fontSize:'11px', color:'#777', marginTop:'3px' }}>{t.descriere}</p>}
        </div>
        {hasUpload && <span style={{ fontSize:'11px', color:'#555', marginTop:'2px' }}>{expanded?'▲':'▼'}</span>}
      </div>

      {expanded && hasUpload && (
        <div style={{ padding:'0 18px 16px', borderTop:'1px solid #1A1A1A', background:'#111' }}>
          {loadingDocs && <p style={{ fontSize:'12px', color:'#555', padding:'12px 0' }}>Se încarcă...</p>}

          {docs.length>0 && (
            <div style={{ marginTop:'14px', marginBottom:'14px' }}>
              <div style={{ fontSize:'11px', fontWeight:700, color:'#666', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'8px' }}>Fișiere ({docs.length})</div>
              {docs.map(d => (
                <div key={d.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'#161616', borderRadius:'8px', border:'1px solid #222', marginBottom:'5px' }}>
                  <svg width="14" height="14" fill="none" stroke={culoare} strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                  <span style={{ fontSize:'13px', fontWeight:500, color:'#CCC', flex:1 }}>{d.fisier_nume}</span>
                  {d.tip_document && <span style={{ fontSize:'10px', color:'#666', background:'#1E1E1E', padding:'2px 7px', borderRadius:'5px' }}>{TIP_LBL[d.tip_document]||d.tip_document}</span>}
                </div>
              ))}
              <button onClick={merge} disabled={merging} style={{ marginTop:'10px', fontSize:'12px', fontWeight:700, padding:'8px 16px', borderRadius:'8px', border:'none', background:culoare, color:'#fff', cursor:'pointer', opacity:merging?.6:1 }}>
                {merging ? 'Generare...' : `${docs.length>1?`PDF combinat (${docs.length})`:' Descarcă PDF'} ↓`}
              </button>
            </div>
          )}

          <div style={{ marginTop:docs.length>0?'8px':'14px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px' }}>
              <select value={tip} onChange={e=>setTip(e.target.value)} style={INP}>
                {TIP_OPT.map(o=><option key={o} value={o}>{TIP_LBL[o]}</option>)}
              </select>
              <input type="text" placeholder="Descriere (opțional)" value={desc} onChange={e=>setDesc(e.target.value)} style={INP}/>
            </div>
            <div onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files.length&&upload(e.dataTransfer.files)}}
              style={{ border:`1.5px dashed ${drag?culoare:'#2A2A2A'}`, borderRadius:'10px', padding:'20px', textAlign:'center', cursor:'pointer', background:drag?`rgba(${r},.06)`:'#0D0D0D' }}>
              {uploading
                ? <div><div style={{ width:'18px', height:'18px', border:`2px solid ${culoare}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite', margin:'0 auto 8px' }}/><p style={{ fontSize:'12px', color:'#777' }}>Se încarcă...</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
                : <div><p style={{ fontSize:'13px', fontWeight:600, color:'#999' }}>Adaugă fișiere</p><p style={{ fontSize:'11px', color:'#666', marginTop:'3px' }}>PDF, JPG, PNG · mai multe simultan</p></div>
              }
            </div>
            <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={e=>e.target.files&&upload(e.target.files)}/>
          </div>
        </div>
      )}
    </div>
  )
}

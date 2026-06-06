'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Extras { id:string; nr_tranzactii:number; nr_documentate:number; procesat_ai:boolean; sold_final?:number }

export default function UploadExtras({ valuta, firmaId, lunaId, extras, culoare }:
  { valuta:string; firmaId:string; lunaId:string; extras:Extras|null; culoare:string }
) {
  const [loading, setLoading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const r = `${parseInt(culoare.slice(1,3),16)},${parseInt(culoare.slice(3,5),16)},${parseInt(culoare.slice(5,7),16)}`

  async function handle(file: File) {
    if (!file.name.endsWith('.pdf')) { setErr('Doar PDF'); return }
    setLoading(true); setErr('')
    const fd = new FormData()
    fd.append('pdf',file); fd.append('firmaId',firmaId); fd.append('lunaId',lunaId); fd.append('valuta',valuta)
    const res = await fetch('/api/extras/upload', { method:'POST', body:fd })
    const d = await res.json()
    if (res.ok) router.refresh(); else setErr(d.error||'Eroare')
    setLoading(false)
  }

  if (extras?.procesat_ai) return (
    <div style={{ background:'#161616', border:`1px solid rgba(${r},.25)`, borderRadius:'14px', padding:'18px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'14px' }}>
        <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#4ADE80' }}/>
        <span style={{ fontSize:'14px', fontWeight:600, color:'#FFF' }}>Extras {valuta}</span>
        <span style={{ marginLeft:'auto', fontSize:'10px', fontWeight:600, padding:'2px 8px', borderRadius:'20px', background:'rgba(74,222,128,.15)', color:'#4ADE80' }}>Procesat AI ✓</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px' }}>
        {[{l:'Tranzacții',v:extras.nr_tranzactii},{l:'Documentate',v:extras.nr_documentate}].map(s=>(
          <div key={s.l} style={{ background:'#111', borderRadius:'9px', padding:'10px 12px' }}>
            <div style={{ fontSize:'10px', fontWeight:600, color:'#555', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'.08em' }}>{s.l}</div>
            <div style={{ fontSize:'20px', fontWeight:700, color:'#FFF' }}>{s.v}</div>
          </div>
        ))}
      </div>
      {extras.sold_final!=null && <p style={{ fontSize:'11px', color:'#777' }}>Sold final: {extras.sold_final.toFixed(2)} {valuta}</p>}
      <button onClick={()=>fileRef.current?.click()} style={{ fontSize:'11px', color:'#555', background:'none', border:'none', cursor:'pointer', marginTop:'8px', padding:0 }}>Reîncarcă PDF →</button>
      <input ref={fileRef} type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>e.target.files?.[0]&&handle(e.target.files[0])}/>
    </div>
  )

  return (
    <div onClick={()=>!loading&&fileRef.current?.click()}
      onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files[0]&&handle(e.dataTransfer.files[0])}}
      style={{ background:drag?`rgba(${r},.07)`:'#161616', border:`2px dashed ${drag?culoare:'#282828'}`, borderRadius:'14px', padding:'28px', textAlign:'center', cursor:'pointer' }}>
      <input ref={fileRef} type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>e.target.files?.[0]&&handle(e.target.files[0])}/>
      {loading
        ? <div><div style={{ width:'20px', height:'20px', border:`2px solid ${culoare}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite', margin:'0 auto 10px' }}/><p style={{ fontSize:'12px', color:'#777' }}>AI procesează...</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
        : <div>
            <p style={{ fontSize:'14px', fontWeight:600, color:'#AAA' }}>Extras {valuta}</p>
            <p style={{ fontSize:'11px', color:'#666', marginTop:'4px' }}>drag & drop sau click · PDF</p>
            {err && <p style={{ fontSize:'11px', color:'#F87171', marginTop:'8px' }}>{err}</p>}
          </div>
      }
    </div>
  )
}

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
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const r = `${parseInt(culoare.slice(1,3),16)},${parseInt(culoare.slice(3,5),16)},${parseInt(culoare.slice(5,7),16)}`

  async function handle(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { setErr('Selectează un fișier PDF'); return }
    setLoading(true); setErr(''); setStatus('Se trimite PDF-ul...')
    
    const fd = new FormData()
    fd.append('pdf', file)
    fd.append('firmaId', firmaId)
    fd.append('lunaId', lunaId)
    fd.append('valuta', valuta)

    setStatus('AI extrage tranzacțiile... (30-60 sec)')
    
    let res: Response
    try {
      res = await fetch('/api/extras/upload', { method: 'POST', body: fd })
    } catch (e) {
      setErr('Eroare rețea: ' + String(e))
      setLoading(false)
      return
    }

    let d: any
    try {
      d = await res.json()
    } catch {
      setErr('Răspuns invalid de la server')
      setLoading(false)
      return
    }

    if (res.ok && d.ok) {
      setStatus(`✓ ${d.count} tranzacții extrase`)
      setTimeout(() => router.refresh(), 500)
    } else {
      setErr(d.error || `Eroare server (${res.status})`)
    }
    setLoading(false)
  }

  const boxStyle = {
    background: extras?.procesat_ai ? '#161616' : drag ? `rgba(${r},.07)` : '#161616',
    border: extras?.procesat_ai ? `1px solid rgba(${r},.25)` : `2px dashed ${drag ? culoare : '#282828'}`,
    borderRadius: '14px',
    padding: '20px',
  }

  return (
    <div style={boxStyle}>
      {extras?.procesat_ai && !loading && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'14px' }}>
            <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#4ADE80' }}/>
            <span style={{ fontSize:'14px', fontWeight:600, color:'#FFF' }}>Extras {valuta}</span>
            <span style={{ marginLeft:'auto', fontSize:'10px', fontWeight:600, padding:'2px 8px', borderRadius:'20px', background:'rgba(74,222,128,.15)', color:'#4ADE80' }}>
              Procesat AI ✓
            </span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'12px' }}>
            {[{l:'Tranzacții',v:extras.nr_tranzactii},{l:'Documentate',v:extras.nr_documentate}].map(s=>(
              <div key={s.l} style={{ background:'#111', borderRadius:'9px', padding:'10px 12px' }}>
                <div style={{ fontSize:'10px', fontWeight:600, color:'#555', marginBottom:'4px', textTransform:'uppercase' as const, letterSpacing:'.08em' }}>{s.l}</div>
                <div style={{ fontSize:'20px', fontWeight:700, color:'#FFF' }}>{s.v}</div>
              </div>
            ))}
          </div>
          {extras.sold_final != null && (
            <p style={{ fontSize:'12px', color:'#777', marginBottom:'8px' }}>Sold final: {extras.sold_final.toFixed(2)} {valuta}</p>
          )}
          <button 
            onClick={() => fileRef.current?.click()} 
            style={{ fontSize:'12px', fontWeight:500, color:culoare, background:'none', border:`1px solid rgba(${r},.3)`, borderRadius:'6px', cursor:'pointer', padding:'5px 12px' }}
          >
            Reîncarcă PDF
          </button>
        </>
      )}

      {loading && (
        <div style={{ textAlign:'center', padding:'16px 0' }}>
          <div style={{ width:'24px', height:'24px', border:`2px solid ${culoare}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite', margin:'0 auto 12px' }}/>
          <p style={{ fontSize:'13px', fontWeight:600, color:'#CCC' }}>{status}</p>
          <p style={{ fontSize:'11px', color:'#666', marginTop:'4px' }}>Nu închide pagina</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {!extras?.procesat_ai && !loading && (
        <div 
          onClick={() => fileRef.current?.click()}
          onDragOver={e=>{e.preventDefault();setDrag(true)}} 
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files[0]&&handle(e.dataTransfer.files[0])}}
          style={{ textAlign:'center', cursor:'pointer', padding:'12px 0' }}
        >
          <p style={{ fontSize:'14px', fontWeight:600, color:'#AAA' }}>Extras {valuta}</p>
          <p style={{ fontSize:'11px', color:'#666', marginTop:'4px' }}>drag & drop sau click · PDF</p>
        </div>
      )}

      {err && (
        <div style={{ marginTop:'10px', padding:'10px 12px', background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', borderRadius:'8px' }}>
          <p style={{ fontSize:'12px', fontWeight:600, color:'#F87171' }}>Eroare:</p>
          <p style={{ fontSize:'11px', color:'#F87171', marginTop:'2px', wordBreak:'break-all' as const }}>{err}</p>
        </div>
      )}

      <input 
        ref={fileRef} 
        type="file" 
        accept=".pdf,application/pdf" 
        style={{ display:'none' }} 
        onChange={e => { if(e.target.files?.[0]) handle(e.target.files[0]); e.target.value = '' }}
      />
    </div>
  )
}

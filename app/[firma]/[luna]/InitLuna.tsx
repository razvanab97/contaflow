'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function InitLuna({ firma, luna }: { firma: {id:string;nume:string;culoare:string}; luna: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const [y,m] = luna.split('-')
  const luni = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
  const ll = `${luni[+m]} ${y}`
  const r = parseInt(firma.culoare.slice(1,3),16), g = parseInt(firma.culoare.slice(3,5),16), b = parseInt(firma.culoare.slice(5,7),16)

  async function init() {
    setLoading(true)
    await fetch('/api/luna/init', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({firmaId:firma.id,luna:luna+'-01'}) })
    router.refresh()
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0A0A0A', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', maxWidth:'340px' }}>
        <div style={{ width:'48px', height:'48px', borderRadius:'14px', margin:'0 auto 20px', background:`rgba(${r},${g},${b},.15)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:'14px', height:'14px', borderRadius:'50%', background:firma.culoare }}/>
        </div>
        <h1 style={{ fontSize:'18px', fontWeight:600, color:'#FFF', marginBottom:'6px' }}>{firma.nume}</h1>
        <p style={{ fontSize:'13px', color:'#777', marginBottom:'28px' }}>{ll} — lună neîncepută</p>
        <button onClick={init} disabled={loading} style={{ padding:'10px 24px', borderRadius:'9px', border:'none', background:firma.culoare, color:'#fff', fontSize:'13px', fontWeight:600, cursor:'pointer', opacity:loading?.6:1 }}>
          {loading ? 'Se inițializează...' : `Începe ${ll}`}
        </button>
        <p style={{ fontSize:'11px', color:'#444', marginTop:'12px' }}>Se creează automat toate task-urile</p>
      </div>
    </div>
  )
}

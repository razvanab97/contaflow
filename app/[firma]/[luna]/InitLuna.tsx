'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { rgb, tint } from '@/lib/colors'

export default function InitLuna({ firma, luna }: { firma: {id:string;nume:string;culoare:string}; luna: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const [y,m] = luna.split('-')
  const luni = ['','Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
  const ll = `${luni[+m]} ${y}`
  const r = rgb(firma.culoare)

  async function init() {
    setLoading(true)
    await fetch('/api/luna/init', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({firmaId:firma.id,luna:luna+'-01'}) })
    router.refresh()
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--c-0a0a0a)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', maxWidth:'340px' }}>
        <div style={{ width:'48px', height:'48px', borderRadius:'14px', margin:'0 auto 20px', background:tint(r,.15), display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:'14px', height:'14px', borderRadius:'50%', background:firma.culoare }}/>
        </div>
        <h1 style={{ fontSize:'18px', fontWeight:600, color:'var(--c-ffffff)', marginBottom:'6px' }}>{firma.nume}</h1>
        <p style={{ fontSize:'13px', color:'var(--c-777777)', marginBottom:'28px' }}>{ll} — lună neîncepută</p>
        <button onClick={init} disabled={loading} style={{ padding:'10px 24px', borderRadius:'9px', border:'none', background:firma.culoare, color:'var(--c-ffffff)', fontSize:'13px', fontWeight:600, cursor:'pointer', opacity:loading?.6:1 }}>
          {loading ? 'Se inițializează...' : `Începe ${ll}`}
        </button>
        <p style={{ fontSize:'11px', color:'var(--c-444444)', marginTop:'12px' }}>Se creează automat toate task-urile</p>
      </div>
    </div>
  )
}

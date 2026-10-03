'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { rgb, tint } from '@/lib/colors'
import { accountingPeriodLabel, accountingWorkLabel } from '@/lib/accounting-period'

export default function InitLuna({ firma, luna }: { firma: {id:string;nume:string;culoare:string}; luna: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const periodLabel = accountingPeriodLabel(luna)
  const workLabel = accountingWorkLabel(luna)
  const r = rgb(firma.culoare)

  async function init() {
    setLoading(true)
    await fetch('/api/luna/init', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({firmaId:firma.id,luna:luna+'-01'}) })
    router.refresh()
  }

  return (
    <div style={{ flex:1, minHeight:'60vh', width:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="card animate-in" style={{ textAlign:'center', maxWidth:'400px', width:'100%', padding:'32px 24px' }}>
        <div style={{ width:'48px', height:'48px', borderRadius:'var(--r-lg)', margin:'0 auto 16px', background:tint(r,.15), display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:'14px', height:'14px', borderRadius:'50%', background:firma.culoare }}/>
        </div>
        <h1 style={{ fontSize:'var(--fs-lg)', fontWeight:650, color:'var(--text-primary)', marginBottom:'6px' }}>{firma.nume}</h1>
        <p style={{ fontSize:'var(--fs-md)', color:'var(--text-secondary)', marginBottom:'24px', lineHeight:1.55 }}>Contabilitate {periodLabel}<br/><span style={{ fontSize:'var(--fs-sm)', color:'var(--text-muted)' }}>({workLabel}) — lună neîncepută</span></p>
        <button onClick={init} disabled={loading} className="btn btn-primary btn-lg" style={{ width:'100%', opacity:loading?.6:1, cursor: loading ? 'wait' : undefined }}>
          {loading ? 'Se inițializează…' : `Începe contabilitatea ${periodLabel}`}
        </button>
        <p style={{ fontSize:'var(--fs-sm)', color:'var(--text-muted)', marginTop:'12px' }}>Se creează automat toate task-urile lunii</p>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { legibil } from '@/lib/colors'

interface Props {
  firmaId: string
  firmaNume: string
  firmaSlug: string
  lunaId: string
  lunaLabel: string
  culoare: string
}

export default function ExportButtons({ firmaId, firmaNume, firmaSlug, lunaId, lunaLabel, culoare }: Props) {
  const [zipBusy, setZipBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  async function downloadZip() {
    setZipBusy(true)
    try {
      const res = await fetch('/api/export/zip', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ firmaId, firmaNume, firmaSlug, lunaId, luna:lunaLabel }) })
      if (res.ok) { const b=await res.blob(); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`${firmaNume.replace(/[^a-zA-Z0-9]+/g,'_')}_${lunaLabel.replace(/\s+/g,'_')}.zip`; a.click(); URL.revokeObjectURL(u) }
      else { const e=await res.json().catch(()=>({error:'Eroare server'})); alert(e.error||'Eroare la generare ZIP') }
    } catch(e) { alert('Eroare conexiune: '+String(e)) }
    setZipBusy(false)
  }

  async function downloadPdf() {
    setPdfBusy(true)
    const res = await fetch('/api/export/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lunaId, firmaSlug, title:`${firmaNume}_${lunaLabel}_toate` }) })
    if (res.ok) { const b=await res.blob(); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`${firmaNume.replace(/[^a-zA-Z0-9]+/g,'_')}_${lunaLabel.replace(/\s+/g,'_')}_toate.pdf`; a.click(); URL.revokeObjectURL(u) }
    setPdfBusy(false)
  }

  return (
    <div style={{ display:'flex', gap:'8px' }}>
      <button onClick={downloadZip} disabled={zipBusy} style={{ fontSize:'12px', fontWeight:600, padding:'8px 14px', borderRadius:'8px', border:'1px solid #2A2A2A', background:'#161616', color:'#CCC', cursor:'pointer', opacity:zipBusy?.6:1 }}>
        {zipBusy ? '...' : '↓ ZIP categorii'}
      </button>
      <button onClick={downloadPdf} disabled={pdfBusy} style={{ fontSize:'12px', fontWeight:600, padding:'8px 14px', borderRadius:'8px', border:`1px solid ${culoare}`, background:'transparent', color:legibil(culoare), cursor:'pointer', opacity:pdfBusy?.6:1 }}>
        {pdfBusy ? '...' : '↓ PDF toate'}
      </button>
    </div>
  )
}

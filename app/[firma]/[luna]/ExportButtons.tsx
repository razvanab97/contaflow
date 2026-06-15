'use client'
import { useState } from 'react'

interface Props {
  firmaId: string
  firmaNume: string
  lunaId: string
  lunaLabel: string
  culoare: string
}

export default function ExportButtons({ firmaId, firmaNume, lunaId, lunaLabel, culoare }: Props) {
  const [zipBusy, setZipBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  async function downloadZip() {
    setZipBusy(true)
    const res = await fetch('/api/export/zip', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ firmaId, firmaNume, lunaId, luna:lunaLabel }) })
    if (res.ok) { const b=await res.blob(); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`${firmaNume.replace(/[^a-zA-Z0-9]+/g,'_')}_${lunaLabel.replace(/\s+/g,'_')}.zip`; a.click(); URL.revokeObjectURL(u) }
    setZipBusy(false)
  }

  async function downloadPdf() {
    setPdfBusy(true)
    const res = await fetch('/api/export/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lunaId, title:`${firmaNume}_${lunaLabel}_toate` }) })
    if (res.ok) { const b=await res.blob(); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`${firmaNume.replace(/[^a-zA-Z0-9]+/g,'_')}_${lunaLabel.replace(/\s+/g,'_')}_toate.pdf`; a.click(); URL.revokeObjectURL(u) }
    setPdfBusy(false)
  }

  return (
    <div style={{ display:'flex', gap:'8px' }}>
      <button onClick={downloadZip} disabled={zipBusy} style={{ fontSize:'12px', fontWeight:600, padding:'8px 14px', borderRadius:'8px', border:'1px solid #2A2A2A', background:'#161616', color:'#CCC', cursor:'pointer', opacity:zipBusy?.6:1 }}>
        {zipBusy ? '...' : '↓ ZIP categorii'}
      </button>
      <button onClick={downloadPdf} disabled={pdfBusy} style={{ fontSize:'12px', fontWeight:600, padding:'8px 14px', borderRadius:'8px', border:`1px solid ${culoare}`, background:'transparent', color:culoare, cursor:'pointer', opacity:pdfBusy?.6:1 }}>
        {pdfBusy ? '...' : '↓ PDF toate'}
      </button>
    </div>
  )
}

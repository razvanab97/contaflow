'use client'
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/ui/Icon'

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
    try {
      const res = await fetch('/api/export/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ firmaId, lunaId, firmaSlug, firmaNume, lunaLabel, title:`${firmaNume}_${lunaLabel}_toate` }) })
      if (res.ok) { const b=await res.blob(); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`${firmaNume.replace(/[^a-zA-Z0-9]+/g,'_')}_${lunaLabel.replace(/\s+/g,'_')}_toate.pdf`; a.click(); URL.revokeObjectURL(u) }
      else { const e=await res.json().catch(()=>({error:'Eroare server'})); alert(e.error||'Eroare la generare PDF') }
    } catch(e) { alert('Eroare conexiune: '+String(e)) }
    setPdfBusy(false)
  }

  // Exportul poate fi pornit si din paleta de comenzi (⌘K) - eveniment "cf:export".
  const handlers = useRef({ downloadZip, downloadPdf })
  handlers.current = { downloadZip, downloadPdf }
  useEffect(() => {
    const onExport = (e: Event) => {
      const kind = (e as CustomEvent).detail
      if (kind === 'zip') handlers.current.downloadZip()
      else if (kind === 'pdf') handlers.current.downloadPdf()
    }
    window.addEventListener('cf:export', onExport)
    return () => window.removeEventListener('cf:export', onExport)
  }, [])

  return (
    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
      <button onClick={downloadZip} disabled={zipBusy} className="btn" title="Arhivă ZIP cu documentele lunii, pe categorii" style={{ opacity:zipBusy?.6:1, cursor: zipBusy ? 'wait' : undefined }}>
        <Icon name="download" size={15} /> {zipBusy ? 'Se generează…' : 'ZIP categorii'}
      </button>
      <button onClick={downloadPdf} disabled={pdfBusy} className="btn btn-primary" title="Un singur PDF cu toate documentele lunii" style={{ opacity:pdfBusy?.6:1, cursor: pdfBusy ? 'wait' : undefined }}>
        <Icon name="download" size={15} /> {pdfBusy ? 'Se generează…' : 'PDF toate'}
      </button>
    </div>
  )
}

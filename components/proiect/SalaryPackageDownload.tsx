'use client'
import { useState } from 'react'
import type { Asset } from '@/lib/proiect-workflow'
import { SALARY_PACKAGE } from '@/lib/salary-package'

export default function SalaryPackageDownload({ assets, url, month, disabled = false }: { assets: Asset[]; url: string; month: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const documents = assets.filter(asset => SALARY_PACKAGE.some(group => group.task === asset.task))
  const missing = SALARY_PACKAGE.filter(group => !documents.some(asset => asset.task === group.task))
  async function download() {
    if (busy || disabled || !documents.length) return
    setBusy(true); setError('')
    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Arhiva nu a putut fi descărcată.') }
      if (!response.headers.get('Content-Type')?.includes('application/zip')) throw new Error('Răspunsul nu este o arhivă ZIP. Reîncearcă.')
      const blob = await response.blob(), href = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = href; link.download = `Dosar_salarizare_AB_TEXTILE_luna_lucru_${month}.zip`
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(href), 30000)
    } catch (error) { setError(error instanceof Error ? error.message : 'Descărcarea a eșuat.') }
    finally { setBusy(false) }
  }
  return <section aria-label="Descărcare pachet salarizare" style={{padding:16,borderBottom:'1px solid var(--border)',fontSize:'var(--fs-sm)'}}>
    <div style={{display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
      <div><strong>Stat de plată + pontaj + REGES + centralizator</strong><p style={{marginTop:6,color:'var(--text-secondary)'}}>{documents.length} documente salvate în rutina lunii, în patru foldere separate.</p></div>
      <button type="button" className="btn btn-primary" disabled={disabled || busy || !documents.length} onClick={() => void download()}>{busy ? 'Se pregătește arhiva…' : 'Descarcă toate documentele (ZIP)'}</button>
    </div>
    {missing.length>0&&<p style={{marginTop:8,color:'var(--warning)'}}>Lipsesc fișiere la: {missing.map(group=>group.label).join(', ')}. Arhiva include doar documentele salvate.</p>}
    {error&&<p role="alert" style={{marginTop:8,color:'var(--danger)',overflowWrap:'anywhere'}}>{error}</p>}
  </section>
}

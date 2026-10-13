'use client'
import { REGES_HISTORICAL_EMPLOYEES, REGES_LABELS, regesIdentity, type RegesReportType } from '@/lib/reges-reports'
import type { Asset } from '@/lib/proiect-workflow'

export default function RegesRecommendations({ assets }: { assets: Asset[] }) {
  const reports = assets.filter(asset => asset.reges)
  const dates = new Set(reports.map(asset => asset.reges?.issuedOn).filter(Boolean))
  function item(type: RegesReportType, person?: string) {
    const found = reports.some(asset => asset.reges?.type === type && (!person || regesIdentity(asset.reges.subject) === regesIdentity(person)))
    return <li key={`${type}-${person || 'firma'}`} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'6px 0',flexWrap:'wrap'}}>
      <span>{REGES_LABELS[type]}{person ? ` · ${person}` : ' · AB TEXTILE S.R.L.'}</span>
      <strong style={{color:found?'var(--success)':'var(--text-secondary)',fontSize:'var(--fs-xs)'}}>{found ? 'Încărcat și recunoscut' : 'De descărcat / verificat'}</strong>
    </li>
  }
  return <section aria-label="Documente REGES recomandate" style={{padding:16,border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontSize:'var(--fs-sm)'}}>
    <strong>Recomandate din istoricul proiectului: 6 PDF-uri de bază</strong>
    <p style={{margin:'8px 0',color:'var(--text-secondary)',lineHeight:1.5}}>În REGES, alege AB TEXTILE S.R.L. → Extrase. Lista de persoane este cea din lunile trecute; verifică personalul actual. Descarcă rapoartele în aceeași zi.</p>
    <ul style={{listStyle:'none',padding:0,margin:0}}>
      {REGES_HISTORICAL_EMPLOYEES.map(person => item('salariat', person))}
      {item('salariati_angajator')}{item('contracte_angajator')}
    </ul>
    <details style={{marginTop:12}}><summary style={{cursor:'pointer'}}>Suplimentar: 4 extrase de contract (pachet extins: 10 PDF-uri)</summary>
      <p style={{marginTop:8,color:'var(--text-secondary)'}}>Acestea apar și în exporturile istorice din iulie. Nu sunt confirmate ca obligatorii lunar și nu înlocuiesc extrasele de salariat.</p>
      <ul style={{listStyle:'none',padding:0}}>{REGES_HISTORICAL_EMPLOYEES.map(person => item('contract', person))}</ul>
    </details>
    <a href="https://reges.inspectiamuncii.ro/ajutor/ghid-utilizare-aplicatie-angajator/extrase-salariat/" target="_blank" rel="noreferrer" style={{display:'inline-block',marginTop:12,color:'var(--accent)'}}>Ghid REGES pentru descărcarea extraselor</a>
    {dates.size>1&&<p role="alert" style={{color:'var(--warning)',marginTop:10}}>Extrasele recunoscute au date de emitere diferite. Verifică setul înainte de trimitere.</p>}
    <p style={{color:'var(--text-secondary)',marginTop:10}}>Recunoașterea fișierelor nu confirmă semnarea, trimiterea sau acceptarea.</p>
  </section>
}

'use client'
import { useEffect, useState } from 'react'
import type { Workflow } from '@/lib/proiect-workflow'
import type { SalaryPlan } from '@/lib/salary-payment'
import css from './CreditProposal.module.css'

const lei = (cents: number) => new Intl.NumberFormat('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100)
export default function SalaryPaymentPlan({ url, assets, documentUrl }: { url: string; assets: Workflow['assets']; documentUrl: (scope: string,id: string)=>string }) {
  const fingerprint = JSON.stringify(assets.filter(a=>['stat','centralizator','salarii'].includes(a.task)).map(a=>[a.id,a.createdAt]))
  const [revision,setRevision] = useState(0), [loaded,setLoaded] = useState<{key:string;plan?:SalaryPlan;error?:string}|null>(null)
  const [verified,setVerified] = useState(false), [message,setMessage] = useState('')
  const key = `${url}:${fingerprint}:${revision}`
  useEffect(()=>{
    const controller = new AbortController();setVerified(false);setMessage('')
    void(async()=>{
      try{
        const response = await fetch(url,{cache:'no-store',signal:controller.signal}), data = await response.json()
        if(!response.ok)throw new Error(data.error||'Nu pot pregăti salariile.')
        if(!controller.signal.aborted)setLoaded({key,plan:data})
      }catch(error){if(!controller.signal.aborted)setLoaded({key,error:error instanceof Error?error.message:'Date indisponibile.'})}
    })()
    return()=>controller.abort()
  },[url,key])
  const plan = loaded?.key===key?loaded.plan:undefined
  async function copy(row: SalaryPlan['rows'][number]){
    if(!row.reference||!verified)return
    try{await navigator.clipboard.writeText(`Beneficiar: ${row.reference.payment.name}\nIBAN: ${row.reference.payment.iban}\nBanca: ${row.reference.payment.bank}\nSuma: ${lei(row.amountCents)} RON\nDetalii: ${row.description}`);setMessage(`Detaliile pentru ${row.name} au fost copiate. Nu a fost inițiată o plată.`)}
    catch{setMessage('Clipboard indisponibil. Detaliile rămân vizibile mai jos.')}
  }
  return <section className={css.card} aria-label="Pregătirea salariilor">
    <div className={css.heading}><strong>Salarii de pregătit</strong><button type="button" className="btn btn-sm" onClick={()=>setRevision(n=>n+1)}>Actualizează salariile</button></div>
    {loaded?.key!==key&&<p role="status">Citesc statul lunii și OP-urile de referință...</p>}
    {loaded?.key===key&&loaded.error&&<p role="alert">{loaded.error}</p>}
    {plan&&<>
      <p className={css.help}>Salarii pentru {plan.period}. Sumele vin din statul actual; beneficiarii și IBAN-urile vin din OP-uri anterioare.</p>
      <div className={css.amount}>{lei(plan.netCents)} <small>lei salarii nete</small></div>
      {plan.contributionsCents!==undefined&&<p>Contribuții: {lei(plan.contributionsCents)} lei. Total salarii + contribuții: {lei(plan.netCents+plan.contributionsCents)} lei.</p>}
      <p className={css.help}>Acesta este un plan de pregătire, nu un sold restant confirmat. OP-urile istorice nu dovedesc plata lunii curente. Verifică separat plățile și extrasul acestei luni.</p>
      {plan.warnings.map(warning=><p role="alert" key={warning}>{warning}</p>)}
      <label className={css.verify}><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>Am verificat statul actual și conturile beneficiarilor înainte de preluarea detaliilor.</label>
      {plan.rows.map(row=><article key={row.name} className={css.card} style={{padding:14,borderRadius:10}}>
        <div className={css.heading}><strong>{row.name}</strong><strong>{lei(row.amountCents)} lei</strong></div>
        <p>Detalii plată: {row.description}</p>
        {row.reference?<>
          <p className={css.help}>{row.reference.payment.bank} · beneficiar în OP: {row.reference.payment.name}</p>
          <p style={{fontFamily:'monospace',overflowWrap:'anywhere'}}>{row.reference.payment.iban}</p>
          <p className={css.help}>Reper istoric: salariu {row.reference.payment.period}, {lei(row.reference.payment.amountCents)} lei, procesat {row.reference.payment.processedOn}.{row.reference.payment.yearInferred?' Anul este dedus din data procesării; verifică sursa.':''}</p>
          <div className={css.heading}><a href={documentUrl(row.reference.scope,row.reference.assetId)}>Deschide OP-ul sursă</a><button type="button" className="btn btn-sm" disabled={!verified} onClick={()=>void copy(row)}>Copiază detaliile pentru {row.name}</button></div>
        </>:<p role="alert">Lipsește OP-ul sursă pentru contul acestei persoane. Nu completăm un IBAN presupus.</p>}
      </article>)}
      <a href={documentUrl(new URL(url,'https://contaflow.xyz').searchParams.get('scope')||'',plan.stat.id)}>Deschide statul folosit pentru sume</a>
      {message&&<p role="status">{message}</p>}
    </>}
  </section>
}

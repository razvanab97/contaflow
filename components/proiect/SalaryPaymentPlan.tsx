'use client'
import { useEffect, useState } from 'react'
import type { Workflow } from '@/lib/proiect-workflow'
import type { SalaryPlan } from '@/lib/salary-payment'
import { regesIdentity } from '@/lib/reges-reports'
import Icon from '@/components/ui/Icon'
import css from './CreditProposal.module.css'

const lei = (cents: number) => new Intl.NumberFormat('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100)
export default function SalaryPaymentPlan({ url, assets, documentUrl, checks, onChecksChange, disabled = false }: { url: string; assets: Workflow['assets']; documentUrl: (scope: string,id: string)=>string; checks: Record<string,string>; onChecksChange: (checks:Record<string,string>)=>void; disabled?:boolean }) {
  const fingerprint = JSON.stringify(assets.filter(a=>['stat','centralizator','salarii'].includes(a.task)).map(a=>[a.id,a.createdAt]))
  const [revision,setRevision] = useState(0), [loaded,setLoaded] = useState<{key:string;plan?:SalaryPlan;error?:string}|null>(null)
  const [message,setMessage] = useState('')
  const key = `${url}:${fingerprint}:${revision}`
  useEffect(()=>{
    const controller = new AbortController();setMessage('')
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
  const signature = (row: SalaryPlan['rows'][number]) => JSON.stringify([plan?.period,plan?.stat.id,row.amountCents,row.reference?.scope,row.reference?.assetId])
  const checked = (row: SalaryPlan['rows'][number]) => !!row.reference && checks[regesIdentity(row.name)]===signature(row)
  function toggle(rows: SalaryPlan['rows'], value: boolean){
    const next = {...checks}
    for(const row of rows){const id=regesIdentity(row.name);if(value&&row.reference)next[id]=signature(row);else delete next[id]}
    onChecksChange(next)
  }
  async function copy(row: SalaryPlan['rows'][number]){
    if(!row.reference||!checked(row))return
    try{await navigator.clipboard.writeText(`Beneficiar: ${row.reference.payment.name}\nIBAN: ${row.reference.payment.iban}\nBanca: ${row.reference.payment.bank}\nSuma: ${lei(row.amountCents)} RON\nDetalii: ${row.description}`);setMessage(`Detaliile pentru ${row.name} au fost copiate. Nu a fost inițiată o plată.`)}
    catch{setMessage('Clipboard indisponibil. Detaliile rămân vizibile mai jos.')}
  }
  const LUNI = ['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie']
  const perioada = (p: string) => { const [y,m] = p.split('-'); return LUNI[Number(m)-1] ? `${LUNI[Number(m)-1]} ${y}` : p }
  const initiale = (n: string) => n.split(/[\s-]+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('')
  const iban = (s: string) => s.replace(/\s+/g,'').replace(/(.{4})/g,'$1 ').trim()
  const dataRo = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('.') : d
  const verificati = plan ? plan.rows.filter(checked).length : 0
  return <section className={css.sp} aria-label="Pregătirea salariilor">
    <div className={css.spTop}>
      <div className={css.spTitle}>
        <div className={css.spIcon} aria-hidden><Icon name="bank" size={18} /></div>
        <div><strong>Salarii de pregătit{plan?` · ${perioada(plan.period)}`:''}</strong><span>Sume din statul actual · conturi din OP-urile anterioare</span></div>
      </div>
      <button type="button" className={css.spRefresh} onClick={()=>setRevision(n=>n+1)}>↻ Actualizează salariile</button>
    </div>
    {loaded?.key!==key&&<p role="status" className={css.spStatus}>Citesc statul lunii și OP-urile de referință...</p>}
    {loaded?.key===key&&loaded.error&&<p role="alert" className={css.spAlert}>{loaded.error}</p>}
    {plan&&<>
      <div className={css.spStats}>
        <div className={`${css.spStat} ${css.spStatMain}`}><span>Salarii nete</span><div className={css.amount}>{lei(plan.netCents)} <small>lei salarii nete</small></div></div>
        {plan.contributionsCents!==undefined&&<>
          <div className={css.spStat}><span>Contribuții</span><b>{lei(plan.contributionsCents)} lei</b></div>
          <div className={css.spStat}><span>Total de plată</span><b>{lei(plan.netCents+plan.contributionsCents)} lei</b></div>
        </>}
      </div>
      {plan.warnings.map(warning=><p role="alert" key={warning} className={css.spAlert}>{warning}</p>)}
      <div className={css.spCheckAll}>
        <div className={css.spProgress}>
          <div className={css.spBar}><div style={{width:`${plan.rows.length?Math.round(verificati/plan.rows.length*100):0}%`}}/></div>
          <small><b>{verificati} din {plan.rows.length}</b> angajați verificați</small>
        </div>
        <label className={css.spAll}><input type="checkbox" disabled={disabled||plan.rows.some(row=>!row.reference)} checked={plan.rows.length>0&&plan.rows.every(checked)} onChange={e=>toggle(plan.rows,e.target.checked)}/>Am verificat statul actual și conturile beneficiarilor înainte de preluarea detaliilor.</label>
      </div>
      <div className={css.spList}>
        {plan.rows.map(row=>{const ok=checked(row),ref=row.reference;return <article key={row.name} className={css.spRow} data-ok={ok}>
          <div className={css.spAvatar} aria-hidden>{initiale(row.name)}</div>
          <div className={css.spMain}>
            <div className={css.spName}>{row.name}<span className={`${css.spBadge} ${ok?css.spBadgeOk:css.spBadgeTodo}`}>{ok?'Verificat':'De verificat'}</span></div>
            {ref?<>
              <div className={css.spMeta}><span>{ref.payment.bank}</span><span className={css.spDot}/><span className={css.spIban}>{iban(ref.payment.iban)}</span></div>
              <div className={css.spRef} title={ref.payment.yearInferred?'Anul este dedus din data procesării; verifică sursa.':undefined}>{row.description}{regesIdentity(ref.payment.name)!==regesIdentity(row.name)?` · beneficiar în OP: ${ref.payment.name}`:''} · reper {ref.payment.period}: {lei(ref.payment.amountCents)} lei, procesat {dataRo(ref.payment.processedOn)}{ref.payment.yearInferred?' · an dedus':''}</div>
            </>:<>
              <div className={css.spRef}>{row.description}</div>
              <p role="alert" className={css.spMissing}>Lipsește OP-ul sursă pentru contul acestei persoane. Nu completăm un IBAN presupus.</p>
            </>}
          </div>
          <div className={css.spSide}>
            <div className={css.spSum}>{lei(row.amountCents)} lei</div>
            <div className={css.spActions}>
              <label className={css.spSwitch}><input type="checkbox" aria-label={`Verificat ${row.name}`} disabled={disabled||!ref} checked={ok} onChange={e=>toggle([row],e.target.checked)}/>Verificat</label>
              {ref&&<button type="button" className={css.spBtn} aria-label={`Copiază detaliile pentru ${row.name}`} disabled={!ok} title={ok?'Copiază beneficiar, IBAN, bancă, sumă și detalii':'Bifează întâi „Verificat”'} onClick={()=>void copy(row)}>Copiază</button>}
              {ref&&<a className={css.spLink} href={documentUrl(ref.scope,ref.assetId)} aria-label="Deschide OP-ul sursă" title="Deschide OP-ul sursă">OP ↗</a>}
            </div>
          </div>
        </article>})}
      </div>
      {message&&<p role="status" className={css.spStatus}>{message}</p>}
      <div className={css.spFoot}>
        <p className={css.spNote}>Plan de pregătire, nu confirmare de plată: OP-urile istorice nu dovedesc plata lunii curente, iar bifele nu marchează salariile ca plătite.</p>
        <a className={css.spLink} href={documentUrl(new URL(url,'https://contaflow.xyz').searchParams.get('scope')||'',plan.stat.id)}>Deschide statul folosit pentru sume ↗</a>
      </div>
    </>}
  </section>
}

'use client'
import { useEffect, useState, type ClipboardEvent, type CSSProperties } from 'react'
import { parseTaxEmail, paymentIssues, parseTaxAmount, normalizeIban, sameTaxCompany, taxPeriodReview, expectedTaxPeriod, type TaxDraft, type TaxMailState, type TaxPayment, type ExtractedPayment } from '@/lib/impozite-mail'

type Totals={count:number;total:number;remaining:number}
type Firma={id:string;nume:string;slug:string}
const card:CSSProperties={background:'var(--c-111111)',border:'1px solid var(--c-1e1e1e)',borderRadius:12,padding:20}
const field:CSSProperties={background:'var(--c-0d0d0d)',border:'1px solid var(--c-2a2a2a)',borderRadius:7,padding:'9px 10px',fontSize:13,color:'var(--c-ffffff)',width:'100%',minWidth:0}
const btn:CSSProperties={background:'var(--c-161616)',border:'1px solid var(--c-2a2a2a)',color:'var(--c-dddddd)',borderRadius:7,padding:'9px 12px',fontSize:12,fontWeight:600,cursor:'pointer'}
const small:CSSProperties={fontSize:12,color:'var(--c-999999)',lineHeight:1.5}
const fields:CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}
const blank=():ExtractedPayment=>({label:'',amount:null,iban:'',fiscalId:'',recipient:'',description:'',due:null})
function money(amount:number|null){return amount===null?'—':amount.toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2})+' RON'}
async function json(res:Response){const data=await res.json();if(!res.ok)throw new Error(data.error||'Cererea a eșuat');return data}
function PaymentEditor({payment,onChange,saved=false,onCopy}:{payment:ExtractedPayment|TaxPayment;onChange:(patch:Partial<ExtractedPayment&TaxPayment>)=>void;saved?:boolean;onCopy?:(value:string)=>void}){
  const issues=paymentIssues(payment)
  return <div style={{...card,padding:15,background:'var(--c-161616)'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',marginBottom:10}}>
      <strong style={{fontSize:14}}>{payment.label||'Plată de completat'}</strong>
      <span style={{...small,color:issues.length?'var(--accent-red)':'var(--accent-mint)'}}>{issues.length?'De verificat: '+issues.join(', '):'Date complete pentru pregătire'}</span>
    </div>
    <div style={fields}>
      <label style={small}>Pentru ce este plata<input style={field} value={payment.label} onChange={e=>onChange({label:e.target.value})}/></label>
      <label style={small}>Sumă (RON)<input style={field} inputMode="decimal" value={payment.amount??''} onChange={e=>onChange({amount:parseTaxAmount(e.target.value)})}/></label>
      <label style={small}>CUI/CIF pentru plată<input style={field} value={payment.fiscalId} onChange={e=>onChange({fiscalId:e.target.value})}/></label>
      <label style={{...small,gridColumn:'1 / -1'}}>Cont IBAN<input style={{...field,fontFamily:'monospace'}} value={payment.iban} onChange={e=>onChange({iban:normalizeIban(e.target.value)})}/></label>
      <label style={small}>Beneficiar (dacă apare în email)<input style={field} value={payment.recipient} onChange={e=>onChange({recipient:e.target.value})}/></label>
      <label style={small}>Scadență (dacă este indicată)<input style={field} type="date" value={payment.due||''} onChange={e=>onChange({due:e.target.value||null})}/></label>
    </div>
    <label style={{...small,display:'block',marginTop:10}}>Detalii / explicația plății<input style={field} value={payment.description} onChange={e=>onChange({description:e.target.value})}/></label>
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:10}}>
      {saved&&<label style={{...small,color:'var(--c-dddddd)'}}><input type="checkbox" checked={(payment as TaxPayment).paid} onChange={e=>onChange({paid:e.target.checked})}/> Plătit, confirmat manual</label>}
      {saved&&onCopy&&payment.iban&&<button style={btn} onClick={()=>onCopy(payment.iban)}>Copiază IBAN</button>}
      {saved&&onCopy&&payment.amount!==null&&<button style={btn} onClick={()=>onCopy(String(payment.amount))}>Copiază suma</button>}
      {saved&&onCopy&&payment.description&&<button style={btn} onClick={()=>onCopy(payment.description)}>Copiază detaliile</button>}
    </div>
  </div>
}
export default function TaxMailPanel({firma,lunaId,luna,onTotals}:{firma:Firma;lunaId:string;luna:string;onTotals:(totals:Totals)=>void}){
  const [state,setState]=useState<TaxMailState|null>(null)
  const [text,setText]=useState(''),[file,setFile]=useState<File|null>(null),[draft,setDraft]=useState<TaxDraft|null>(null)
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false)
  const [preview,setPreview]=useState(''),[confirmedCompany,setConfirmedCompany]=useState(false),[confirmedPeriod,setConfirmedPeriod]=useState(false)
  async function load(){setError('');try{const data=await json(await fetch('/api/impozite/mail?firmaId='+encodeURIComponent(firma.id)+'&lunaId='+encodeURIComponent(lunaId),{cache:'no-store'}));setState(data.state);setDirty(false)}catch(e){setError(e instanceof Error?e.message:'Nu pot încărca plățile')}}
  useEffect(()=>{void load()},[firma.id,lunaId])
  useEffect(()=>{if(!state)return;onTotals({count:state.payments.length,total:state.payments.reduce((sum,p)=>sum+(p.amount||0),0),remaining:state.payments.reduce((sum,p)=>sum+(p.paid?0:p.amount||0),0)})},[state,onTotals])
  useEffect(()=>{if(!file){setPreview('');return}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file])
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault()};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty])
  async function scan(image:File){
    setError('');setNotice('');setDraft(null);setConfirmedCompany(false);setConfirmedPeriod(false)
    if(!['image/png','image/jpeg','image/webp'].includes(image.type)||image.size>5*1024*1024){setError('Acceptă PNG, JPG sau WebP de maximum 5 MB.');return}
    setFile(image);setBusy('Citesc local imaginea…')
    let worker:Awaited<ReturnType<typeof import('tesseract.js').createWorker>>|null=null
    try{
      const {createWorker}=await import('tesseract.js')
      worker=await createWorker('ron',1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr/tesseract-core-lstm.wasm.js',langPath:'/ocr',logger:m=>setBusy('OCR local: '+m.status+' '+Math.round(m.progress*100)+'%')})
      const result=await worker.recognize(image)
      setText(result.data.text.trim())
      setNotice('Textul a fost citit local. Corectează eventualele cifre înainte de analiză.')
    }catch(e){setError('Citirea imaginii a eșuat: '+(e instanceof Error?e.message:String(e)))}
    finally{if(worker)await worker.terminate();setBusy('')}
  }
  function paste(e:ClipboardEvent<HTMLElement>){
    const image=Array.from(e.clipboardData.files).find(f=>f.type.startsWith('image/'))||Array.from(e.clipboardData.items).find(item=>item.type.startsWith('image/'))?.getAsFile()
    if(image){e.preventDefault();void scan(new File([image],'captura-email.png',{type:image.type}));return}
    if(e.target instanceof HTMLTextAreaElement)return
    const pasted=e.clipboardData.getData('text/plain')
    if(pasted.trim()){e.preventDefault();setText(pasted);setFile(null);setDraft(null);setConfirmedCompany(false);setConfirmedPeriod(false)}
  }
  function analyze(){const result=parseTaxEmail(text);setDraft(result);setConfirmedCompany(false);setConfirmedPeriod(false);setError(result.payments.length?'':'Nu s-au identificat plăți. Corectează textul extras sau lipește emailul complet.');setNotice('')}
  function changeDraft(index:number,patch:Partial<ExtractedPayment>){setDraft(prev=>prev?{...prev,payments:prev.payments.map((p,i)=>i===index?{...p,...patch}:p)}:prev)}
  function changePayment(id:string,patch:Partial<TaxPayment>){setState(prev=>prev?{...prev,payments:prev.payments.map(p=>p.id===id?{...p,...patch}:p)}:prev);setDirty(true);setNotice('')}
  async function saveImport(){
    if(!state||!draft?.payments.length)return
    setBusy('Salvez plățile…');setError('')
    try{
      const fd=new FormData();fd.set('firmaId',firma.id);fd.set('lunaId',lunaId);fd.set('version',String(state.version));fd.set('action','import');fd.set('draft',JSON.stringify(draft));fd.set('text',text);fd.set('confirmedCompany',String(confirmedCompany));fd.set('confirmedPeriod',String(confirmedPeriod));if(file)fd.set('file',file)
      const data=await json(await fetch('/api/impozite/mail',{method:'POST',body:fd}))
      setState(data.state);setDraft(null);setText('');setFile(null);setDirty(false);setNotice('Plățile au fost salvate pentru verificare. Nu s-a inițiat nicio plată.')
    }catch(e){setError(e instanceof Error?e.message:'Salvarea a eșuat')}finally{setBusy('')}
  }
  async function saveChanges(){
    if(!state||!dirty)return
    setBusy('Salvez modificările…');setError('')
    try{
      const data=await json(await fetch('/api/impozite/mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firmaId:firma.id,lunaId,version:state.version,action:'update',payments:state.payments})}))
      setState(data.state);setDirty(false);setNotice('Modificările au fost salvate.')
    }catch(e){setError(e instanceof Error?e.message:'Salvarea a eșuat')}finally{setBusy('')}
  }
  async function copy(value:string){try{await navigator.clipboard.writeText(value);setNotice('Copiat în clipboard.')}catch{setError('Copierea nu este disponibilă în acest browser.')}}
  const sourceUrl=(id:string)=>'/api/impozite/source?firmaId='+encodeURIComponent(firma.id)+'&lunaId='+encodeURIComponent(lunaId)+'&sourceId='+encodeURIComponent(id)
  const paymentSource=(id:string)=>state?.sources.find(s=>s.id===id)
  const companyNeedsConfirmation=!!draft&&!sameTaxCompany(draft.company,firma.nume)
  const periodReasons=draft?taxPeriodReview(draft,luna):[]
  const periodNeedsConfirmation=periodReasons.length>0
  return <section style={{display:'grid',gap:14}} onPaste={paste}>
    <div style={card}>
      <h2 style={{fontSize:17,fontWeight:700,marginBottom:7}}>Importă emailul cu plățile către stat</h2>
      <p style={small}>Lipește textul emailului sau o captură (Cmd/Ctrl+V), ori atașează o imagine. Citirea capturii se face local în browser. Verifică sumele, CUI/CIF și IBAN-urile înainte de a pregăti plățile.</p>
      <textarea aria-label="Textul emailului de la contabilitate" value={text} onChange={e=>{setText(e.target.value);setDraft(null)}} placeholder="Lipește aici emailul primit de la contabilitate…" rows={7} style={{...field,resize:'vertical',marginTop:10}}/>
      <div style={{display:'flex',gap:9,flexWrap:'wrap',alignItems:'center',marginTop:10}}>
        <label style={{...btn,display:'inline-block'}}>Atașează captură PNG/JPG/WebP<input type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(selected)void scan(selected)}}/></label>
        {file&&<span style={small}>Imagine: {file.name}</span>}
        <button style={{...btn,background:'var(--accent)',color:'#fff'}} disabled={!!busy||!text.trim()} onClick={analyze}>Analizează textul</button>
        {busy&&<span role="status" style={small}>{busy}</span>}
      </div>
      {file&&<p style={small}>Captura va fi păstrată ca sursă doar când confirmi importul.</p>}
      {preview&&<details style={{marginTop:10}}><summary style={{...small,cursor:'pointer'}}>Vezi captura pentru verificarea cifrelor</summary><img src={preview} alt={'Captura emailului '+file?.name} style={{maxWidth:'100%',maxHeight:700,objectFit:'contain',marginTop:8}}/></details>}
    </div>
    {error&&<div role="alert" style={{...card,borderColor:'var(--accent-red)',color:'var(--accent-red)',fontSize:13}}>{error} <button style={btn} onClick={()=>void load()}>Reîncarcă plățile</button></div>}
    {notice&&<div role="status" style={{...small,color:'var(--accent-mint)'}}>{notice}</div>}
    {draft&&<div style={{...card,display:'grid',gap:12}}>
      <div><h3 style={{fontSize:16,fontWeight:700}}>Revizuiește plățile detectate</h3><p style={small}>Email: {draft.company||'firma nedetectată'} · Perioada din corp: {draft.period||'neidentificată'} · Perioada din subiect: {draft.subjectPeriod||'neidentificată'} · Luna așteptată: {expectedTaxPeriod(luna)} · {draft.payments.length} plăți · {money(draft.payments.reduce((sum,p)=>sum+(p.amount||0),0))}</p></div>
      {companyNeedsConfirmation&&<label style={{...small,color:'var(--accent-red)'}}><input type="checkbox" checked={confirmedCompany} onChange={e=>setConfirmedCompany(e.target.checked)}/> Firma din email lipsește sau pare diferită. Confirm că acest email aparține firmei {firma.nume}.</label>}
      {periodNeedsConfirmation&&<div style={{...card,padding:12,borderColor:'var(--accent-red)'}}><strong style={{fontSize:13,color:'var(--accent-red)'}}>Verifică perioada înainte de salvare</strong>{periodReasons.map((reason,i)=><p key={i} style={{...small,marginTop:5,color:'var(--accent-red)'}}>{reason}</p>)}<label style={{...small,display:'block',marginTop:9,color:'var(--c-dddddd)'}}><input type="checkbox" checked={confirmedPeriod} onChange={e=>setConfirmedPeriod(e.target.checked)}/> Am verificat emailul și confirm importul în luna de lucru {luna} ({expectedTaxPeriod(luna)}).</label></div>}
      {draft.warnings.map((warning,i)=><p key={i} style={{...small,color:'var(--accent-red)'}}>{warning}</p>)}
      {draft.payments.map((payment,i)=><PaymentEditor key={i} payment={payment} onChange={patch=>changeDraft(i,patch)}/>)}
      <div style={{display:'flex',gap:9,flexWrap:'wrap'}}><button style={btn} onClick={()=>setDraft(prev=>prev?{...prev,payments:[...prev.payments,blank()]}:prev)}>+ Adaugă o plată din email</button><button style={{...btn,background:'var(--accent)',color:'#fff'}} disabled={!!busy||!draft.payments.length||!state||dirty||companyNeedsConfirmation&&!confirmedCompany||periodNeedsConfirmation&&!confirmedPeriod} onClick={()=>void saveImport()}>Salvează plățile revizuite</button></div>
    </div>}
    {state&&state.payments.length>0&&<div style={{...card,display:'grid',gap:14}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}><div><h3 style={{fontSize:16,fontWeight:700}}>Plăți de pregătit din email</h3><p style={small}>{state.payments.length} poziții · {money(state.payments.reduce((sum,p)=>sum+(p.paid?0:p.amount||0),0))} rămas de plătit. Marcajul „Plătit” se face doar după verificarea executării în bancă.</p></div><button style={{...btn,background:dirty?'var(--accent)':'var(--c-161616)',color:dirty?'#fff':'var(--c-999999)'}} disabled={!dirty||!!busy} onClick={()=>void saveChanges()}>Salvează modificările</button></div>
      {state.payments.map(payment=>{const source=paymentSource(payment.sourceId);return <div key={payment.id} style={{display:'grid',gap:5}}><p style={small}>Sursă: {source?.company||firma.nume} · {source?.period||'perioadă neidentificată'} · {source?.filePath?<a href={sourceUrl(source.id)} target="_blank" rel="noreferrer" style={{color:'var(--accent)'}}>{source.name} ↗</a>:source?.name}</p><PaymentEditor payment={payment} saved onChange={patch=>changePayment(payment.id,patch)} onCopy={value=>void copy(value)}/></div>})}
      <details><summary style={{...small,cursor:'pointer'}}>Vezi textul surselor importate</summary>{state.sources.map(source=><div key={source.id} style={{marginTop:12}}><strong style={{fontSize:12}}>{source.name} · {source.period||'perioadă neidentificată'}</strong><pre style={{...small,whiteSpace:'pre-wrap',wordBreak:'break-word',marginTop:5}}>{source.text}</pre></div>)}</details>
    </div>}
  </section>
}

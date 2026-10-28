'use client'
import { useEffect, useState, type ClipboardEvent, type CSSProperties } from 'react'
import { parseTaxEmail, paymentIssues, parseTaxAmount, normalizeIban, validIban, sameTaxCompany, taxPeriodReview, expectedTaxPeriod, type TaxDraft, type TaxMailState, type TaxPayment, type ExtractedPayment } from '@/lib/impozite-mail'

type Totals={count:number;total:number;remaining:number}
type Firma={id:string;nume:string;slug:string}
const card:CSSProperties={background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:22,boxShadow:'0 1px 2px rgba(16,24,40,.04), 0 10px 30px -20px rgba(16,24,40,.18)'}
const field:CSSProperties={background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',fontSize:'var(--fs-md)',color:'var(--text-primary)',width:'100%',minWidth:0,marginTop:5,fontFamily:'inherit',outline:'none'}
const btn:CSSProperties={display:'inline-flex',alignItems:'center',gap:6,background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text-primary)',borderRadius:10,padding:'8px 13px',fontSize:'var(--fs-sm)',fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}
const primary:CSSProperties={...btn,background:'var(--accent-solid)',borderColor:'transparent',color:'var(--accent-contrast,#fff)',boxShadow:'0 1px 2px rgba(16,24,40,.1), 0 6px 16px -8px var(--brand-glow,rgba(0,0,0,.3))'}
const small:CSSProperties={fontSize:'var(--fs-sm)',color:'var(--text-secondary)',lineHeight:1.55}
const eyebrow:CSSProperties={fontSize:'var(--fs-xs)',fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text-muted)'}
const chip=(bg:string,c:string):CSSProperties=>({display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:999,fontSize:'var(--fs-xs)',fontWeight:650,background:bg,color:c,whiteSpace:'nowrap'})
const fields:CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}
const blank=():ExtractedPayment=>({label:'',amount:null,iban:'',fiscalId:'',recipient:'',description:'',due:null})
const ibanGrupat=(iban:string)=>iban.replace(/\s+/g,'').replace(/(.{4})/g,'$1 ').trim()
const culoareTaxa=(label:string)=>{const h=[...label].reduce((a,c)=>a+c.charCodeAt(0),0)%4;return ['var(--accent)','var(--accent-blue,#2563eb)','var(--purple,#7c3aed)','var(--warning,#d97706)'][h]}
function money(amount:number|null){return amount===null?'—':amount.toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2})+' RON'}
async function json(res:Response){const data=await res.json();if(!res.ok)throw new Error(data.error||'Cererea a eșuat');return data}
function PaymentEditor({payment,onChange}:{payment:ExtractedPayment|TaxPayment;onChange:(patch:Partial<ExtractedPayment>)=>void}){
  const issues=paymentIssues(payment)
  return <div style={{...card,padding:18,background:'color-mix(in srgb, var(--surface-sunken) 55%, var(--surface))',boxShadow:'none'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',marginBottom:10}}>
      <strong style={{fontSize:'var(--fs-base)'}}>{payment.label||'Plată de completat'}</strong>
      <span style={issues.length?chip('var(--warning-soft)','var(--warning)'):chip('var(--success-soft)','var(--success)')}>{issues.length?'⚠ De verificat: '+issues.join(', '):'✓ Date complete pentru pregătire'}</span>
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
  </div>
}
export function PaymentSummary({payment,onCopy,onEdit,onPaid,busy,index}:{payment:TaxPayment;onCopy:(value:string,label:string)=>Promise<boolean>;onEdit:()=>void;onPaid:()=>void;busy:boolean;index?:number}){
  const issues=paymentIssues(payment)
  const [copied,setCopied]=useState('')
  const culoare=culoareTaxa(payment.label||'?')
  const copyBtn=(label:string,copyValue:string)=>!!copyValue&&<button type="button" style={{...btn,padding:'4px 10px',borderRadius:8,fontSize:'var(--fs-xs)',color:copied===label?'var(--success)':'var(--text-secondary)',borderColor:copied===label?'color-mix(in srgb, var(--success) 40%, var(--border))':'var(--border)'}} onClick={async()=>{if(await onCopy(copyValue,label))setCopied(label)}} aria-label={'Copiază '+label}>{copied===label?'✓ Copiat':'Copiază'}</button>
  // Un camp al fisei: eticheta mica, valoarea mare si butonul de copiere. Campurile goale nu se afiseaza.
  const item=(label:string,value:string,copyValue=value,opts:{mono?:boolean;title?:string;flex?:string}={})=>!!value&&(
    <div style={{minWidth:0,flex:opts.flex||'1 1 180px',padding:'12px 14px',borderRadius:12,background:'var(--surface)',border:'1px solid var(--border-subtle,var(--border))'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}><span style={eyebrow}>{label}</span>{copyBtn(label,copyValue)}</div>
      <div title={opts.title} style={{marginTop:6,fontSize:'var(--fs-base)',fontWeight:600,color:'var(--text-primary)',overflowWrap:'anywhere',fontFamily:opts.mono?'var(--font-mono,ui-monospace,monospace)':undefined,letterSpacing:opts.mono?'.03em':undefined}}>{value}</div>
    </div>
  )
  return <article style={{...card,padding:0,overflow:'hidden',opacity:payment.paid?.78:1}}>
    <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',padding:'16px 20px',borderBottom:'1px solid var(--border-subtle,var(--border))',background:'color-mix(in srgb, '+culoare+' 5%, var(--surface))'}}>
      <div aria-hidden style={{display:'grid',placeItems:'center',width:42,height:42,borderRadius:13,background:'color-mix(in srgb, '+culoare+' 14%, transparent)',color:culoare,fontWeight:800,fontSize:'var(--fs-lg)'}}>{payment.paid?'✓':index!==undefined?index+1:'•'}</div>
      <div style={{flex:'1 1 220px',minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <strong style={{fontSize:'var(--fs-lg)',letterSpacing:'-.01em'}}>{payment.label||'Plată fără tip'}</strong>
          <span style={payment.paid?chip('var(--success-soft)','var(--success)'):chip('color-mix(in srgb, var(--accent) 10%, transparent)','var(--accent)')}>{payment.paid?'Plătit · confirmat manual':'De plătit'}</span>
          {!!issues.length&&<span style={{...chip('var(--warning-soft)','var(--warning)'),whiteSpace:'normal',lineHeight:1.4}} title={issues.join(', ')}>⚠ De verificat: {issues.join(', ')}</span>}
        </div>
        {payment.due&&<div style={{...small,marginTop:3}}>Scadență {payment.due.split('-').reverse().join('.')}</div>}
      </div>
      <div style={{display:'grid',justifyItems:'end',gap:4}}><div style={{display:'flex',alignItems:'center',gap:8}}><span style={eyebrow}>Sumă</span>{copyBtn('Sumă',payment.amount===null?'':String(payment.amount))}</div><div style={{fontSize:24,fontWeight:750,letterSpacing:'-.02em',fontVariantNumeric:'tabular-nums',color:'var(--text-primary)'}}>{money(payment.amount)}</div></div>
    </div>
    <div style={{padding:'16px 20px',display:'grid',gap:14,background:'color-mix(in srgb, var(--surface-sunken) 40%, var(--surface))'}}>
      <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
        {item('CUI/CIF',payment.fiscalId)}
        {item('IBAN',payment.iban?ibanGrupat(payment.iban):'',payment.iban,{mono:true,title:payment.iban,flex:'2 1 330px'})}
        {item('Beneficiar',payment.recipient)}
        {item('Detalii',payment.description,payment.description,{flex:'1 1 100%'})}
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,flexWrap:'wrap'}}>
        <button type="button" style={btn} disabled={busy} onClick={onEdit}>Editează</button>
        <button type="button" style={payment.paid?btn:primary} disabled={busy} onClick={onPaid}>{payment.paid?'Marchează neplătit':'✓ Marchează plătit după verificarea în bancă'}</button>
      </div>
    </div>
  </article>
}
export default function TaxMailPanel({firma,lunaId,luna,onTotals}:{firma:Firma;lunaId:string;luna:string;onTotals:(totals:Totals)=>void}){
  const [state,setState]=useState<TaxMailState|null>(null)
  const [text,setText]=useState(''),[file,setFile]=useState<File|null>(null),[draft,setDraft]=useState<TaxDraft|null>(null)
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [preview,setPreview]=useState(''),[confirmedCompany,setConfirmedCompany]=useState(false),[confirmedPeriod,setConfirmedPeriod]=useState(false)
  const [editPayment,setEditPayment]=useState<TaxPayment|null>(null)
  async function load(){setError('');try{const data=await json(await fetch('/api/impozite/mail?firmaId='+encodeURIComponent(firma.id)+'&lunaId='+encodeURIComponent(lunaId),{cache:'no-store'}));setState(data.state);setEditPayment(null)}catch(e){setError(e instanceof Error?e.message:'Nu pot încărca plățile')}}
  useEffect(()=>{void load()},[firma.id,lunaId])
  useEffect(()=>{if(!state)return;onTotals({count:state.payments.length,total:state.payments.reduce((sum,p)=>sum+(p.amount||0),0),remaining:state.payments.reduce((sum,p)=>sum+(p.paid?0:p.amount||0),0)})},[state,onTotals])
  useEffect(()=>{if(!file){setPreview('');return}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file])
  useEffect(()=>{if(!editPayment)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault()};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[editPayment])
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
  async function saveImport(){
    if(!draft?.payments.length){setError('Nu există plăți de salvat. Analizează mai întâi emailul.');return}
    if(!state){setError('Datele lunii nu s-au încărcat. Apasă „Reîncarcă plățile” și încearcă din nou.');return}
    if(companyNeedsConfirmation&&!confirmedCompany||periodNeedsConfirmation&&!confirmedPeriod){
      setError('Pentru salvare, bifează confirmarea '+(companyNeedsConfirmation&&!confirmedCompany?'firmei':'')+(companyNeedsConfirmation&&!confirmedCompany&&periodNeedsConfirmation&&!confirmedPeriod?' și a ':'')+(periodNeedsConfirmation&&!confirmedPeriod?'perioadei':'')+' de lângă buton.')
      return
    }
    setBusy('Salvez plățile…');setError('')
    try{
      const fd=new FormData();fd.set('firmaId',firma.id);fd.set('lunaId',lunaId);fd.set('version',String(state.version));fd.set('action','import');fd.set('draft',JSON.stringify(draft));fd.set('text',text);fd.set('confirmedCompany',String(confirmedCompany));fd.set('confirmedPeriod',String(confirmedPeriod));if(file)fd.set('file',file)
      const data=await json(await fetch('/api/impozite/mail',{method:'POST',body:fd}))
      setState(data.state);setDraft(null);setText('');setFile(null);setNotice('Plățile au fost salvate pentru verificare. Nu s-a inițiat nicio plată.')
    }catch(e){setError(e instanceof Error?e.message:'Salvarea a eșuat')}finally{setBusy('')}
  }
  async function savePayment(payment:TaxPayment){
    if(!state)return
    setBusy('Salvez plata…');setError('')
    try{
      const payments=state.payments.map(p=>p.id===payment.id?payment:p)
      const data=await json(await fetch('/api/impozite/mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firmaId:firma.id,lunaId,version:state.version,action:'update',payments})}))
      setState(data.state);setEditPayment(null);setNotice('Plata a fost salvată.')
    }catch(e){setError(e instanceof Error?e.message:'Salvarea a eșuat')}finally{setBusy('')}
  }
  async function copy(value:string,label:string):Promise<boolean>{try{await navigator.clipboard.writeText(value);setNotice(label==='IBAN'&&!validIban(value)?'IBAN copiat. Verifică-l în emailul original înainte de plată.':label+' copiat în clipboard.');return true}catch{setError('Copierea nu este disponibilă în acest browser.');return false}}
  const sourceUrl=(id:string)=>'/api/impozite/source?firmaId='+encodeURIComponent(firma.id)+'&lunaId='+encodeURIComponent(lunaId)+'&sourceId='+encodeURIComponent(id)
  const paymentSource=(id:string)=>state?.sources.find(s=>s.id===id)
  const companyNeedsConfirmation=!!draft&&!sameTaxCompany(draft.company,firma.nume)
  const periodReasons=draft?taxPeriodReview(draft,luna):[]
  const periodNeedsConfirmation=periodReasons.length>0
  return <section style={{display:'grid',gap:14}} onPaste={paste}>
    <div style={card}>
      <div style={eyebrow}>Pasul 1 · import</div><h2 style={{fontSize:'var(--fs-lg)',fontWeight:700,margin:'4px 0 6px',letterSpacing:'-.01em'}}>Importă emailul cu plățile către stat</h2>
      <p style={small}>Lipește textul emailului sau o captură (Cmd/Ctrl+V), ori atașează o imagine. Citirea capturii se face local în browser. Verifică sumele, CUI/CIF și IBAN-urile înainte de a pregăti plățile.</p>
      <textarea aria-label="Textul emailului de la contabilitate" value={text} onChange={e=>{setText(e.target.value);setDraft(null)}} placeholder="Lipește aici emailul primit de la contabilitate…" rows={7} style={{...field,resize:'vertical',marginTop:10}}/>
      <div style={{display:'flex',gap:9,flexWrap:'wrap',alignItems:'center',marginTop:10}}>
        <label style={{...btn,display:'inline-block'}}>Atașează captură PNG/JPG/WebP<input type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(selected)void scan(selected)}}/></label>
        {file&&<span style={small}>Imagine: {file.name}</span>}
        <button style={primary} disabled={!!busy||!text.trim()} onClick={analyze}>Analizează textul</button>
        {busy&&<span role="status" style={small}>{busy}</span>}
      </div>
      {file&&<p style={small}>Captura va fi păstrată ca sursă doar când confirmi importul.</p>}
      {preview&&<details style={{marginTop:10}}><summary style={{...small,cursor:'pointer'}}>Vezi captura pentru verificarea cifrelor</summary><img src={preview} alt={'Captura emailului '+file?.name} style={{maxWidth:'100%',maxHeight:700,objectFit:'contain',marginTop:8}}/></details>}
    </div>
    {error&&!draft&&<div role="alert" style={{...card,borderColor:'var(--danger)',color:'var(--danger)',fontSize:'var(--fs-md)'}}>{error} <button style={btn} onClick={()=>void load()}>Reîncarcă plățile</button></div>}
    {notice&&<div role="status" style={{...chip('var(--success-soft)','var(--success)'),fontSize:'var(--fs-sm)',padding:'8px 14px',justifySelf:'start',whiteSpace:'normal'}}>✓ {notice}</div>}
    {draft&&<div style={{...card,display:'grid',gap:12}}>
      <div><h3 style={{fontSize:'var(--fs-lg)',fontWeight:700}}>Revizuiește plățile detectate</h3><p style={small}>Email: {draft.company||'firma nedetectată'} · Perioada din corp: {draft.period||'neidentificată'} · Perioada din subiect: {draft.subjectPeriod||'neidentificată'} · Luna așteptată: {expectedTaxPeriod(luna)} · {draft.payments.length} plăți · {money(draft.payments.reduce((sum,p)=>sum+(p.amount||0),0))}</p></div>
      {draft.warnings.map((warning,i)=><p key={i} style={{...small,color:'var(--danger)'}}>{warning}</p>)}
      {draft.payments.map((payment,i)=><PaymentEditor key={i} payment={payment} onChange={patch=>changeDraft(i,patch)}/>)}
      {companyNeedsConfirmation&&<label style={{...small,color:'var(--danger)'}}><input type="checkbox" checked={confirmedCompany} onChange={e=>{setConfirmedCompany(e.target.checked);setError('')}}/> Firma din email lipsește sau pare diferită. Confirm că acest email aparține firmei {firma.nume}.</label>}
      {periodNeedsConfirmation&&<div style={{...card,padding:12,borderColor:'var(--danger)'}}><strong style={{fontSize:'var(--fs-md)',color:'var(--danger)'}}>Verifică perioada înainte de salvare</strong>{periodReasons.map((reason,i)=><p key={i} style={{...small,marginTop:5,color:'var(--danger)'}}>{reason}</p>)}<label style={{...small,display:'block',marginTop:9,color:'var(--text-primary)'}}><input type="checkbox" checked={confirmedPeriod} onChange={e=>{setConfirmedPeriod(e.target.checked);setError('')}}/> Am verificat emailul și confirm importul în luna de lucru {luna} ({expectedTaxPeriod(luna)}).</label></div>}
      <div style={{display:'flex',gap:9,flexWrap:'wrap'}}><button style={btn} onClick={()=>setDraft(prev=>prev?{...prev,payments:[...prev.payments,blank()]}:prev)}>+ Adaugă o plată din email</button><button style={primary} disabled={!!busy||!draft.payments.length||!!editPayment} onClick={()=>void saveImport()}>Salvează plățile revizuite</button></div>
      {error&&<p role="alert" style={{...small,color:'var(--danger)'}}>{error}</p>}
    </div>}
    {state&&state.payments.length>0&&(()=>{
      const total=state.payments.reduce((sum,p)=>sum+(p.amount||0),0),ramas=state.payments.reduce((sum,p)=>sum+(p.paid?0:p.amount||0),0),platite=state.payments.filter(p=>p.paid).length
      const surse=[...new Set(state.payments.map(p=>p.sourceId))].map(paymentSource).filter(Boolean) as NonNullable<ReturnType<typeof paymentSource>>[]
      return <div style={{display:'grid',gap:14}}>
        <div style={{...card,padding:0,overflow:'hidden'}}>
          <div style={{padding:'20px 22px',display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:16,flexWrap:'wrap',background:'radial-gradient(120% 160% at 100% 0%, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 55%)'}}>
            <div style={{minWidth:0}}>
              <div style={eyebrow}>Plăți către stat · din email</div>
              <h3 style={{fontSize:'var(--fs-xl,20px)',fontWeight:700,letterSpacing:'-.02em',marginTop:4}}>Plăți salvate din email</h3>
              <p style={{...small,marginTop:4}}>{state.payments.length} poziții · {money(ramas)} rămas de plătit. Fiecare fișă rămâne fixă până alegi „Editează”.</p>
            </div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <div style={{padding:'12px 16px',borderRadius:14,background:'color-mix(in srgb, var(--accent) 8%, var(--surface))',border:'1px solid color-mix(in srgb, var(--accent) 25%, transparent)'}}><div style={eyebrow}>Rămas de plătit</div><div style={{fontSize:22,fontWeight:750,color:'var(--accent)',fontVariantNumeric:'tabular-nums',marginTop:4}}>{money(ramas)}</div></div>
              <div style={{padding:'12px 16px',borderRadius:14,background:'var(--surface)',border:'1px solid var(--border)'}}><div style={eyebrow}>Plătite</div><div style={{fontSize:22,fontWeight:750,fontVariantNumeric:'tabular-nums',marginTop:4}}>{platite}<span style={{fontSize:'var(--fs-md)',color:'var(--text-muted)',fontWeight:500}}> / {state.payments.length}</span></div></div>
              <div style={{padding:'12px 16px',borderRadius:14,background:'var(--surface)',border:'1px solid var(--border)'}}><div style={eyebrow}>Total</div><div style={{fontSize:22,fontWeight:750,fontVariantNumeric:'tabular-nums',marginTop:4}}>{money(total)}</div></div>
            </div>
          </div>
          <div style={{height:4,background:'color-mix(in srgb, var(--border) 60%, transparent)'}}><div style={{height:'100%',width:(state.payments.length?Math.round(platite/state.payments.length*100):0)+'%',background:'var(--success)',transition:'width .3s'}}/></div>
          {surse.length>0&&<div style={{padding:'10px 22px',display:'flex',gap:14,flexWrap:'wrap',...small,borderTop:'1px solid var(--border-subtle,var(--border))'}}>{surse.map(source=><span key={source.id}>Sursă: {source.company||firma.nume} · {source.period||'perioadă neidentificată'} · {source.filePath?<a href={sourceUrl(source.id)} target="_blank" rel="noreferrer" style={{color:'var(--accent)',fontWeight:600}}>{source.name} ↗</a>:source.name}</span>)}</div>}
        </div>
        {state.payments.map((payment,index)=>{const editing=editPayment?.id===payment.id;return <div key={payment.id}>{editing?<div style={{display:'grid',gap:10}}><PaymentEditor payment={editPayment} onChange={patch=>setEditPayment(prev=>prev?{...prev,...patch}:prev)}/><div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button style={btn} disabled={!!busy} onClick={()=>setEditPayment(null)}>Renunță</button><button style={primary} disabled={!!busy} onClick={()=>void savePayment(editPayment)}>Salvează modificările</button></div></div>:<PaymentSummary payment={payment} index={index} busy={!!busy||!!editPayment} onCopy={(value,label)=>copy(value,label)} onEdit={()=>setEditPayment({...payment})} onPaid={()=>void savePayment({...payment,paid:!payment.paid})}/>}</div>})}
        <details style={{...card,padding:'4px 20px'}}><summary style={{...small,cursor:'pointer',padding:'12px 0',fontWeight:600,color:'var(--text-primary)'}}>Vezi textul surselor importate</summary>{state.sources.map(source=><div key={source.id} style={{margin:'4px 0 14px'}}><strong style={{fontSize:'var(--fs-sm)'}}>{source.name} · {source.period||'perioadă neidentificată'}</strong><pre style={{...small,whiteSpace:'pre-wrap',wordBreak:'break-word',marginTop:5,padding:12,borderRadius:10,background:'var(--surface-sunken)'}}>{source.text}</pre></div>)}</details>
      </div>
    })()}
  </section>
}

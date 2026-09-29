import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomUUID } from 'node:crypto'
import { normalizeTaxDraft, normalizeIban, parseTaxAmount, sameTaxCompany, taxPeriodReview, type TaxPayment } from '@/lib/impozite-mail'
import { taxScope, readTaxMail, writeTaxMail, sameTaxOrigin, TaxMailError } from '@/lib/impozite-mail-store'

function failure(error:unknown){
  return NextResponse.json({error:error instanceof Error?error.message:'Eroare la salvarea plăților'},{status:error instanceof TaxMailError?error.status:500})
}
export async function GET(req:NextRequest){
  try{
    const {prefix}=await taxScope(req.nextUrl.searchParams.get('firmaId')||'',req.nextUrl.searchParams.get('lunaId')||'')
    return NextResponse.json({state:await readTaxMail(prefix)},{headers:{'Cache-Control':'no-store'}})
  }catch(error){return failure(error)}
}
export async function POST(req:NextRequest){
  try{
    sameTaxOrigin(req)
    const isForm=req.headers.get('content-type')?.includes('multipart/form-data')
    const input=isForm?await req.formData():await req.json()
    const get=(key:string)=>isForm?(input as FormData).get(key):(input as Record<string,unknown>)[key]
    const firmaId=String(get('firmaId')||''),lunaId=String(get('lunaId')||'')
    const {sb,prefix,firma,luna}=await taxScope(firmaId,lunaId)
    const state=await readTaxMail(prefix)
    const version=Number(get('version'))
    if(!Number.isInteger(version)||version!==state.version)throw new TaxMailError('Plățile au fost modificate între timp. Reîncarcă pagina.',409)
    const action=String(get('action')||'')
    if(action==='import'){
      const draft=normalizeTaxDraft(JSON.parse(String(get('draft')||'{}')))
      if(!draft.payments.length||draft.payments.length>40)throw new TaxMailError('Nu există plăți de importat')
      if(!sameTaxCompany(draft.company,firma.nume)&&get('confirmedCompany')!=='true')throw new TaxMailError('Confirmă firma înainte de import.')
      if(taxPeriodReview(draft,luna.luna).length&&get('confirmedPeriod')!=='true')throw new TaxMailError('Confirmă perioada din email înainte de import.')
      const sourceText=String(get('text')||'').trim()
      const file=isForm&&get('file') instanceof File?get('file') as File:null
      if(sourceText.length>50000||file&&file.size>5*1024*1024)throw new TaxMailError('Sursa este prea mare')
      if(file&&!['image/png','image/jpeg','image/webp'].includes(file.type))throw new TaxMailError('Tip de imagine neacceptat')
      if(!sourceText&&!file)throw new TaxMailError('Sursa emailului lipsește')
      const bytes=file?Buffer.from(await file.arrayBuffer()):null
      const hash=createHash('sha256').update(sourceText).update(bytes||Buffer.alloc(0)).digest('hex')
      if(state.sources.some(s=>s.hash===hash))throw new TaxMailError('Acest email este deja importat pentru luna curentă.',409)
      const id=randomUUID(),path=file?prefix+'/sources/'+id+'/'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100):null
      if(path&&bytes){const {error}=await sb.storage.from('documente').upload(path,bytes,{contentType:file!.type,upsert:false});if(error)throw new TaxMailError('Nu pot salva captura: '+error.message,503)}
      const source={id,name:file?.name||'Text lipit din email',kind:file?'image' as const:'text' as const,text:sourceText,filePath:path,hash,company:draft.company,period:draft.period,createdAt:new Date().toISOString()}
      const payments:TaxPayment[]=draft.payments.map(p=>({...p,id:randomUUID(),sourceId:id,paid:false}))
      try{
        const saved=await writeTaxMail(prefix,{...state,sources:[...state.sources,source],payments:[...state.payments,...payments]},version)
        return NextResponse.json({state:saved})
      }catch(error){if(path)await sb.storage.from('documente').remove([path]);throw error}
    }
    if(action==='update'){
      const changes=get('payments')
      if(!Array.isArray(changes)||changes.length!==state.payments.length)throw new TaxMailError('Lista plăților este incompletă')
      const previous=new Map(state.payments.map(p=>[p.id,p]))
      const updated:TaxPayment[]=[]
      for(const candidate of changes){
        if(!candidate||typeof candidate!=='object')throw new TaxMailError('Plată invalidă')
        const row=candidate as Record<string,unknown>,old=previous.get(String(row.id))
        if(!old)throw new TaxMailError('Plată necunoscută')
        const amount=row.amount===null||row.amount===''?null:parseTaxAmount(row.amount)
        const due=row.due===null||row.due===''?null:String(row.due)
        if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))throw new TaxMailError('Scadență invalidă')
        updated.push({...old,label:String(row.label||'').trim().slice(0,160),amount,iban:normalizeIban(row.iban).slice(0,34),fiscalId:String(row.fiscalId||'').trim().slice(0,32),recipient:String(row.recipient||'').trim().slice(0,160),description:String(row.description||'').trim().slice(0,300),due,paid:row.paid===true})
      }
      if(new Set(updated.map(p=>p.id)).size!==previous.size)throw new TaxMailError('Plăți duplicate')
      const saved=await writeTaxMail(prefix,{...state,payments:updated},version)
      return NextResponse.json({state:saved})
    }
    throw new TaxMailError('Acțiune necunoscută')
  }catch(error){return failure(error)}
}

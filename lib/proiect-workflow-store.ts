import { getServiceSupabase } from '@/lib/supabase/server'
import { emptyWorkflow, type Workflow } from '@/lib/proiect-workflow'

export class WorkflowError extends Error { constructor(message:string, public status=400){super(message)} }
export async function scopeContext(firmaId:string,scope:string) {
 if(!/^[a-f0-9-]{36}$/i.test(firmaId)||! /^(settings|month-[a-f0-9-]{36}|purchase-[a-f0-9-]{36})$/i.test(scope))throw new WorkflowError('Identificator invalid')
 const sb=getServiceSupabase()
 const {data:firma,error}=await sb.from('firme').select('id,slug').eq('id',firmaId).single()
 if(error||firma?.slug!=='proiect-ab-textile')throw new WorkflowError('Proiect inexistent',404)
 let month='',lunaId:string|null=null
 if(scope!=='settings'){
  const purchase=scope.startsWith('purchase-');const id=scope.slice(purchase?9:6)
  const {data,error}=await sb.from(purchase?'proiect_achizitii':'luni_contabile').select(purchase?'id,luna_id':'id,luna').eq('firma_id',firmaId).eq('id',id).single()
  if(error||!data)throw new WorkflowError('Luna / achiziția nu aparține proiectului',404)
  if('luna' in data){month=String(data.luna).slice(0,7);lunaId=id}
  if('luna_id' in data)lunaId=data.luna_id as string|null
 }
 return {sb,month,lunaId,prefix:`${firmaId}/workflow/${scope}`}
}
export async function readWorkflow(prefix:string):Promise<Workflow> {
 const bucket=getServiceSupabase().storage.from('documente')
 const {data,error}=await bucket.list(`${prefix}/revisions`,{limit:1,sortBy:{column:'name',order:'desc'}})
 if(error)throw new WorkflowError('Nu pot citi datele proiectului: '+error.message,503)
 if(!data?.length)return emptyWorkflow()
 const {data:file,error:downloadError}=await bucket.download(`${prefix}/revisions/${data[0].name}`)
 if(downloadError||!file)throw new WorkflowError('Nu pot încărca versiunea salvată',503)
 return JSON.parse(await file.text()) as Workflow
}
// Fiecare versiune are o cheie unică. Upload fără upsert este o verificare atomică:
// două ferestre care salvează aceeași revizie nu își pot suprascrie datele.
export async function writeWorkflow(prefix:string,state:Workflow,version:number) {
 const next={...state,version:version+1,updatedAt:new Date().toISOString()}
 const {error}=await getServiceSupabase().storage.from('documente').upload(`${prefix}/revisions/${String(next.version).padStart(10,'0')}.json`,Buffer.from(JSON.stringify(next)),{contentType:'application/json',upsert:false})
 if(error){if(String(error.statusCode)==='409'||/already exists|duplicate/i.test(error.message))throw new WorkflowError('Datele au fost modificate în altă fereastră. Reîncarcă înainte de salvare.',409);throw new WorkflowError('Salvarea a eșuat: '+error.message,503)}
 return next
}
export function sameOrigin(req:Request) {
 const origin=req.headers.get('origin')
 if(origin&&origin!==new URL(req.url).origin)throw new WorkflowError('Origine nepermisă',403)
}

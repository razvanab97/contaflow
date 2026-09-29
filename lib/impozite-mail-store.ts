import { getServiceSupabase } from '@/lib/supabase/server'
import { emptyTaxMailState, type TaxMailState } from '@/lib/impozite-mail'

export class TaxMailError extends Error { constructor(message:string,public status=400){super(message)} }
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export async function taxScope(firmaId:string,lunaId:string) {
  if(!uuid.test(firmaId)||!uuid.test(lunaId))throw new TaxMailError('Identificator invalid')
  const sb=getServiceSupabase()
  const {data:firma,error:firmaError}=await sb.from('firme').select('id,nume,cui').eq('id',firmaId).single()
  if(firmaError||!firma)throw new TaxMailError('Firma nu există',404)
  const {data:luna,error:lunaError}=await sb.from('luni_contabile').select('id,luna').eq('id',lunaId).eq('firma_id',firmaId).single()
  if(lunaError||!luna)throw new TaxMailError('Luna nu aparține firmei',404)
  return {sb,firma,luna,prefix:firmaId+'/impozite-mail/'+lunaId}
}
export async function readTaxMail(prefix:string):Promise<TaxMailState> {
  const bucket=getServiceSupabase().storage.from('documente')
  const {data,error}=await bucket.list(prefix+'/revisions',{limit:1,sortBy:{column:'name',order:'desc'}})
  if(error)throw new TaxMailError('Nu pot citi plățile: '+error.message,503)
  if(!data?.length)return emptyTaxMailState()
  const {data:file,error:downloadError}=await bucket.download(prefix+'/revisions/'+data[0].name)
  if(downloadError||!file)throw new TaxMailError('Nu pot citi versiunea salvată',503)
  return JSON.parse(await file.text()) as TaxMailState
}
export async function writeTaxMail(prefix:string,state:TaxMailState,version:number):Promise<TaxMailState> {
  const next={...state,version:version+1,updatedAt:new Date().toISOString()}
  const path=prefix+'/revisions/'+String(next.version).padStart(10,'0')+'.json'
  const {error}=await getServiceSupabase().storage.from('documente').upload(path,Buffer.from(JSON.stringify(next)),{contentType:'application/json',upsert:false})
  if(error){
    if(String(error.statusCode)==='409'||/already exists|duplicate/i.test(error.message))throw new TaxMailError('Plățile au fost modificate în altă fereastră. Reîncarcă pagina.',409)
    throw new TaxMailError('Nu am putut salva plățile: '+error.message,503)
  }
  return next
}
export function sameTaxOrigin(req:Request) {
  const origin=req.headers.get('origin')
  if(origin&&origin!==new URL(req.url).origin)throw new TaxMailError('Origine nepermisă',403)
}

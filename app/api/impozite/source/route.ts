import { NextRequest, NextResponse } from 'next/server'
import { taxScope, readTaxMail, TaxMailError } from '@/lib/impozite-mail-store'

export async function GET(req:NextRequest){
  try{
    const {sb,prefix}=await taxScope(req.nextUrl.searchParams.get('firmaId')||'',req.nextUrl.searchParams.get('lunaId')||'')
    const state=await readTaxMail(prefix)
    const source=state.sources.find(s=>s.id===req.nextUrl.searchParams.get('sourceId'))
    if(!source?.filePath)throw new TaxMailError('Captura nu există',404)
    const {data,error}=await sb.storage.from('documente').download(source.filePath)
    if(error||!data)throw new TaxMailError('Captura nu poate fi descărcată',503)
    return new NextResponse(await data.arrayBuffer(),{headers:{'Content-Type':data.type||'application/octet-stream','Content-Disposition':'inline; filename="'+source.name.replace(/["\r\n]/g,'')+'"','Cache-Control':'private, no-store'}})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Eroare'},{status:error instanceof TaxMailError?error.status:500})}
}

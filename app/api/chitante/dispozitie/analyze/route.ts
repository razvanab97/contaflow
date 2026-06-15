import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function safePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback
}

function dispositionPurpose(extracted: { category?:string; supplier?:string; series?:string; invoiceNumber?:string; apartment?:string; invoiceDate?:string }) {
  const category = String(extracted.category || '').toLowerCase()
  const association = String(extracted.supplier || '').replace(/^asocia(?:t|ț)ia\s+/i, '').trim()
  const prefix = category === 'gaz' ? 'Fact. gaz'
    : category === 'curent' ? 'Fact. curent'
    : category === 'asociatie' ? `Asociatia ${association}`.trim()
    : 'Factura'
  const invoice = [extracted.series ? `seria ${extracted.series}` : '', extracted.invoiceNumber ? `nr. ${extracted.invoiceNumber}` : ''].filter(Boolean).join(' ')
  const date = extracted.invoiceDate ? `din ${extracted.invoiceDate}` : ''
  return [prefix, invoice, extracted.apartment ? `ap. ${extracted.apartment}` : '', date].filter(Boolean).join(' - ')
}

export async function POST(req: NextRequest) {
  try {
    if (!req.headers.get('content-type')?.includes('multipart/form-data'))
      return NextResponse.json({ error:'Fișier sau date lipsă' }, { status:400 })
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const firmaId = String(fd.get('firmaId') || '')
    const lunaId = String(fd.get('lunaId') || '')
    const number = String(fd.get('number') || 'draft')
    if (!file || !firmaId || !lunaId || !ALLOWED_TYPES.has(file.type))
      return NextResponse.json({ error:'Fișier sau date lipsă' }, { status:400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    const client = new Anthropic({ apiKey:process.env.ANTHROPIC_API_KEY })
    const source = file.type === 'application/pdf'
      ? { type:'document' as const, source:{ type:'base64' as const, media_type:'application/pdf' as const, data:bytes.toString('base64') } }
      : { type:'image' as const, source:{ type:'base64' as const, media_type:file.type as 'image/jpeg'|'image/png', data:bytes.toString('base64') } }
    const response = await client.messages.create({
      model:'claude-haiku-4-5-20251001',
      max_tokens:500,
      messages:[{ role:'user', content:[
        source,
        { type:'text', text:'Extrage datele facturii pentru o dispozitie de plata. Returneaza doar JSON: {"category":"gaz|curent|asociatie|alta","amount":123.45,"supplier":"numele asociatiei sau furnizorului","series":"seria facturii","invoiceNumber":"numarul facturii","apartment":"numarul apartamentului","invoiceDate":"ZZ.LL.AAAA"}. Nu scrie descrieri lungi.' },
      ] }],
    })
    const raw = response.content.filter(block=>block.type==='text').map(block=>(block as {text:string}).text).join('')
    const match = raw.match(/\{[\s\S]*\}/)
    let extracted:{category?:string;amount?:number;supplier?:string;series?:string;invoiceNumber?:string;apartment?:string;invoiceDate?:string} = {}
    try { extracted = match ? JSON.parse(match[0]) : {} } catch {}
    const purpose = dispositionPurpose(extracted)

    const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
    const fileName = `${safePart(extracted.supplier || 'factura', 'factura')}_${safePart(extracted.invoiceNumber || file.name, 'document')}_${Date.now()}.${extension}`
    const path = `${firmaId}/${lunaId}/dispozitii-plata/atasamente/${safePart(number, 'draft')}/${fileName}`
    const sb = getServiceSupabase()
    const { error:storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType:file.type })
    if (storageError) return NextResponse.json({ error:storageError.message }, { status:500 })
    const { data:document, error } = await sb.from('documente').insert({
      firma_id:firmaId, luna_id:lunaId, modul:'acte_contabile', tip_document:'factura',
      furnizor:`Atașament dispoziție ${number} | ${purpose}`,
      numar_document:String(extracted.invoiceNumber || ''), fisier_path:path, fisier_nume:fileName,
      fisier_tip:file.type, fisier_marime:bytes.length, in_zip:false,
    }).select('id,fisier_nume').single()
    if (error) { await sb.storage.from('documente').remove([path]); return NextResponse.json({ error:error.message }, { status:500 }) }
    return NextResponse.json({ document, purpose, amount:extracted.amount || null })
  } catch (error) {
    return NextResponse.json({ error:String(error) }, { status:500 })
  }
}

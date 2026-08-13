import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function safePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback
}

function dispositionPurpose(extracted: { category?:string; supplier?:string; series?:string; invoiceNumber?:string; apartment?:string; invoiceDate?:string; representingPeriod?:string }) {
  const category = String(extracted.category || '').toLowerCase()
  const association = String(extracted.supplier || '').replace(/^asocia(?:t|ț)ia\s+/i, '').trim()
  const prefix = category === 'gaz' ? 'Fact. gaz'
    : category === 'curent' ? 'Fact. curent'
    : category === 'asociatie' ? `Asociatia ${association}`.trim()
    : 'Factura'
  const invoice = [extracted.series ? `seria ${extracted.series}` : '', extracted.invoiceNumber ? `nr. ${extracted.invoiceNumber}` : ''].filter(Boolean).join(' ')
  const period = extracted.representingPeriod
    ? `luna ${extracted.representingPeriod}`
    : extracted.invoiceDate ? `din ${extracted.invoiceDate}` : ''
  return [prefix, invoice, extracted.apartment ? `ap. ${extracted.apartment}` : '', period].filter(Boolean).join(' - ')
}

// Nume scurt al utilitatii pentru afisare (ex: "URBICA", "E.ON curent", "Gaz") - foloseste furnizorul daca il avem,
// altfel un nume generic dupa categorie.
function dispositionUtility(extracted: { category?:string; supplier?:string }) {
  const category = String(extracted.category || '').toLowerCase()
  const supplier = String(extracted.supplier || '').trim()
  if (supplier) return supplier
  if (category === 'gaz') return 'Gaz'
  if (category === 'curent') return 'Curent'
  if (category === 'asociatie') return 'Asociatie'
  return ''
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
        { type:'text', text:'Extrage datele facturii sau chitantei pentru o dispozitie de plata. Citeste cu atentie textul scris de mana. Returneaza doar JSON: {"category":"gaz|curent|asociatie|alta","amount":123.45,"supplier":"numele asociatiei sau furnizorului","series":"seria documentului","invoiceNumber":"numarul documentului","apartment":"numarul apartamentului","invoiceDate":"ZZ.LL.AAAA","representingPeriod":"copiaza exact textul din campul reprezentand/pentru luna — poate fi o luna (ex: Mai 2026) sau doua luni (ex: Mai si Iunie 2026) — lasa null daca nu exista acest camp"}. Nu scrie descrieri lungi, nu inventa date.' },
      ] }],
    })
    const raw = response.content.filter(block=>block.type==='text').map(block=>(block as {text:string}).text).join('')
    const match = raw.match(/\{[\s\S]*\}/)
    let extracted:{category?:string;amount?:number;supplier?:string;series?:string;invoiceNumber?:string;apartment?:string;invoiceDate?:string;representingPeriod?:string} = {}
    try { extracted = match ? JSON.parse(match[0]) : {} } catch {}
    const purpose = dispositionPurpose(extracted)
    const sb = getServiceSupabase()

    // Verificare duplicat: aceeasi factura (dupa numar) sau aceeasi suma deja atasata la o dispozitie in aceasta luna
    let duplicateWarning: { fisierNume:string; motiv:'numar_factura'|'suma' } | null = null
    if (extracted.invoiceNumber || extracted.amount) {
      const { data: existing } = await sb.from('documente')
        .select('fisier_nume,numar_document,suma')
        .eq('firma_id', firmaId).eq('luna_id', lunaId).eq('tip_document', 'factura')
        .like('fisier_path', '%/dispozitii-plata/atasamente/%')
      const numarMatch = extracted.invoiceNumber
        ? (existing || []).find(e => e.numar_document && String(e.numar_document) === String(extracted.invoiceNumber))
        : undefined
      const sumaMatch = !numarMatch && extracted.amount
        ? (existing || []).find(e => e.suma != null && Math.abs(Number(e.suma) - Number(extracted.amount)) < 0.01)
        : undefined
      const match = numarMatch || sumaMatch
      if (match) duplicateWarning = { fisierNume: match.fisier_nume, motiv: numarMatch ? 'numar_factura' : 'suma' }
    }

    const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
    const fileName = `${safePart(extracted.supplier || 'factura', 'factura')}_${safePart(extracted.invoiceNumber || file.name, 'document')}_${Date.now()}.${extension}`
    const path = `${firmaId}/${lunaId}/dispozitii-plata/atasamente/${safePart(number, 'draft')}/${fileName}`
    const { error:storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType:file.type })
    if (storageError) return NextResponse.json({ error:storageError.message }, { status:500 })
    const utilitate = dispositionUtility(extracted)
    const { data:document, error } = await sb.from('documente').insert({
      firma_id:firmaId, luna_id:lunaId, modul:'acte_contabile', tip_document:'factura',
      furnizor:`Atașament dispoziție ${number} | ${purpose}`,
      numar_document:String(extracted.invoiceNumber || ''), fisier_path:path, fisier_nume:fileName,
      fisier_tip:file.type, fisier_marime:bytes.length, in_zip:false,
      suma: extracted.amount || null, locatie: extracted.apartment || null, utilitate: utilitate || null,
    }).select('id,fisier_nume').single()
    if (error) { await sb.storage.from('documente').remove([path]); return NextResponse.json({ error:error.message }, { status:500 }) }
    return NextResponse.json({ document, purpose, amount:extracted.amount || null, locatie:extracted.apartment || null, utilitate: utilitate || null, duplicateWarning })
  } catch (error) {
    return NextResponse.json({ error:String(error) }, { status:500 })
  }
}

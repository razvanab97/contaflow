import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'
import { getServiceSupabase } from '@/lib/supabase/server'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function safePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback
}

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function money(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function normalizeInvoiceDate(value: unknown) {
  const raw = String(value || '').trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return raw
  const ro = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (!ro) return null
  return `${ro[3]}-${ro[2].padStart(2, '0')}-${ro[1].padStart(2, '0')}`
}

function readStoredHash(value: unknown) {
  return String(value || '').match(/\bHASH:([a-f0-9]{64})\b/i)?.[1]?.toLowerCase() || ''
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

type ExistingInvoice = {
  id:string
  fisier_nume:string
  furnizor:string|null
  numar_document:string|null
  suma:number|null
  locatie:string|null
  utilitate:string|null
  data_document:string|null
  fisier_marime:number|null
  created_at:string|null
}

function duplicateReason(existing: ExistingInvoice, current: {
  hash:string
  size:number
  invoiceNumber?:string
  amount:number|null
  utility:string
  apartment?:string
  invoiceDate:string|null
  period?:string
}) {
  if (current.hash && current.size === Number(existing.fisier_marime) && readStoredHash(existing.furnizor) === current.hash)
    return 'fisier_identic' as const

  const sameInvoiceNumber = current.invoiceNumber && existing.numar_document && normalize(existing.numar_document) === normalize(current.invoiceNumber)
  const sameAmount = current.amount != null && existing.suma != null && Math.abs(Number(existing.suma) - current.amount) < 0.01
  const sameUtility = current.utility && existing.utilitate && normalize(existing.utilitate) === normalize(current.utility)
  const sameApartment = current.apartment && existing.locatie && normalize(existing.locatie) === normalize(current.apartment)
  const sameDate = current.invoiceDate && existing.data_document === current.invoiceDate
  const samePeriod = current.period && normalize(existing.furnizor).includes(normalize(current.period))

  if (sameInvoiceNumber && (sameUtility || sameAmount || sameApartment || sameDate))
    return 'numar_factura' as const
  if (sameAmount && sameUtility && (sameApartment || sameDate || samePeriod))
    return 'detalii_factura' as const
  if (sameAmount && sameApartment && samePeriod)
    return 'suma_apartament_perioada' as const
  return null
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
    const existingAttachmentIds = String(fd.get('existingAttachmentIds') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (!file || !firmaId || !lunaId || !ALLOWED_TYPES.has(file.type))
      return NextResponse.json({ error:'Fișier sau date lipsă' }, { status:400 })

    const bytes = Buffer.from(await file.arrayBuffer())
    const documentHash = createHash('sha256').update(bytes).digest('hex')
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
    const utilitate = dispositionUtility(extracted)
    const invoiceDate = normalizeInvoiceDate(extracted.invoiceDate)

    let duplicateWarning: { fisierNume:string; motiv:'fisier_identic'|'numar_factura'|'detalii_factura'|'suma_apartament_perioada'; createdAt:string|null; existingDocumentId:string } | null = null
    if (documentHash || extracted.invoiceNumber || extracted.amount) {
      const { data: existingRaw } = await sb.from('documente')
        .select('id,fisier_nume,furnizor,numar_document,suma,locatie,utilitate,data_document,fisier_marime,created_at')
        .eq('firma_id', firmaId)
        .eq('tip_document', 'factura')
        .like('fisier_path', '%/dispozitii-plata/atasamente/%')
        .order('created_at', { ascending:false })
        .limit(500)
      // O ciornă de dispoziție părăsită (atașată, dar dispoziția n-a fost niciodată generată/salvată)
      // nu mai trebuie să conteze ca "deja existentă" - altfel orice reîncercare a aceluiași lot de
      // facturi iese mereu ca duplicat fals. Contează doar facturile deja incluse într-o dispoziție
      // salvată ("Atașament DP ...") sau cele atașate chiar acum, în lotul curent, nesalvat încă.
      const existingIds = new Set(existingAttachmentIds)
      const existing = (existingRaw || []).filter(inv => String(inv.furnizor || '').startsWith('Atașament DP ') || existingIds.has(inv.id))
      const current = {
        hash: documentHash,
        size: bytes.length,
        invoiceNumber: extracted.invoiceNumber,
        amount: money(extracted.amount),
        utility: utilitate,
        apartment: extracted.apartment,
        invoiceDate,
        period: extracted.representingPeriod,
      }
      const duplicate = existing.map(invoice => ({
        invoice,
        motiv: duplicateReason(invoice as ExistingInvoice, current),
      })).find(match => match.motiv)
      if (duplicate?.motiv) duplicateWarning = {
        fisierNume: duplicate.invoice.fisier_nume,
        motiv: duplicate.motiv,
        createdAt: duplicate.invoice.created_at || null,
        existingDocumentId: duplicate.invoice.id,
      }
    }

    const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
    const fileName = `${safePart(extracted.supplier || 'factura', 'factura')}_${safePart(extracted.invoiceNumber || file.name, 'document')}_${Date.now()}.${extension}`
    const path = `${firmaId}/${lunaId}/dispozitii-plata/atasamente/${safePart(number, 'draft')}/${fileName}`
    const { error:storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType:file.type })
    if (storageError) return NextResponse.json({ error:storageError.message }, { status:500 })
    const { data:document, error } = await sb.from('documente').insert({
      firma_id:firmaId, luna_id:lunaId, modul:'acte_contabile', tip_document:'factura',
      furnizor:`Atașament dispoziție ${number} | ${purpose} | HASH:${documentHash}`,
      numar_document:String(extracted.invoiceNumber || ''), fisier_path:path, fisier_nume:fileName,
      fisier_tip:file.type, fisier_marime:bytes.length, in_zip:false,
      suma: extracted.amount || null, locatie: extracted.apartment || null, utilitate: utilitate || null, data_document: invoiceDate,
    }).select('id,fisier_nume,furnizor,data_document,created_at,locatie,utilitate,suma').single()
    if (error) { await sb.storage.from('documente').remove([path]); return NextResponse.json({ error:error.message }, { status:500 }) }
    return NextResponse.json({ document, purpose, amount:extracted.amount || null, locatie:extracted.apartment || null, utilitate: utilitate || null, duplicateWarning })
  } catch (error) {
    return NextResponse.json({ error:String(error) }, { status:500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error:'id lipsește' }, { status:400 })
  const sb = getServiceSupabase()
  const { data: document, error } = await sb.from('documente')
    .select('id,fisier_path')
    .eq('id', id)
    .eq('tip_document', 'factura')
    .like('fisier_path', '%/dispozitii-plata/atasamente/%')
    .single()
  if (error || !document) return NextResponse.json({ error:'Factura nu a fost găsită' }, { status:404 })
  const { error: storageError } = await sb.storage.from('documente').remove([document.fisier_path])
  if (storageError) return NextResponse.json({ error: storageError.message }, { status:500 })
  const { error: deleteError } = await sb.from('documente').delete().eq('id', id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status:500 })
  return NextResponse.json({ ok:true })
}

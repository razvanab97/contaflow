import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { getServiceSupabase } from '@/lib/supabase/server'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const ALLOWED_CATEGORIES = new Set(['utilitati', 'chirie', 'altul'])
const ALLOWED_DOCUMENT_TYPES = new Set(['factura', 'chitanta', 'borderou', 'raport_csv', 'contract', 'altul'])
const ALLOWED_SECTIONS = new Set([
  'facturi-chitanta', 'facturi-restante',
  'booking-facturi', 'booking-borderou',
  'airbnb-facturi', 'airbnb-borderou',
  '5stardesk', 'trendyol', 'acte-contabile', 'angajati',
])

// Facturile Booking au constant o ultima pagina cu un singur bloc de text (disclaimer legal),
// fara continut de factura - o eliminam la incarcare, nu doar la export.
async function stripLastPageIfExtra(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const pageCount = pdfDoc.getPageCount()
    if (pageCount <= 1) return null
    pdfDoc.removePage(pageCount - 1)
    return await pdfDoc.save()
  } catch {
    return null
  }
}

function safeFilePart(value: string, fallback: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70) || fallback
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const section = req.nextUrl.searchParams.get('section') || 'facturi-chitanta'
  if (!lunaId) return NextResponse.json({ docs: [] })

  const sb = getServiceSupabase()
  let query = sb
    .from('documente')
    .select('id,fisier_nume,tip_document,furnizor,modul,created_at,platit,data_platii')
    .not('fisier_path', 'like', '%/tx/%')
    .not('fisier_path', 'like', '%/checklist/%')
    .like('fisier_path', `%/${section}/%`)
    .order('created_at', { ascending: true })

  // Facturi restante raman vizibile pe toata firma pana sunt achitate, nu doar in luna in care au fost adaugate
  if (section === 'facturi-restante' && firmaId) {
    query = query.eq('firma_id', firmaId).or(`luna_id.eq.${lunaId},platit.eq.false`)
  } else {
    query = query.eq('luna_id', lunaId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ docs: data || [] })
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File | null
  const firmaId = String(fd.get('firmaId') || '')
  const lunaId = String(fd.get('lunaId') || '')
  const category = String(fd.get('category') || '')
  const documentType = String(fd.get('documentType') || '')
  const supplier = String(fd.get('supplier') || '').trim()
  const section = String(fd.get('section') || 'facturi-chitanta')
  const description = String(fd.get('description') || '').trim()
  const reference = String(fd.get('reference') || '').trim()
  const transactionId = String(fd.get('transactionId') || '').trim()

  const simpleSection = !['facturi-chitanta', 'facturi-restante'].includes(section)
  const effectiveCategory = category || 'altul'
  const effectiveType = documentType || 'altul'
  if (!file || !firmaId || !lunaId || !ALLOWED_SECTIONS.has(section))
    return NextResponse.json({ error: 'Date lipsă sau invalide' }, { status: 400 })
  if (!simpleSection && (!ALLOWED_CATEGORIES.has(effectiveCategory) || !ALLOWED_DOCUMENT_TYPES.has(effectiveType)))
    return NextResponse.json({ error: 'Date lipsă sau invalide' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type))
    return NextResponse.json({ error: 'Sunt acceptate doar fișiere PDF, JPG și PNG' }, { status: 400 })

  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  const details = [supplier, description, reference].filter(Boolean).join(' ')
  const fileName = `${effectiveCategory}_${effectiveType}_${safeFilePart(details, 'fara_detalii')}_${Date.now()}.${extension}`
  const path = `${firmaId}/${lunaId}/${section}/${fileName}`
  const sb = getServiceSupabase()

  let uploadBytes: Uint8Array = new Uint8Array(await file.arrayBuffer())
  if (section === 'booking-facturi' && file.type === 'application/pdf') {
    const stripped = await stripLastPageIfExtra(uploadBytes)
    if (stripped) uploadBytes = stripped
  }

  const { error: storageError } = await sb.storage.from('documente').upload(path, uploadBytes, {
    contentType: file.type,
    upsert: false,
  })
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

  const { data: doc, error } = await sb
    .from('documente')
    .insert({
      firma_id: firmaId,
      luna_id: lunaId,
      tranzactie_id: transactionId || null,
      modul: 'acte_contabile',
      tip_document: documentType,
      furnizor: [supplier, description && `Descriere: ${description}`, reference && `Referinta: ${reference}`, `Categorie: ${category}`].filter(Boolean).join(' | '),
      fisier_path: path,
      fisier_nume: fileName,
      fisier_tip: file.type,
      fisier_marime: uploadBytes.length,
      in_zip: true,
    })
    .select('id,fisier_nume,tip_document,furnizor,modul,created_at')
    .single()

  if (error) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (transactionId) await sb.from('tranzactii').update({ document_id: doc.id, note: null }).eq('id', transactionId)
  return NextResponse.json({ doc })
}

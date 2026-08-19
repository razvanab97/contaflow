import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import Anthropic from '@anthropic-ai/sdk'
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

const ANGAJATI_TYPE_LABELS: Record<string, string> = {
  pontaj: 'Pontaj',
  stat_plata: 'Stat de plată',
  chenzina: 'Chenzină',
  centralizator: 'Centralizator contribuții',
  altul: 'Alt document',
}

type AngajatiExtractie = {
  tipDocument: string
  angajati: { nume: string; salariu: number }[]
  cas: number | null
  cass: number | null
  impozit: number | null
  totalPlata: number | null
}

// Citeste documentul HR cu AI: identifica tipul (pontaj/stat de plata/chenzina/centralizator)
// si extrage salariile pe angajat + totalurile de contributii, ca sa nu mai fie nevoie sa alegi
// manual tipul din dropdown si sa completezi rezumatul de mana.
async function analyzeAngajatiDoc(bytes: Uint8Array, mediaType: string): Promise<AngajatiExtractie | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const source = mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: Buffer.from(bytes).toString('base64') } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png', data: Buffer.from(bytes).toString('base64') } }
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: [
        source,
        { type: 'text', text: 'Acesta e un document de HR/salarizare al unei firme din Romania: poate fi pontaj/foaie de prezenta, stat de plata, chenzina sau centralizator de contributii. Identifica tipul documentului si extrage datele. Raspunde DOAR cu JSON, fara alt text: {"tipDocument":"pontaj|stat_plata|chenzina|centralizator|altul","angajati":[{"nume":"Nume Prenume","salariu":1234.56}],"cas":123.45,"cass":123.45,"impozit":123.45,"totalPlata":1234.56}. "angajati" e lista fiecarui angajat cu salariul net/de plata (la un pontaj de obicei nu apar salarii, atunci las-o []). cas/cass/impozit/totalPlata sunt sumele TOTALE pe tot documentul (nu per persoana) - pune null daca nu apar in document. Citeste cu atentie inclusiv tabele si text scris de mana. Nu inventa date.' },
      ] }],
    })
    const raw = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    const tipDocument = typeof parsed.tipDocument === 'string' && ANGAJATI_TYPE_LABELS[parsed.tipDocument] ? parsed.tipDocument : 'altul'
    return {
      tipDocument,
      angajati: Array.isArray(parsed.angajati)
        ? parsed.angajati.filter((a: unknown): a is { nume: unknown; salariu: unknown } => !!a && typeof a === 'object' && typeof (a as any).nume === 'string')
          .map((a: any) => ({ nume: String(a.nume), salariu: Number(a.salariu) || 0 }))
        : [],
      cas: typeof parsed.cas === 'number' ? parsed.cas : null,
      cass: typeof parsed.cass === 'number' ? parsed.cass : null,
      impozit: typeof parsed.impozit === 'number' ? parsed.impozit : null,
      totalPlata: typeof parsed.totalPlata === 'number' ? parsed.totalPlata : null,
    }
  } catch {
    return null
  }
}

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
  const documentTypeLabel = String(fd.get('documentTypeLabel') || '').trim()
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
  const sb = getServiceSupabase()

  let uploadBytes: Uint8Array = new Uint8Array(await file.arrayBuffer())
  if (section === 'booking-facturi' && file.type === 'application/pdf') {
    const stripped = await stripLastPageIfExtra(uploadBytes)
    if (stripped) uploadBytes = stripped
  }

  // La Documente angajați, AI-ul citește documentul și decide singur ce e (nu mai contează
  // ce alegi tu din dropdown) — folosim tipul + eticheta lui pentru denumire, nu selecția manuală
  let effectiveDocumentType = documentType
  let effectiveDocumentTypeLabel = documentTypeLabel
  let angajatiExtractie: AngajatiExtractie | null = null
  if (section === 'angajati') {
    angajatiExtractie = await analyzeAngajatiDoc(uploadBytes, file.type)
    if (angajatiExtractie) {
      effectiveDocumentType = angajatiExtractie.tipDocument
      effectiveDocumentTypeLabel = ANGAJATI_TYPE_LABELS[angajatiExtractie.tipDocument] || effectiveDocumentTypeLabel
    }
  }

  // Numele fisierului trebuie sa spuna ce e documentul — daca nu s-a completat furnizor/descriere,
  // folosim eticheta tipului de document (ex. "Stat de plata") in loc de un fallback generic
  const details = [effectiveDocumentTypeLabel, supplier, description, reference].filter(Boolean).join(' ')
  const fileName = `${safeFilePart(details, effectiveType)}_${Date.now()}.${extension}`
  const path = `${firmaId}/${lunaId}/${section}/${fileName}`

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
      tip_document: effectiveDocumentType,
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

  if (angajatiExtractie && (angajatiExtractie.angajati.length || angajatiExtractie.cas != null || angajatiExtractie.cass != null || angajatiExtractie.impozit != null || angajatiExtractie.totalPlata != null)) {
    await sb.from('angajati_extractii').insert({
      document_id: doc.id,
      firma_id: firmaId,
      luna_id: lunaId,
      tip_document: angajatiExtractie.tipDocument,
      angajati: angajatiExtractie.angajati,
      cas: angajatiExtractie.cas,
      cass: angajatiExtractie.cass,
      impozit: angajatiExtractie.impozit,
      total_plata: angajatiExtractie.totalPlata,
    })
  }

  return NextResponse.json({ doc })
}

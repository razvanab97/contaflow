import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const ALLOWED_CSV_TYPES = new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', ''])
const ALLOWED_CATEGORIES = new Set(['utilitati', 'chirie', 'altul'])
const ALLOWED_DOCUMENT_TYPES = new Set(['factura', 'chitanta', 'borderou', 'raport_csv', 'contract', 'altul'])
const ALLOWED_SECTIONS = new Set([
  'facturi-chitanta', 'facturi-restante', 'inbox-facturi',
  'booking-facturi', 'booking-borderou', 'booking-auto',
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

type GenericExtractie = { furnizor: string | null; numarDocument: string | null; suma: number | null; dataDocument: string | null; codLocatie: string | null; tipDocumentBooking: 'factura' | 'borderou' | null }
type AirbnbBorderouRow = {
  uniqueKey: string
  codConfirmare: string
  oaspete: string | null
  anunt: string | null
  dataRezervarii: string | null
  dataStart: string | null
  dataSfarsit: string | null
  dataTranzactie: string | null
  moneda: string | null
  suma: number | null
  taxaServicii: number | null
  castiguriBrute: number | null
}

// Citeste orice factura/document (facturi restante, facturi+chitanta, booking, airbnb, trendyol,
// acte contabile) cu AI, ca titlul fisierului sa reflecte continutul real, nu doar tipul ales manual.
async function analyzeGenericDoc(bytes: Uint8Array, mediaType: string): Promise<GenericExtractie | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const source = mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: Buffer.from(bytes).toString('base64') } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png', data: Buffer.from(bytes).toString('base64') } }
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: [
        source,
        { type: 'text', text: 'Extrage datele acestui document (factura, chitanta, borderou sau alt act contabil). Raspunde DOAR cu JSON: {"furnizor":"numele furnizorului/emitentului sau al platformei","numarDocument":"seria si numarul documentului, copiate exact cum apar","suma":123.45,"dataDocument":"AAAA-LL-ZZ","codLocatie":"codul unitatii de cazare, doar daca documentul e de la Booking.com (campul \'Numarul unitatii de cazare\'), altfel null","tipDocumentBooking":"factura (daca documentul e o FACTURA de comision Booking.com, cu \'Suma totala de plata\') sau borderou (daca e un centralizator/sumar de plati cu lista de rezervari), altfel null"}. "suma" e suma totala. "dataDocument" e data emiterii (format ISO). Lasa null campurile pe care nu le gasesti. Nu inventa date.' },
      ] }],
    })
    const raw = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    return {
      furnizor: typeof parsed.furnizor === 'string' ? parsed.furnizor : null,
      numarDocument: typeof parsed.numarDocument === 'string' ? parsed.numarDocument : null,
      suma: typeof parsed.suma === 'number' ? parsed.suma : null,
      dataDocument: typeof parsed.dataDocument === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dataDocument) ? parsed.dataDocument : null,
      codLocatie: typeof parsed.codLocatie === 'string' && parsed.codLocatie.trim() ? parsed.codLocatie.trim() : null,
      tipDocumentBooking: parsed.tipDocumentBooking === 'factura' || parsed.tipDocumentBooking === 'borderou' ? parsed.tipDocumentBooking : null,
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

function isCsvFile(file: File) {
  const name = file.name.toLowerCase()
  return name.endsWith('.csv') || ALLOWED_CSV_TYPES.has(file.type)
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const input = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    const next = input[i + 1]
    if (quoted) {
      if (ch === '"' && next === '"') { cell += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim()))
}

function parseCsvNumber(value?: string | null) {
  const cleaned = String(value || '').trim().replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseAirbnbDate(value?: string | null) {
  const raw = String(value || '').trim()
  const mdY = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdY) return `${mdY[3]}-${mdY[1].padStart(2, '0')}-${mdY[2].padStart(2, '0')}`
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null
}

function parseAirbnbBorderouCsv(text: string): AirbnbBorderouRow[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.trim().toLowerCase())
  const idx = (name: string) => headers.indexOf(name.toLowerCase())
  const at = (row: string[], name: string) => {
    const i = idx(name)
    return i >= 0 ? String(row[i] || '').trim() : ''
  }

  return rows.slice(1)
    .filter(row => at(row, 'Tip').toLowerCase() === 'rezervare')
    .map(row => {
      const codConfirmare = at(row, 'Cod de confirmare')
      const dataTranzactie = parseAirbnbDate(at(row, 'Data'))
      const suma = parseCsvNumber(at(row, 'Suma'))
      return {
        uniqueKey: [codConfirmare, dataTranzactie || '', suma ?? ''].join('|'),
        codConfirmare,
        oaspete: at(row, 'Oaspete') || null,
        anunt: at(row, 'Anunț') || null,
        dataRezervarii: parseAirbnbDate(at(row, 'Data rezervării')),
        dataStart: parseAirbnbDate(at(row, 'Data de început')),
        dataSfarsit: parseAirbnbDate(at(row, 'Data de sfârșit')),
        dataTranzactie,
        moneda: at(row, 'Moneda') || null,
        suma,
        taxaServicii: parseCsvNumber(at(row, 'Taxa de servicii')),
        castiguriBrute: parseCsvNumber(at(row, 'Câștiguri brute')),
      }
    })
    .filter(row => row.codConfirmare)
}

function normalizedText(...values: Array<string | null | undefined>) {
  return values.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

async function saveAirbnbBorderouRows(sb: ReturnType<typeof getServiceSupabase>, params: {
  firmaId: string
  lunaId: string
  documentId: string
  text: string
}) {
  const rows = parseAirbnbBorderouCsv(params.text)
  if (!rows.length) return 0

  const payload = rows.map(row => ({
    firma_id: params.firmaId,
    luna_id: params.lunaId,
    borderou_document_id: params.documentId,
    unique_key: row.uniqueKey,
    cod_confirmare: row.codConfirmare,
    oaspete: row.oaspete,
    anunt: row.anunt,
    data_rezervarii: row.dataRezervarii,
    data_start: row.dataStart,
    data_sfarsit: row.dataSfarsit,
    data_tranzactie: row.dataTranzactie,
    moneda: row.moneda,
    suma: row.suma,
    taxa_servicii: row.taxaServicii,
    castiguri_brute: row.castiguriBrute,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await sb
    .from('airbnb_facturi_asteptate')
    .upsert(payload, { onConflict: 'firma_id,luna_id,unique_key' })
  if (error) throw error
  return rows.length
}

async function linkAirbnbInvoiceIfPossible(sb: ReturnType<typeof getServiceSupabase>, params: {
  firmaId: string
  lunaId: string
  documentId: string
  fileName: string
  extractie: GenericExtractie | null
}) {
  const { data: expected } = await sb
    .from('airbnb_facturi_asteptate')
    .select('id,cod_confirmare,suma')
    .eq('firma_id', params.firmaId)
    .eq('luna_id', params.lunaId)
    .is('factura_document_id', null)

  if (!expected?.length) return null
  const haystack = normalizedText(params.fileName, params.extractie?.numarDocument, params.extractie?.furnizor)
  const amount = typeof params.extractie?.suma === 'number' ? params.extractie.suma : null

  const match = expected.find(row => {
    const code = normalizedText(row.cod_confirmare)
    if (code && haystack.includes(code)) return true
    const expectedAmount = typeof row.suma === 'number' ? row.suma : Number(row.suma)
    return amount != null && Number.isFinite(expectedAmount) && Math.abs(expectedAmount - amount) < 0.01
  })
  if (!match) return null

  await sb
    .from('airbnb_facturi_asteptate')
    .update({ factura_document_id: params.documentId, status: 'atasata', updated_at: new Date().toISOString() })
    .eq('id', match.id)
  return match.id
}

export async function GET(req: NextRequest) {
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const section = req.nextUrl.searchParams.get('section') || 'facturi-chitanta'
  if (!lunaId) return NextResponse.json({ docs: [] })

  const sb = getServiceSupabase()
  let query = sb
    .from('documente')
    .select('id,fisier_nume,fisier_tip,tip_document,furnizor,modul,numar_document,suma,data_document,created_at,platit,data_platii,cod_unitate_booking')
    .not('fisier_path', 'like', '%/tx/%')
    .not('fisier_path', 'like', '%/checklist/%')
    .order('created_at', { ascending: true })

  // Facturi restante raman vizibile pe toata firma pana sunt achitate, nu doar in luna in care au fost adaugate
  if (section === 'facturi-restante' && firmaId) {
    query = query
      .eq('firma_id', firmaId)
      .or('fisier_path.like.%/facturi-restante/%,fisier_path.like.%/inbox-facturi/%')
      .or(`luna_id.eq.${lunaId},platit.eq.false`)
  } else {
    query = query.like('fisier_path', `%/${section}/%`).eq('luna_id', lunaId)
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
  const isAirbnbCsv = section === 'airbnb-borderou' && isCsvFile(file)
  if (!ALLOWED_TYPES.has(file.type) && !isAirbnbCsv)
    return NextResponse.json({ error: 'Sunt acceptate doar fișiere PDF, JPG, PNG și CSV pentru borderoul Airbnb' }, { status: 400 })

  const extension = isAirbnbCsv ? 'csv' : file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  const sb = getServiceSupabase()

  let uploadBytes: Uint8Array = new Uint8Array(await file.arrayBuffer())

  // La Documente angajați, AI-ul citește documentul și decide singur ce e (nu mai contează
  // ce alegi tu din dropdown) — folosim tipul + eticheta lui pentru denumire, nu selecția manuală
  let effectiveDocumentType = documentType
  let effectiveDocumentTypeLabel = documentTypeLabel
  let angajatiExtractie: AngajatiExtractie | null = null
  let genericExtractie: GenericExtractie | null = null
  if (section === 'angajati') {
    angajatiExtractie = await analyzeAngajatiDoc(uploadBytes, file.type)
    if (angajatiExtractie) {
      effectiveDocumentType = angajatiExtractie.tipDocument
      effectiveDocumentTypeLabel = ANGAJATI_TYPE_LABELS[angajatiExtractie.tipDocument] || effectiveDocumentTypeLabel
    }
  } else if (!isAirbnbCsv) {
    genericExtractie = await analyzeGenericDoc(uploadBytes, file.type)
  }

  // La Booking, un singur dropzone primeste si facturi si borderouri - AI-ul decide unde
  // se duce fiecare fisier, ca sa nu mai fie nevoie sa le adaugi separat.
  let effectiveSection = section
  if (section === 'booking-auto') {
    effectiveSection = genericExtractie?.tipDocumentBooking === 'borderou' ? 'booking-borderou' : 'booking-facturi'
    if (!effectiveDocumentType) effectiveDocumentType = genericExtractie?.tipDocumentBooking || 'factura'
  }

  if (effectiveSection === 'booking-facturi' && file.type === 'application/pdf') {
    const stripped = await stripLastPageIfExtra(uploadBytes)
    if (stripped) uploadBytes = stripped
  }

  // Numele fisierului trebuie sa spuna ce e documentul — preferam ce a citit AI-ul (furnizor + numar
  // document), completat cu ce ai scris tu manual; daca AI-ul n-a gasit nimic, ramane eticheta tipului
  const effectiveSupplier = supplier || genericExtractie?.furnizor || ''
  const details = [effectiveDocumentTypeLabel, genericExtractie?.furnizor, genericExtractie?.numarDocument, supplier, description, reference].filter(Boolean).join(' ')
  const fileName = `${safeFilePart(details, effectiveType)}_${Date.now()}.${extension}`
  const path = `${firmaId}/${lunaId}/${effectiveSection}/${fileName}`

  const { error: storageError } = await sb.storage.from('documente').upload(path, uploadBytes, {
    contentType: isAirbnbCsv ? 'text/csv' : file.type,
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
      furnizor: [effectiveSupplier, description && `Descriere: ${description}`, reference && `Referinta: ${reference}`, `Categorie: ${category}`].filter(Boolean).join(' | '),
      numar_document: reference || genericExtractie?.numarDocument || null,
      suma: genericExtractie?.suma ?? null,
      data_document: genericExtractie?.dataDocument || null,
      cod_unitate_booking: genericExtractie?.codLocatie || null,
      fisier_path: path,
      fisier_nume: fileName,
      fisier_tip: isAirbnbCsv ? 'text/csv' : file.type,
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

  let airbnbRows = 0
  if (isAirbnbCsv) {
    try {
      airbnbRows = await saveAirbnbBorderouRows(sb, {
        firmaId,
        lunaId,
        documentId: doc.id,
        text: new TextDecoder('utf-8').decode(uploadBytes),
      })
    } catch (csvError) {
      await sb.from('documente').delete().eq('id', doc.id)
      await sb.storage.from('documente').remove([path])
      return NextResponse.json({ error: `CSV Airbnb invalid sau tabela lipsește: ${String((csvError as Error)?.message || csvError)}` }, { status: 500 })
    }
  }

  let airbnbLinkedId: string | null = null
  if (section === 'airbnb-facturi') {
    airbnbLinkedId = await linkAirbnbInvoiceIfPossible(sb, {
      firmaId,
      lunaId,
      documentId: doc.id,
      fileName,
      extractie: genericExtractie,
    })
  }

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

  return NextResponse.json({ doc, airbnbRows, airbnbLinkedId })
}

import { isIP } from 'node:net'
import dns from 'node:dns/promises'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'
import { syncComandaNote } from '@/lib/comandaNote'

const ACCOUNTING_SECTIONS = new Set([
  'facturi-chitanta', 'facturi-restante', 'inbox-facturi',
  'booking-facturi', 'booking-borderou', 'booking-auto',
  'airbnb-facturi', 'airbnb-borderou',
  '5stardesk', 'trendyol', 'acte-contabile', 'angajati',
])

function safePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback
}

function isPrivateIp(ip: string, version: 4 | 6) {
  if (version === 4) {
    return /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  }
  return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')
}

function isPrivateSource(source: URL) {
  const hostname = source.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.local')) return true
  const v = isIP(hostname)
  return v === 4 || v === 6 ? isPrivateIp(hostname, v) : false
}

// Un hostname public poate rezolva totusi catre o adresa privata/interna (DNS rebinding) - fara
// aceasta verificare, isPrivateSource de mai sus (care testeaza doar IP-uri literale) ar lasa sa
// treaca orice domeniu public care se rezolva la 127.0.0.1/169.254.169.254/etc.
async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return false // deja verificat de isPrivateSource
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true })
    return records.some(r => isPrivateIp(r.address, r.family as 4 | 6))
  } catch {
    return false // lookup-ul esuat - fetch-ul urmator va da eroare oricum, nu blocam aici
  }
}

async function assertSafeUrl(source: URL) {
  if (source.protocol !== 'https:' || isPrivateSource(source)) return false
  return !(await resolvesToPrivateAddress(source.hostname))
}

// fetch({redirect:'follow'}) urmeaza redirect-uri HTTP fara sa re-valideze destinatia finala -
// un server extern controlat de atacator poate raspunde initial cu un 30x catre o resursa interna
// (SSRF prin redirect). Urmarim redirect-urile manual, revalidand fiecare hop cu assertSafeUrl().
async function fetchPdfFollowingSafeRedirects(initial: URL, maxHops = 5): Promise<Response> {
  let current = initial
  for (let hop = 0; hop <= maxHops; hop++) {
    if (!(await assertSafeUrl(current))) throw new Error('unsafe-url')
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
      headers: downloadHeaders(current),
    })
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
    if (!location) return response
    current = new URL(location, current)
  }
  throw new Error('too-many-redirects')
}

function downloadHeaders(source: URL) {
  const headers: Record<string, string> = {
    'Accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
    'Referer': `${source.origin}/`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36',
  }
  if (source.hostname.endsWith('booking.com')) {
    const session = source.searchParams.get('ses')
    const cookies = [process.env.BOOKING_COOKIE || '', session ? `ses=${session}` : ''].filter(Boolean)
    if (cookies.length) headers.Cookie = cookies.join('; ')
  }
  return headers
}

function sameDocNumber(a?: string | null, b?: string | null) {
  const ca = String(a || '').toLowerCase().replace(/\s+/g, '')
  const cb = String(b || '').toLowerCase().replace(/\s+/g, '')
  return !!ca && !!cb && ca === cb
}

function supplierMatch(a?: string | null, b?: string | null) {
  const ca = String(a || '').split('|')[0]?.toLowerCase().trim() || ''
  const cb = String(b || '').toLowerCase().trim()
  return ca.length >= 4 && cb.length >= 4 && (ca.includes(cb) || cb.includes(ca))
}

type GenericExtractie = { furnizor: string | null; numarDocument: string | null; suma: number | null; dataDocument: string | null; codLocatie: string | null; tipDocumentBooking: 'factura' | 'borderou' | null }

async function analyzeGenericPdf(bytes: Buffer): Promise<GenericExtractie | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } },
        { type: 'text', text: 'Extrage datele acestei facturi/document PDF. Raspunde DOAR cu JSON: {"furnizor":"numele furnizorului/emitentului","numarDocument":"seria si numarul documentului sau codul rezervarii, copiate exact cum apar","suma":123.45,"dataDocument":"AAAA-LL-ZZ","codLocatie":"codul unitatii de cazare, doar daca documentul e de la Booking.com (campul \'Numarul unitatii de cazare\'), altfel null","tipDocumentBooking":"factura (daca documentul e o FACTURA de comision Booking.com, cu \'Suma totala de plata\') sau borderou (daca e un centralizator/sumar de plati cu lista de rezervari), altfel null"}. Pentru facturi Airbnb, copiaza si codul rezervarii daca apare. Lasa null campurile pe care nu le gasesti. Nu inventa date.' },
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

function normalizedText(...values: Array<string | null | undefined>) {
  return values.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

async function linkAirbnbInvoiceIfPossible(sb: ReturnType<typeof getServiceSupabase>, params: {
  firmaId: string
  lunaId: string
  documentId: string
  fileName: string
  sourceUrl: string
  extractie: GenericExtractie | null
}) {
  const { data: expected } = await sb
    .from('airbnb_facturi_asteptate')
    .select('id,cod_confirmare,suma')
    .eq('firma_id', params.firmaId)
    .eq('luna_id', params.lunaId)
    .is('factura_document_id', null)

  if (!expected?.length) return null
  const haystack = normalizedText(params.fileName, params.sourceUrl, params.extractie?.numarDocument, params.extractie?.furnizor)
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

async function markMatchingRestantePaid(sb: ReturnType<typeof getServiceSupabase>, firmaId: string, transaction: { data_tranzactie:string; descriere_curatata:string|null; descriere:string|null; suma:number }, supplier?: string, reference?: string) {
  const { data: rest } = await sb
    .from('documente')
    .select('id,numar_document,furnizor,suma')
    .eq('firma_id', firmaId)
    .eq('platit', false)
    .or('fisier_path.like.%/facturi-restante/%,fisier_path.like.%/inbox-facturi/%')
  const txSuma = Math.abs(Number(transaction.suma))
  const ids = (rest || [])
    .filter(doc => sameDocNumber(doc.numar_document, reference) || (
      supplierMatch(doc.furnizor, supplier || transaction.descriere_curatata || transaction.descriere) &&
      doc.suma != null &&
      Math.abs(Math.abs(Number(doc.suma)) - txSuma) <= 0.01
    ))
    .map(doc => doc.id)
  if (ids.length) {
    await sb.from('documente').update({ platit:true, data_platii:transaction.data_tranzactie }).in('id', ids)
  }
}

export async function POST(req: NextRequest) {
  const {
    url, firmaId, lunaId, section, supplier, description, reference, transactionId,
    itemId, documentType = 'factura', mode = 'replace', suma: sumaInput,
  } = await req.json()
  const sumaFactura = sumaInput !== undefined && sumaInput !== null && !Number.isNaN(Number(sumaInput)) ? Number(sumaInput) : null
  const isAccountingSection = ACCOUNTING_SECTIONS.has(section)
  if (!url || !firmaId || !lunaId || (!isAccountingSection && !itemId && !transactionId))
    return NextResponse.json({ error: 'Date lipsă sau destinație invalidă' }, { status: 400 })

  let source: URL
  try { source = new URL(url) } catch { return NextResponse.json({ error: 'Link invalid' }, { status: 400 }) }
  if (!(await assertSafeUrl(source)))
    return NextResponse.json({ error: 'Este acceptat doar un link HTTPS public către un PDF' }, { status: 400 })

  let response: Response
  try {
    response = await fetchPdfFollowingSafeRedirects(source)
  } catch {
    return NextResponse.json({ error: 'Este acceptat doar un link HTTPS public către un PDF' }, { status: 400 })
  }
  if (!response.ok) {
    const bookingLoginRequired = source.hostname.endsWith('booking.com') && response.status === 401
    return NextResponse.json({
      error: bookingLoginRequired
        ? 'Booking blochează cererile venite de pe server (protecție anti-bot legată de sesiunea browserului) — nu poate fi importat automat din link. Descarcă PDF-ul din Booking și adaugă-l manual (fișier sau Cmd+V).'
        : `Platforma sursă a răspuns cu status ${response.status}`,
      bookingLoginRequired,
    }, { status: bookingLoginRequired ? 401 : 502 })
  }
  const contentType = response.headers.get('content-type') || ''
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!contentType.toLowerCase().includes('pdf') && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
    return NextResponse.json({ error: 'Linkul nu a returnat un fișier PDF' }, { status: 422 })

  const sb = getServiceSupabase()
  const shouldAnalyze = isAccountingSection && (section === 'airbnb-facturi' || section === 'booking-auto')
  const genericExtractie = shouldAnalyze ? await analyzeGenericPdf(bytes) : null
  // La Booking, un singur link/dropzone primeste si facturi si borderouri - AI-ul decide unde se duce fiecare.
  const effectiveSection = section === 'booking-auto'
    ? (genericExtractie?.tipDocumentBooking === 'borderou' ? 'booking-borderou' : 'booking-facturi')
    : section
  const effectiveDocumentType = section === 'booking-auto' ? (genericExtractie?.tipDocumentBooking || 'factura') : documentType
  let transaction: { id:string; document_id:string|null; extras_id:string; data_tranzactie:string; descriere_curatata:string|null; descriere:string|null; suma:number } | null = null
  if (transactionId) {
    const result = await sb.from('tranzactii')
      .select('id,document_id,extras_id,data_tranzactie,descriere_curatata,descriere,suma')
      .eq('id', transactionId).eq('firma_id', firmaId).maybeSingle()
    transaction = result.data
    if (!transaction) return NextResponse.json({ error: 'Tranzacția nu a fost găsită pentru firma selectată' }, { status: 404 })
  }

  const sourceName = source.hostname.replace(/^www\./, '')
  const details = [
    supplier || genericExtractie?.furnizor,
    description,
    reference || genericExtractie?.numarDocument || source.pathname.split('/').filter(Boolean).pop(),
    transaction?.descriere_curatata || transaction?.descriere,
  ].filter(Boolean).join(' ')
  const transactionPrefix = transaction ? `${safePart(transaction.data_tranzactie, 'fara_data')}_${safePart(Number(transaction.suma).toFixed(2), 'fara_suma')}_` : ''
  const fileName = `${transactionPrefix}${safePart(details, sourceName)}_${safePart(effectiveDocumentType, 'document')}_${Date.now()}.pdf`
  const destination = itemId ? `checklist/${itemId}` : transactionId ? `tx/${transactionId}` : effectiveSection
  const path = `${firmaId}/${lunaId}/${destination}/${fileName}`
  const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType:'application/pdf' })
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

  const documentValues = {
    firma_id:firmaId,
    luna_id:lunaId,
    checklist_item_id:itemId || null,
    tranzactie_id:transactionId || null,
    ...(transactionId ? { modul:'extras' } : isAccountingSection ? { modul:'acte_contabile' } : {}),
    tip_document:effectiveDocumentType,
    furnizor:[supplier || genericExtractie?.furnizor, description && `Descriere: ${description}`, (reference || genericExtractie?.numarDocument) && `Referinta: ${reference || genericExtractie?.numarDocument}`, `Sursa: ${sourceName}`].filter(Boolean).join(' | '),
    numar_document: reference || genericExtractie?.numarDocument || null,
    // La atasare suplimentara pe o tranzactie (mode=add), fiecare factura poate acoperi doar o
    // parte din suma tranzactiei - folosim suma introdusa manual pentru ea daca exista, altfel
    // suma extrasa de AI din document, si abia apoi (cazul normal, un singur document) suma
    // intregii tranzactii.
    suma: sumaFactura ?? genericExtractie?.suma ?? (transaction ? Math.abs(Number(transaction.suma)) : null),
    data_document: transaction?.data_tranzactie || genericExtractie?.dataDocument || null,
    cod_unitate_booking: genericExtractie?.codLocatie || null,
    fisier_path:path,
    fisier_nume:fileName,
    fisier_tip:'application/pdf',
    fisier_marime:bytes.length,
    in_zip:true,
  }
  // mode='add': tranzactia poate avea mai multe facturi - nu suprascrie documentul existent, adauga unul nou
  const shouldReplace = mode === 'replace' && !!transaction?.document_id
  const oldDocumentId = shouldReplace ? transaction?.document_id : null
  const oldDocument = oldDocumentId
    ? await sb.from('documente').select('fisier_path').eq('id', oldDocumentId).maybeSingle()
    : null
  const query = oldDocumentId
    ? sb.from('documente').update(documentValues).eq('id', oldDocumentId)
    : sb.from('documente').insert(documentValues)
  const { data, error } = await query.select('id,fisier_nume,tip_document,furnizor,modul,created_at').single()
  if (error) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error:error.message }, { status:500 })
  }

  if (transactionId && transaction) {
    if (mode !== 'add' || !transaction.document_id) {
      await sb.from('tranzactii').update({ document_id:data.id, note:null }).eq('id', transactionId)
    }
    const { count } = await sb.from('tranzactii').select('id', { count:'exact', head:true }).eq('extras_id', transaction.extras_id).not('document_id', 'is', null)
    if (count !== null) await sb.from('extrase').update({ nr_documentate:count }).eq('id', transaction.extras_id)
    const oldPath = oldDocument?.data?.fisier_path
    if (oldPath && oldPath !== path) await sb.storage.from('documente').remove([oldPath])
    await markMatchingRestantePaid(sb, firmaId, transaction, supplier, reference)
    await syncComandaNote(sb, transactionId)
  }

  let airbnbLinkedId: string | null = null
  if (section === 'airbnb-facturi') {
    airbnbLinkedId = await linkAirbnbInvoiceIfPossible(sb, {
      firmaId,
      lunaId,
      documentId: data.id,
      fileName,
      sourceUrl: source.toString(),
      extractie: genericExtractie,
    })
  }
  return NextResponse.json({ doc:data, airbnbLinkedId })
}

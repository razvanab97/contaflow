import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { FIRMA_CONFIGS } from '@/lib/firma-config'
import { pdfPageCount, extractPageRange } from '@/lib/pdfBatch'
import { isEonApartment99, isEonInvoice, keepOnlyFirstPage } from '@/lib/eonInvoice'
import { finalizeazaDocument } from '@/lib/denumire-document'
import { diferentaSuma, furnizorInDescriere } from '@/lib/tranzactii-potrivire'
import { cursuriBnrSigur } from '@/lib/curs-bnr'

type SupabaseService = ReturnType<typeof import('@/lib/supabase/server').getServiceSupabase>

type FirmaCandidate = {
  id: string
  slug: string
  nume: string
  cui: string | null
  cuiToate: string[]
  nrRegCom: string | null
  luna_id: string | null
  luna: string | null
}

// CUI-uri suplimentare, valide pentru aceeași firmă, pe lângă cel principal din firme.cui
// (folosit doar la recunoașterea facturilor - firme.cui rămâne cel oficial pentru documente).
// Exportat ca sa fie reutilizat si de alte fluxuri de recunoastere firma dupa CUI (ex. Bonuri).
export const CUI_ALTERNATIVE: Record<string, string[]> = {
  abxhomes: ['51842895'],
}

export type ExtractieInbox = {
  firmaSlug: string | null
  firmaCui: string | null
  incredereFirma: 'sigur' | 'posibil' | 'necunoscut'
  esteFactura: boolean
  furnizor: string | null
  numarDocument: string | null
  suma: number | null
  moneda: string | null
  dataDocument: string | null
  locatie: string | null
  tipDocument: string | null
  motiv: string | null
}

export type InboxImportResult = {
  duplicate: boolean
  skipped?: boolean
  skipReason?: string
  targetFirma: string | null
  source?: string | null
  doc?: {
    id: string
    firma_id?: string
    luna_id?: string
    fisier_nume: string
    tranzactie_id?: string | null
    furnizor?: string | null
    numar_document?: string | null
    suma?: number | null
    data_document?: string | null
    platit?: boolean | null
  }
  extracted?: ExtractieInbox | null
}

function safePart(value: string, fallback: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || fallback
}

function norm(value: string | null | undefined) {
  return String(value || '').replace(/^RO/i, '').replace(/\D/g, '')
}

function monthFromIso(date: string | null | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date).slice(0, 7) : null
}

function normalizeText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Moneda ca cod ISO ("€"/"euro" -> EUR, "lei" -> RON etc.). Un raspuns nerecunoscut devine null,
// nu RON - altfel o factura de 18 EUR s-ar salva tacit ca 18 RON si n-ar mai putea fi potrivita
// cu plata ei (convertita in lei la cursul bancii).
export function normalizeazaMoneda(value: unknown): string | null {
  const v = String(value ?? '').trim().toUpperCase()
  if (!v) return null
  if (v === '€' || v.includes('EUR')) return 'EUR'
  if (v === '$' || v.includes('USD') || v.includes('DOLLAR') || v === 'US$') return 'USD'
  if (v === '£' || v.includes('GBP')) return 'GBP'
  if (v === 'LEI' || v.includes('RON')) return 'RON'
  return /^[A-Z]{3}$/.test(v) ? v : null
}

function normalizeDocumentNo(value: string | null | undefined) {
  return normalizeText(value).replace(/\s+/g, '')
}

function isNonInvoiceName(name: string) {
  const value = normalizeText(name)
  const hasInvoiceWords = /\b(factura|invoice|fiscal|receipt|chitanta|faktura|vat)\b/.test(value)
  const hasAwbWords = /\b(awb|shipping|shipment|delivery note|packing list|courier label|label|sameday|cargus|gls)\b/.test(value)
  const isProforma = /\b(proforma|pro forme|pro-forma)\b/.test(value)
  return (hasAwbWords && !hasInvoiceWords) || isProforma
}

function isMaxyOrVerk(value: string | null | undefined) {
  const text = normalizeText(value)
  return /\b(maxy|verk)\b/.test(text)
}

function startsWithFs(value: string | null | undefined) {
  return /^fs\b/i.test(String(value || '').trim()) || /^fs[_\-\s]*/i.test(String(value || '').trim())
}

function shouldSkipMaxyVerk(extracted: ExtractieInbox | null, originalName: string) {
  const supplier = extracted?.furnizor || originalName
  if (!isMaxyOrVerk(supplier)) return false
  if (startsWithFs(extracted?.numarDocument) || startsWithFs(originalName)) return false
  return true
}

function invoiceFingerprint(firmaId: string, extracted: ExtractieInbox | null) {
  if (!extracted) return null
  const docNo = normalizeDocumentNo(extracted.numarDocument)
  const supplier = normalizeText(extracted.furnizor)
  const amount = extracted.suma == null ? '' : Math.abs(Number(extracted.suma)).toFixed(2)
  const currency = normalizeText(extracted.moneda)
  if (!docNo && (!supplier || !amount)) return null
  return [firmaId, supplier, docNo, extracted.dataDocument || '', amount, currency].join('|')
}

function supplierTokens(value: string | null | undefined) {
  return normalizeText(value)
    .split(/\s+/)
    .filter(token => token.length >= 4 && !['srl', 'spol', 'zoo', 'firma', 'trade', 'group'].includes(token))
}

function scoreTransactionMatch(tx: any, extracted: ExtractieInbox | null) {
  if (!extracted?.suma) return { score: 0, details: '' }
  const amountDiff = Math.abs(Math.abs(Number(tx.suma)) - Math.abs(Number(extracted.suma)))
  if (amountDiff > 0.01) return { score: 0, details: '' }
  const haystack = normalizeText([tx.descriere_curatata, tx.descriere, tx.referinta].filter(Boolean).join(' '))
  const tokens = supplierTokens(extracted.furnizor)
  const supplierHits = tokens.filter(token => haystack.includes(token)).length
  const docNo = normalizeDocumentNo(extracted.numarDocument)
  const docHit = docNo && normalizeDocumentNo([tx.descriere, tx.referinta].filter(Boolean).join(' ')).includes(docNo)
  let score = 65
  if (supplierHits) score += Math.min(25, supplierHits * 12)
  if (docHit) score += 20
  if (extracted.moneda && normalizeText(tx.valuta) === normalizeText(extracted.moneda)) score += 10
  return { score, details: `suma=${Math.abs(Number(extracted.suma)).toFixed(2)}, furnizor=${supplierHits}, numar=${docHit ? 'da' : 'nu'}` }
}

async function findMatchingTransaction(sb: SupabaseService, firmaId: string, extracted: ExtractieInbox | null) {
  if (!extracted?.suma) return null
  const { data } = await sb
    .from('tranzactii')
    .select('id,firma_id,extras_id,data_tranzactie,descriere,descriere_curatata,suma,valuta,referinta,document_id')
    .eq('firma_id', firmaId)
    .is('document_id', null)
    .limit(250)
  const rows = data || []
  let best: any = null
  let bestScore = 0
  let bestDetails = ''
  for (const tx of rows) {
    const { score, details } = scoreTransactionMatch(tx, extracted)
    if (score > bestScore) {
      best = tx
      bestScore = score
      bestDetails = details
    }
  }
  return best && bestScore >= 85 ? { tx: best, score: bestScore, details: bestDetails } : null
}

async function findExistingByOptionalColumn(sb: SupabaseService, column: string, value: string | null) {
  if (!value) return null
  const { data, error } = await sb
    .from('documente')
    .select('id,firma_id,luna_id,fisier_nume,tranzactie_id,furnizor,numar_document,suma,data_document,platit')
    .eq(column, value)
    .limit(1)
  if (error) return null
  return data?.[0] || null
}

async function findExistingByMetadata(sb: SupabaseService, firmaId: string, extracted: ExtractieInbox | null) {
  if (!extracted) return null
  const docNo = normalizeDocumentNo(extracted.numarDocument)
  if (!docNo && extracted.suma == null) return null
  const { data, error } = await sb
    .from('documente')
    .select('id,firma_id,luna_id,fisier_nume,tranzactie_id,furnizor,numar_document,suma,data_document,platit')
    .eq('firma_id', firmaId)
    .limit(500)
  if (error) return null
  const supplier = normalizeText(extracted.furnizor)
  const amount = extracted.suma == null ? null : Math.abs(Number(extracted.suma))
  return (data || []).find(doc => {
    const sameNumber = docNo && normalizeDocumentNo(doc.numar_document) === docNo
    const sameAmount = amount != null && doc.suma != null && Math.abs(Math.abs(Number(doc.suma)) - amount) <= 0.01
    const docSupplier = normalizeText(doc.furnizor)
    const sameSupplier = supplier.length >= 4 && docSupplier.includes(supplier.split(' ')[0] || supplier)
    return sameNumber && (sameAmount || sameSupplier || !amount)
  }) || null
}

function extractJson<T>(value: string): T | null {
  const match = value.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) as T } catch { return null }
}

async function analyzeInvoice(bytes: Uint8Array, mediaType: string, candidates: FirmaCandidate[]): Promise<ExtractieInbox | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const source = mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: Buffer.from(bytes).toString('base64') } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png', data: Buffer.from(bytes).toString('base64') } }

    const firme = candidates.map(f => ({
      slug: f.slug,
      nume: f.nume,
      cui: f.cui,
      cuiValide: f.cuiToate,
      cifPreset: FIRMA_CONFIGS[f.slug]?.legal?.cif || null,
      regCom: f.nrRegCom || FIRMA_CONFIGS[f.slug]?.legal?.nrRegCom || null,
    }))
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages: [{ role: 'user', content: [
        source,
        { type: 'text', text: `Acesta este un document contabil primit in inbox (factura, chitanta, invoice, e-Factura sau document similar). Identifica pentru care dintre firmele noastre este documentul, folosind mai ales CUI/CIF/cod fiscal si apoi numele firmei. O firma poate avea mai multe CUI-uri valide - lista completa e in "cuiValide"; orice CUI din acea lista gasit pe document conteaza ca potrivire sigura pentru firma respectiva. Firme disponibile: ${JSON.stringify(firme)}.
Raspunde DOAR cu JSON:
{"firmaSlug":"slug-ul firmei sau null","firmaCui":"CUI/CIF gasit pe document pentru firma noastra sau null","incredereFirma":"sigur|posibil|necunoscut","esteFactura":true,"furnizor":"emitent/furnizor sau null","numarDocument":"seria si numarul facturii/documentului sau null","suma":123.45,"moneda":"codul ISO al monedei totalului: RON|EUR|USD|GBP|HUF|BGN|PLN sau null","dataDocument":"AAAA-LL-ZZ sau null","locatie":"apartamentul/adresa/locul de consum daca apare (ex: Ap. 99), altfel null","tipDocument":"factura|chitanta|invoice|altul","motiv":"pe scurt de ce ai ales firma"}.
Moneda este cea in care e exprimat totalul de plata pe document, NU moneda tarii firmei noastre: simbolul € sau "EUR"/"euro" = EUR, $ sau "USD" = USD, £ = GBP, "lei"/"RON" = RON. Nu converti suma - pastreaz-o exact cum apare, in moneda documentului.
Nu inventa valori. Daca documentul contine mai multe firme, firma noastra este beneficiarul/cumparatorul, nu furnizorul.
Accepta furnizori externi/straini (de exemplu ISO/Maxy/Verk/Jumbo/Anthropic/OpenAI), dar numai daca documentul indica una dintre firmele noastre ca beneficiar/cumparator, prin CUI/CIF, nume firma sau adresa. Daca documentul pare personal sau pentru alta entitate, seteaza firmaSlug si firmaCui null, incredereFirma necunoscut.
Pentru Maxy si Verk accepta doar facturi reale cu numar/serie care incepe cu "FS"; proformele sau documentele cu alt prefix nu sunt utile si trebuie marcate cu "esteFactura":false.
Nu importa AWB-uri, etichete de transport, packing list, shipping documents sau delivery notes FARA preturi: pentru acestea seteaza "esteFactura":false si "tipDocument":"altul", chiar daca apar sume sau furnizori.
EXCEPTIE: "Aviz de insotire a marfii" cu produse, preturi, TVA si total (ex. eMAG / Dante International pentru o comanda platita) ESTE document contabil util - seteaza "esteFactura":true, "tipDocument":"factura", suma = totalul de plata (valoare + TVA), numarDocument = numarul avizului.` },
      ] }],
    })
    const raw = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const parsed = extractJson<Partial<ExtractieInbox>>(raw)
    if (!parsed) return null
    const trust = ['sigur', 'posibil', 'necunoscut'].includes(String(parsed.incredereFirma)) ? parsed.incredereFirma as ExtractieInbox['incredereFirma'] : 'necunoscut'
    return {
      firmaSlug: typeof parsed.firmaSlug === 'string' ? parsed.firmaSlug : null,
      firmaCui: typeof parsed.firmaCui === 'string' ? parsed.firmaCui : null,
      incredereFirma: trust,
      esteFactura: parsed.esteFactura !== false && !['awb', 'shipping', 'shipment', 'packing_list', 'delivery_note'].includes(String(parsed.tipDocument || '').toLowerCase()),
      furnizor: typeof parsed.furnizor === 'string' ? parsed.furnizor : null,
      numarDocument: typeof parsed.numarDocument === 'string' ? parsed.numarDocument : null,
      suma: typeof parsed.suma === 'number' ? parsed.suma : null,
      moneda: normalizeazaMoneda(parsed.moneda),
      dataDocument: typeof parsed.dataDocument === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dataDocument) ? parsed.dataDocument : null,
      locatie: typeof parsed.locatie === 'string' ? parsed.locatie : null,
      tipDocument: typeof parsed.tipDocument === 'string' ? parsed.tipDocument : 'factura',
      motiv: typeof parsed.motiv === 'string' ? parsed.motiv : null,
    }
  } catch {
    return null
  }
}

export async function ensureLocalUploadSource(sb: SupabaseService, firmaId: string) {
  const { data: existing } = await sb
    .from('inbox_surse_email')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('provider', 'local_upload')
    .limit(1)
  if (existing?.[0]?.id) return existing[0].id as string
  const { data: created, error } = await sb
    .from('inbox_surse_email')
    .insert({ firma_id: firmaId, provider: 'local_upload', eticheta: 'Fișiere locale', status: 'activ' })
    .select('id')
    .single()
  if (error || !created) throw new Error(error?.message || 'Sursa locală nu a putut fi creată')
  return created.id as string
}

export async function importInboxDocument({
  sb,
  bytes,
  mediaType,
  originalName,
  firmaId,
  lunaId,
  luna,
  sourceLabel,
  requireDetectedFirm = false,
  extractie,
  tranzactie,
  fortat = false,
}: {
  sb: SupabaseService
  bytes: Uint8Array
  mediaType: string
  originalName: string
  firmaId: string
  lunaId: string
  luna: string
  sourceLabel?: string | null
  requireDetectedFirm?: boolean
  // Extragerea AI deja facuta pentru acest fisier (evita un al doilea apel AI la reincercare).
  extractie?: ExtractieInbox | null
  // Plata bancara deja identificata pentru document (vezi firmaDupaPlata) - se leaga direct de ea
  // cand potrivirea automata la ban nu o gaseste (ex. 72.22 pe factura, 72.17 platit).
  tranzactie?: { id: string; extras_id: string | null; data_tranzactie: string } | null
  // Atribuire manuala: utilizatorul a decis ca documentul trebuie importat - nu-l mai respingem ca
  // "nu e factura" (ex. aviz de insotire a marfii eMAG, document fara serie FS).
  fortat?: boolean
}): Promise<InboxImportResult> {
  if (!fortat && isNonInvoiceName(originalName)) {
    return {
      duplicate: false,
      skipped: true,
      skipReason: 'Document AWB/transport, nu factură',
      targetFirma: null,
      source: sourceLabel || null,
      extracted: null,
    }
  }
  const [{ data: firme }, { data: luni }] = await Promise.all([
    sb.from('firme').select('id,slug,nume,cui,nr_reg_com').eq('activa', true),
    sb.from('luni_contabile').select('id,firma_id,luna'),
  ])
  const firmaRows = firme || []
  const luniRows = luni || []
  const currentFirma = firmaRows.find(f => f.id === firmaId)
  const candidates: FirmaCandidate[] = firmaRows
    .filter(f => f.slug !== 'proiect-ab-textile')
    .map(f => {
      const cuiPrincipal = f.cui || FIRMA_CONFIGS[f.slug]?.legal?.cif || null
      return {
        id: f.id,
        slug: f.slug,
        nume: f.nume,
        cui: cuiPrincipal,
        cuiToate: [cuiPrincipal, ...(CUI_ALTERNATIVE[f.slug] || [])].filter((v): v is string => !!v),
        nrRegCom: f.nr_reg_com || FIRMA_CONFIGS[f.slug]?.legal?.nrRegCom || null,
        luna_id: luniRows.find(l => l.firma_id === f.id && l.luna?.startsWith(luna))?.id || null,
        luna: luniRows.find(l => l.firma_id === f.id && l.luna?.startsWith(luna))?.luna || null,
      }
    })

  // Acelasi fisier deja importat (hash identic) -> duplicat, fara sa mai platim un apel AI.
  {
    const hashInitial = crypto.createHash('sha256').update(bytes).digest('hex')
    const dejaImportat = await findExistingByOptionalColumn(sb, 'document_hash', hashInitial)
    if (dejaImportat) {
      const firmaDoc = firmaRows.find(f => f.id === dejaImportat.firma_id)
      return { duplicate: true, doc: dejaImportat, extracted: null, targetFirma: firmaDoc?.nume || currentFirma?.nume || null, source: sourceLabel || null }
    }
  }

  let extracted = extractie !== undefined ? extractie : await analyzeInvoice(bytes, mediaType, candidates)
  if (!fortat && extracted && !extracted.esteFactura) {
    return {
      duplicate: false,
      skipped: true,
      skipReason: 'Documentul pare AWB/transport, nu factură',
      targetFirma: null,
      source: sourceLabel || null,
      extracted,
    }
  }
  if (!fortat && shouldSkipMaxyVerk(extracted, originalName)) {
    return {
      duplicate: false,
      skipped: true,
      skipReason: 'Maxy/Verk: se importă doar facturi cu număr FS, nu proforme',
      targetFirma: null,
      source: sourceLabel || null,
      extracted,
    }
  }
  if (mediaType === 'application/pdf' && isEonInvoice(extracted?.furnizor) && !isEonApartment99(extracted?.locatie) && await pdfPageCount(Buffer.from(bytes)) > 1) {
    bytes = await keepOnlyFirstPage(Buffer.from(bytes))
    extracted = await analyzeInvoice(bytes, mediaType, candidates)
  }
  const byCui = candidates.find(f => f.cuiToate.some(c => norm(c) && norm(c) === norm(extracted?.firmaCui)))
  const bySlug = candidates.find(f => f.slug === extracted?.firmaSlug)
  let detected = extracted?.incredereFirma === 'sigur' ? (byCui || bySlug) : byCui || null
  // Firma nu apare pe factura (ex. utilitati emise pe numele chiriasului): o deducem din plata din
  // extras, daca exact o firma are plata catre acel furnizor (vezi firmaDupaPlata). Valabil pentru
  // orice sursa (folder local, Gmail) si orice firma.
  if (requireDetectedFirm && !detected && extracted?.esteFactura) {
    const plata = await firmaDupaPlata(sb, extracted)
    const firmaPlata = plata ? candidates.find(f => f.id === plata.firmaId) : null
    if (plata && firmaPlata) {
      detected = firmaPlata
      tranzactie = tranzactie || plata.tranzactie
      sourceLabel = `${sourceLabel || 'Inbox'} · firmă dedusă din plata din extras`
    }
  }
  if (requireDetectedFirm && !detected) {
    return {
      duplicate: false,
      skipped: true,
      skipReason: 'Firma nu a fost identificată sigur ca beneficiar/cumpărător',
      targetFirma: null,
      source: sourceLabel || null,
      extracted,
    }
  }
  const target = detected || candidates.find(f => f.id === firmaId) || candidates[0]
  const hash = crypto.createHash('sha256').update(bytes).digest('hex')
  const fingerprint = invoiceFingerprint(target?.id || firmaId, extracted)
  const existingByHash = await findExistingByOptionalColumn(sb, 'document_hash', hash)
  if (existingByHash) {
    return { duplicate: true, doc: existingByHash, extracted, targetFirma: target?.nume || currentFirma?.nume || null, source: sourceLabel || null }
  }
  const existingByFingerprint = await findExistingByOptionalColumn(sb, 'factura_fingerprint', fingerprint)
  if (existingByFingerprint) {
    return { duplicate: true, doc: existingByFingerprint, extracted, targetFirma: target?.nume || currentFirma?.nume || null, source: sourceLabel || null }
  }
  const existingByMetadata = await findExistingByMetadata(sb, target?.id || firmaId, extracted)
  if (existingByMetadata) {
    return { duplicate: true, doc: existingByMetadata, extracted, targetFirma: target?.nume || currentFirma?.nume || null, source: sourceLabel || null }
  }
  const match = await findMatchingTransaction(sb, target?.id || firmaId, extracted)
    || (tranzactie ? { tx: tranzactie, score: 80, details: 'firma și plata deduse din extrasul bancar (furnizor + sumă + dată)' } : null)
  // Luna de LUCRU in care intra factura = luna urmatoare datei ei: o factura din septembrie tine de
  // contabilitatea lui septembrie, care se lucreaza in octombrie (vezi lib/accounting-period.ts) -
  // acolo e si extrasul din septembrie cu plata ei. Fara data pe document: luna de lucru curenta.
  const lunaFactura = monthFromIso(extracted?.dataDocument)
  const docMonth = lunaFactura
    ? (() => { const [y, m] = lunaFactura.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` })()
    : luna
  // Luna documentului; daca nu e inceputa la firma: luna curenta; altfel cea mai recenta luna
  // inceputa a firmei (pana la luna documentului, apoi oricare) - ca importul sa nu esueze doar
  // pentru ca luna respectiva nu a fost inca initializata.
  const luniFirma = luniRows.filter(l => l.firma_id === (target?.id || firmaId)).sort((a, b) => String(b.luna).localeCompare(String(a.luna)))
  const dateBasedLunaId = luniFirma.find(l => l.luna?.startsWith(docMonth))?.id || target?.luna_id || lunaId
    || luniFirma.find(l => String(l.luna).slice(0, 7) <= docMonth)?.id || luniFirma[0]?.id || ''
  if (!dateBasedLunaId) throw new Error(`Firma ${target?.nume || ''} nu are nicio lună contabilă începută`)
  // Cand documentul se asociaza automat cu o tranzactie existenta, trebuie filat sub luna
  // contabila a extrasului acelei tranzactii (nu dupa data proprie a facturii) - altfel exportul
  // grupat pe tranzactii (ZIP/PDF/"Descarca toate documentele") nu-l mai gaseste, pentru ca acelea
  // filtreaza documentele dupa luna_id = luna de lucru curenta, nu dupa data facturii.
  const matchExtras = match?.tx.extras_id
    ? (await sb.from('extrase').select('luna_id').eq('id', match.tx.extras_id).single()).data
    : null
  const targetLunaId = matchExtras?.luna_id || dateBasedLunaId
  const extension = mediaType === 'application/pdf' ? 'pdf' : mediaType === 'image/png' ? 'png' : 'jpg'
  const status = detected ? extracted?.incredereFirma || 'sigur' : 'verifica_firma'
  const details = [
    extracted?.dataDocument,
    extracted?.furnizor,
    extracted?.numarDocument,
    extracted?.suma != null ? `${extracted.suma}_${extracted.moneda || 'RON'}` : null,
    status,
  ].filter(Boolean).join('_')
  const baseName = originalName.replace(/\.[^.]+$/, '') || 'factura_inbox'
  const fileName = `${safePart(details, baseName)}_${Date.now()}.${extension}`
  const path = `${target?.id || firmaId}/${targetLunaId}/inbox-facturi/${hash.slice(0, 12)}_${fileName}`

  const { data: existingRows } = await sb.from('documente')
    .select('id,firma_id,luna_id,fisier_nume,tranzactie_id,furnizor,numar_document,suma,data_document,platit')
    .like('fisier_path', `%/inbox-facturi/${hash.slice(0, 12)}_%`)
    .limit(1)
  const existing = existingRows?.[0]
  if (existing) {
    return { duplicate: true, doc: existing, extracted, targetFirma: target?.nume || currentFirma?.nume || null, source: sourceLabel || null }
  }

  const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType: mediaType })
  if (storageError) throw new Error(storageError.message)

  const meta = [
    extracted?.furnizor,
    sourceLabel && `Sursa: ${sourceLabel}`,
    `Firma detectată: ${target?.nume || currentFirma?.nume || 'necunoscută'}`,
    `Status firmă: ${status}`,
    extracted?.motiv && `Motiv: ${extracted.motiv}`,
    match && `Asociere automată: tranzacție ${match.tx.data_tranzactie} (${match.score})`,
    `Hash: ${hash.slice(0, 12)}`,
  ].filter(Boolean).join(' | ')
  const insertBody = {
    firma_id: target?.id || firmaId,
    luna_id: targetLunaId,
    tranzactie_id: match?.tx.id || null,
    modul: match ? 'extras' : 'inbox_facturi',
    tip_document: extracted?.tipDocument || 'factura',
    furnizor: meta,
    numar_document: extracted?.numarDocument || null,
    suma: extracted?.suma ?? null,
    valuta: extracted?.moneda || 'RON',
    data_document: extracted?.dataDocument || null,
    fisier_path: path,
    fisier_nume: fileName,
    fisier_tip: mediaType,
    fisier_marime: bytes.length,
    document_hash: hash,
    factura_fingerprint: fingerprint,
    platit: !!match,
    data_platii: match?.tx.data_tranzactie || null,
    asociere_scor: match?.score || null,
    asociere_detalii: match?.details || null,
    in_zip: true,
  }
  let { data: doc, error } = await sb.from('documente').insert(insertBody).select('id,firma_id,luna_id,fisier_nume,tranzactie_id,furnizor,numar_document,suma,data_document,platit').single()

  if (error && /document_hash|factura_fingerprint|asociere_scor|asociere_detalii/.test(error.message || '')) {
    const { document_hash, factura_fingerprint, asociere_scor, asociere_detalii, ...fallbackBody } = insertBody
    const fallback = await sb.from('documente').insert(fallbackBody).select('id,firma_id,luna_id,fisier_nume,tranzactie_id,furnizor,numar_document,suma,data_document,platit').single()
    doc = fallback.data
    error = fallback.error
  }

  if (error || !doc) {
    await sb.storage.from('documente').remove([path])
    throw new Error(error?.message || 'Documentul nu a putut fi salvat')
  }
  if (doc?.tranzactie_id) {
    await sb.from('tranzactii').update({ document_id: doc.id, note: null, status_note: null }).eq('id', doc.tranzactie_id)
  }
  // Nume descriptiv (firma, numar, furnizor, data, suma) - campurile vin deja din extragerea AI de mai sus.
  if (doc?.id) {
    const numeNou = await finalizeazaDocument(sb, doc.id, { extrage: false })
    if (numeNou) doc.fisier_nume = numeNou
  }
  return { duplicate: false, doc, extracted, targetFirma: target?.nume || currentFirma?.nume || null, source: sourceLabel || null }
}

// Factura fara firma noastra pe ea (ex. DIGI/utilitati emise pe numele chiriasului, fara CUI) nu
// poate fi atribuita dupa CUI - dar daca exact una dintre firme are in extras o plata deschisa catre
// acel furnizor, cu aceeasi suma (sau echivalentul BNR, pentru valuta) si la o data apropiata,
// plata arata cine a platit-o. Intoarce firma (si plata, cand e una singura) sau null la orice dubiu.
export async function firmaDupaPlata(sb: SupabaseService, extracted: ExtractieInbox | null | undefined): Promise<{ firmaId: string; tranzactie: { id: string; extras_id: string | null; data_tranzactie: string } | null } | null> {
  if (!extracted?.suma || !extracted.dataDocument || !extracted.furnizor) return null
  const zi = (d: string, plus: number) => new Date(new Date(d + 'T00:00:00Z').getTime() + plus * 86400000).toISOString().slice(0, 10)
  const { data } = await sb.from('tranzactii')
    .select('id,firma_id,extras_id,data_tranzactie,descriere,descriere_curatata,referinta,suma,valuta,tip,document_id,note')
    .is('document_id', null)
    .eq('tip', 'debit')
    .gte('data_tranzactie', zi(extracted.dataDocument, -5))
    .lte('data_tranzactie', zi(extracted.dataDocument, 45))
    .limit(1000)
  const doc = { suma: Math.abs(Number(extracted.suma)), valuta: extracted.moneda || 'RON', data_document: extracted.dataDocument, furnizor: extracted.furnizor }
  const curs = (doc.valuta || 'RON').toUpperCase() !== 'RON' ? await cursuriBnrSigur([doc.data_document]) : null
  const potrivite = (data || []).filter(tx => tx.note !== 'na' && furnizorInDescriere(doc.furnizor, tx) && diferentaSuma(doc, tx, curs))
  const firme = [...new Set(potrivite.map(tx => tx.firma_id))]
  if (firme.length !== 1) return null
  return { firmaId: firme[0], tranzactie: potrivite.length === 1 ? potrivite[0] : null }
}

type SegmentDocument = { pageStart: number; pageEnd: number }

// Peste acest numar de pagini merita verificat daca fisierul e de fapt un pachet cu mai multe
// documente separate (ex. export in bloc ANAF SPV/Oblio, sau cateva luni de facturi de la acelasi
// furnizor trimise intr-un singur PDF, o pagina per factura) - un document normal are o pagina,
// deci sub prag nu cheltuim un apel AI suplimentar degeaba.
const PRAG_PAGINI_VERIFICARE_PACHET = 1

// Verifica daca PDF-ul contine de fapt mai multe documente distincte, unul dupa altul, si daca da
// intoarce paginile fiecaruia. Intoarce null daca e un singur document sau daca verificarea esueaza
// (in acel caz documentul se proceseaza intreg, nesplit, ca sa nu blocam complet sincronizarea).
export async function detecteazaDocumenteMultiple(bytes: Uint8Array): Promise<SegmentDocument[] | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') } },
        { type: 'text', text: `Acest fișier poate conține FIE un singur document contabil (factură/chitanță), posibil pe mai multe pagini, FIE mai multe documente complet separate, unul după altul (de exemplu un export în bloc din ANAF SPV sau Oblio, cu facturi de la furnizori diferiți, de obicei câte una pe pagină).
Analizează fiecare pagină și determină unde începe fiecare document nou - o pagină cu un antet nou de factură/chitanță (furnizor, număr de document, dată proprii) e un document nou, chiar dacă formatul vizual seamănă cu pagina anterioară.
Paginile de detalii/anexe ale aceleiași facturi (ex. "detalii factura" pe fiecare număr de telefon, cu ACELAȘI număr de factură în antet) NU sunt documente noi - fac parte din factura respectivă.
Returnează DOAR JSON, fără alt text: {"documente":[{"pageStart":1,"pageEnd":1,"numarDocument":"seria si numarul sau null"},{"pageStart":2,"pageEnd":2,"numarDocument":"..."}]} - pageStart/pageEnd sunt numere de pagină începând de la 1, inclusiv. Dacă tot fișierul e UN SINGUR document, returnează un singur element care acoperă toate paginile.` },
      ] }],
    })
    const raw = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const parsed = extractJson<{ documente?: (SegmentDocument & { numarDocument?: string | null })[] }>(raw)
    const segmente = (parsed?.documente || [])
      .filter(s => Number.isFinite(s?.pageStart) && Number.isFinite(s?.pageEnd) && s.pageStart >= 1 && s.pageEnd >= s.pageStart)
      .sort((a, b) => a.pageStart - b.pageStart)
    // Regula: paginile consecutive cu ACELASI numar de factura sunt o singura factura (ex. factura
    // Orange de 19 pagini, cu cate o pagina de detalii pe fiecare numar de telefon) - se lipesc la loc.
    const unite: SegmentDocument[] = []
    let ultimNr: string | null = null
    for (const seg of segmente) {
      const nr = normalizeDocumentNo(seg.numarDocument) || null
      const prev = unite[unite.length - 1]
      if (prev && nr && nr === ultimNr) prev.pageEnd = Math.max(prev.pageEnd, seg.pageEnd)
      else unite.push({ pageStart: seg.pageStart, pageEnd: seg.pageEnd })
      ultimNr = nr
    }
    return unite.length ? unite : null
  } catch {
    return null
  }
}

// Ca importInboxDocument, dar verifica intai daca fisierul contine de fapt mai multe documente
// separate (pachet) - daca da, il imparte fizic si proceseaza fiecare bucata independent, cu
// datele ei proprii, in loc sa citeasca doar primul document gasit si sa piarda restul.
export async function importInboxDocumentSplitting(params: Parameters<typeof importInboxDocument>[0]): Promise<InboxImportResult[]> {
  if (params.mediaType === 'application/pdf') {
    try {
      const pageCount = await pdfPageCount(Buffer.from(params.bytes))
      if (pageCount > PRAG_PAGINI_VERIFICARE_PACHET) {
        const segmente = await detecteazaDocumenteMultiple(params.bytes)
        if (segmente && segmente.length > 1) {
          const rezultate: InboxImportResult[] = []
          for (const segment of segmente) {
            const bucataBytes = await extractPageRange(Buffer.from(params.bytes), segment.pageStart, segment.pageEnd)
            const numeBucata = `${params.originalName.replace(/\.[^.]+$/, '')}_p${segment.pageStart}-${segment.pageEnd}.pdf`
            rezultate.push(await importInboxDocument({ ...params, bytes: bucataBytes, originalName: numeBucata }))
          }
          return rezultate
        }
      }
    } catch {
      // detectia/splitarea a esuat - continuam mai jos cu documentul intreg, nesplit.
    }
  }
  return [await importInboxDocument(params)]
}

import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { FIRMA_CONFIGS } from '@/lib/firma-config'

type SupabaseService = ReturnType<typeof import('@/lib/supabase/server').getServiceSupabase>

type FirmaCandidate = {
  id: string
  slug: string
  nume: string
  cui: string | null
  nrRegCom: string | null
  luna_id: string | null
  luna: string | null
}

type ExtractieInbox = {
  firmaSlug: string | null
  firmaCui: string | null
  incredereFirma: 'sigur' | 'posibil' | 'necunoscut'
  furnizor: string | null
  numarDocument: string | null
  suma: number | null
  moneda: string | null
  dataDocument: string | null
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
    furnizor?: string | null
    numar_document?: string | null
    suma?: number | null
    data_document?: string | null
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
      cifPreset: FIRMA_CONFIGS[f.slug]?.legal?.cif || null,
      regCom: f.nrRegCom || FIRMA_CONFIGS[f.slug]?.legal?.nrRegCom || null,
    }))
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages: [{ role: 'user', content: [
        source,
        { type: 'text', text: `Acesta este un document contabil primit in inbox (factura, chitanta, invoice, e-Factura sau document similar). Identifica pentru care dintre firmele noastre este documentul, folosind mai ales CUI/CIF/cod fiscal si apoi numele firmei. Firme disponibile: ${JSON.stringify(firme)}.
Raspunde DOAR cu JSON:
{"firmaSlug":"slug-ul firmei sau null","firmaCui":"CUI/CIF gasit pe document pentru firma noastra sau null","incredereFirma":"sigur|posibil|necunoscut","furnizor":"emitent/furnizor sau null","numarDocument":"seria si numarul facturii/documentului sau null","suma":123.45,"moneda":"RON|EUR|HUF|BGN sau null","dataDocument":"AAAA-LL-ZZ sau null","tipDocument":"factura|chitanta|invoice|altul","motiv":"pe scurt de ce ai ales firma"}.
Nu inventa valori. Daca documentul contine mai multe firme, firma noastra este beneficiarul/cumparatorul, nu furnizorul.
Accepta furnizori externi/straini (de exemplu ISO/Maxy/Verk/Jumbo/Anthropic/OpenAI), dar numai daca documentul indica una dintre firmele noastre ca beneficiar/cumparator, prin CUI/CIF, nume firma sau adresa. Daca documentul pare personal sau pentru alta entitate, seteaza firmaSlug si firmaCui null, incredereFirma necunoscut.` },
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
      furnizor: typeof parsed.furnizor === 'string' ? parsed.furnizor : null,
      numarDocument: typeof parsed.numarDocument === 'string' ? parsed.numarDocument : null,
      suma: typeof parsed.suma === 'number' ? parsed.suma : null,
      moneda: typeof parsed.moneda === 'string' ? parsed.moneda : null,
      dataDocument: typeof parsed.dataDocument === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dataDocument) ? parsed.dataDocument : null,
      tipDocument: typeof parsed.tipDocument === 'string' ? parsed.tipDocument : 'factura',
      motiv: typeof parsed.motiv === 'string' ? parsed.motiv : null,
    }
  } catch {
    return null
  }
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
}): Promise<InboxImportResult> {
  const hash = crypto.createHash('sha256').update(bytes).digest('hex')
  const [{ data: firme }, { data: luni }] = await Promise.all([
    sb.from('firme').select('id,slug,nume,cui,nr_reg_com').eq('activa', true),
    sb.from('luni_contabile').select('id,firma_id,luna'),
  ])
  const firmaRows = firme || []
  const luniRows = luni || []
  const currentFirma = firmaRows.find(f => f.id === firmaId)
  const candidates: FirmaCandidate[] = firmaRows
    .filter(f => f.slug !== 'proiect-ab-textile')
    .map(f => ({
      id: f.id,
      slug: f.slug,
      nume: f.nume,
      cui: f.cui || FIRMA_CONFIGS[f.slug]?.legal?.cif || null,
      nrRegCom: f.nr_reg_com || FIRMA_CONFIGS[f.slug]?.legal?.nrRegCom || null,
      luna_id: luniRows.find(l => l.firma_id === f.id && l.luna?.startsWith(luna))?.id || null,
      luna: luniRows.find(l => l.firma_id === f.id && l.luna?.startsWith(luna))?.luna || null,
    }))

  const extracted = await analyzeInvoice(bytes, mediaType, candidates)
  const byCui = candidates.find(f => norm(f.cui) && norm(f.cui) === norm(extracted?.firmaCui))
  const bySlug = candidates.find(f => f.slug === extracted?.firmaSlug)
  const detected = extracted?.incredereFirma === 'sigur' ? (byCui || bySlug) : byCui || null
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
  const docMonth = monthFromIso(extracted?.dataDocument) || luna
  const targetLunaId = luniRows.find(l => l.firma_id === target?.id && l.luna?.startsWith(docMonth))?.id || target?.luna_id || lunaId
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
    .select('id,firma_id,luna_id,fisier_nume')
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
    `Hash: ${hash.slice(0, 12)}`,
  ].filter(Boolean).join(' | ')
  const { data: doc, error } = await sb.from('documente').insert({
    firma_id: target?.id || firmaId,
    luna_id: targetLunaId,
    modul: 'inbox_facturi',
    tip_document: extracted?.tipDocument || 'factura',
    furnizor: meta,
    numar_document: extracted?.numarDocument || null,
    suma: extracted?.suma ?? null,
    data_document: extracted?.dataDocument || null,
    fisier_path: path,
    fisier_nume: fileName,
    fisier_tip: mediaType,
    fisier_marime: bytes.length,
    in_zip: true,
  }).select('id,firma_id,luna_id,fisier_nume,furnizor,numar_document,suma,data_document').single()

  if (error) {
    await sb.storage.from('documente').remove([path])
    throw new Error(error.message)
  }
  return { duplicate: false, doc, extracted, targetFirma: target?.nume || currentFirma?.nume || null, source: sourceLabel || null }
}

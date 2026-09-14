import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'
import { FIRMA_CONFIGS } from '@/lib/firma-config'

export const maxDuration = 120

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

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
Nu inventa valori. Daca documentul contine mai multe firme, firma noastra este beneficiarul/cumparatorul, nu furnizorul.` },
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

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  const lunaId = req.nextUrl.searchParams.get('lunaId')
  if (!firmaId || !lunaId) return NextResponse.json({ error: 'firmaId/lunaId lipsesc' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('documente')
    .select('id,fisier_nume,fisier_tip,furnizor,numar_document,suma,data_document,created_at')
    .eq('firma_id', firmaId)
    .eq('luna_id', lunaId)
    .like('fisier_path', '%/inbox-facturi/%')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ docs: data || [] })
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const firmaId = String(fd.get('firmaId') || '')
  const lunaId = String(fd.get('lunaId') || '')
  const luna = String(fd.get('luna') || '')
  const files = fd.getAll('file').filter((item): item is File => item instanceof File && item.size > 0)
  if (!firmaId || !lunaId || !files.length) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  if (files.some(file => !ALLOWED_TYPES.has(file.type))) return NextResponse.json({ error: 'Sunt acceptate doar PDF, JPG și PNG' }, { status: 400 })

  const sb = getServiceSupabase()
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

  const imported = []
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    const extracted = await analyzeInvoice(bytes, file.type, candidates)
    const byCui = candidates.find(f => norm(f.cui) && norm(f.cui) === norm(extracted?.firmaCui))
    const bySlug = candidates.find(f => f.slug === extracted?.firmaSlug)
    const detected = extracted?.incredereFirma === 'sigur' ? (byCui || bySlug) : byCui || null
    const target = detected || candidates.find(f => f.id === firmaId) || candidates[0]
    const docMonth = monthFromIso(extracted?.dataDocument) || luna
    const targetLunaId = luniRows.find(l => l.firma_id === target?.id && l.luna?.startsWith(docMonth))?.id || target?.luna_id || lunaId
    const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
    const status = detected ? extracted?.incredereFirma || 'sigur' : 'verifica_firma'
    const details = [
      extracted?.dataDocument,
      extracted?.furnizor,
      extracted?.numarDocument,
      extracted?.suma != null ? `${extracted.suma}_${extracted.moneda || 'RON'}` : null,
      status,
    ].filter(Boolean).join('_')
    const fileName = `${safePart(details, file.name.replace(/\.[^.]+$/, '') || 'factura_inbox')}_${Date.now()}.${extension}`
    const path = `${target?.id || firmaId}/${targetLunaId}/inbox-facturi/${hash.slice(0, 12)}_${fileName}`

    const { data: existingRows } = await sb.from('documente')
      .select('id,firma_id,luna_id,fisier_nume')
      .like('fisier_path', `%/inbox-facturi/${hash.slice(0, 12)}_%`)
      .limit(1)
    const existing = existingRows?.[0]
    if (existing) {
      imported.push({ duplicate: true, doc: existing, extracted, targetFirma: target?.nume || currentFirma?.nume || null })
      continue
    }

    const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType: file.type })
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

    const meta = [
      extracted?.furnizor,
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
      fisier_tip: file.type,
      fisier_marime: bytes.length,
      in_zip: true,
    }).select('id,firma_id,luna_id,fisier_nume,furnizor,numar_document,suma,data_document').single()

    if (error) {
      await sb.storage.from('documente').remove([path])
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    imported.push({ duplicate: false, doc, extracted, targetFirma: target?.nume || currentFirma?.nume || null })
  }

  return NextResponse.json({ imported })
}

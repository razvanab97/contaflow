import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function safeFilePart(value: string, fallback: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || fallback
}

async function analyzeFactura(bytes: Uint8Array, mediaType: string) {
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
        { type: 'text', text: 'Extrage datele acestei facturi. Raspunde DOAR cu JSON: {"furnizor":"numele furnizorului/emitentului","suma":123.45,"dataFactura":"AAAA-LL-ZZ"}. "suma" e suma totala de plata a facturii. "dataFactura" e data emiterii facturii (sau, daca exista, data scadenta/data platii) in format ISO. Lasa null campurile pe care nu le gasesti. Nu inventa date.' },
      ] }],
    })
    const raw = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    return {
      furnizor: typeof parsed.furnizor === 'string' ? parsed.furnizor : null,
      suma: typeof parsed.suma === 'number' ? parsed.suma : null,
      dataFactura: typeof parsed.dataFactura === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dataFactura) ? parsed.dataFactura : null,
    }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId')
  if (!firmaId) return NextResponse.json({ error: 'firmaId lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('facturi_asteptate')
    .select('id,fisier_nume,fisier_tip,furnizor,suma,data_factura,status,tranzactie_id,created_at')
    .eq('firma_id', firmaId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ facturi: data || [] })
}

export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File | null
  const firmaId = String(fd.get('firmaId') || '')
  if (!file || !firmaId) return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Sunt acceptate doar fișiere PDF, JPG și PNG' }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const extracted = await analyzeFactura(bytes, file.type)

  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  const details = [extracted?.furnizor, extracted?.suma != null ? `${extracted.suma}RON` : null].filter(Boolean).join('_')
  const fileName = `${safeFilePart(details, 'factura')}_${Date.now()}.${extension}`
  const path = `${firmaId}/facturi-asteptate/${fileName}`

  const sb = getServiceSupabase()
  const { error: storageError } = await sb.storage.from('documente').upload(path, bytes, { contentType: file.type })
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

  const { data, error } = await sb.from('facturi_asteptate').insert({
    firma_id: firmaId,
    fisier_path: path,
    fisier_nume: fileName,
    fisier_tip: file.type,
    furnizor: extracted?.furnizor || null,
    suma: extracted?.suma ?? null,
    data_factura: extracted?.dataFactura || null,
  }).select('id,fisier_nume,fisier_tip,furnizor,suma,data_factura,status,tranzactie_id,created_at').single()

  if (error) {
    await sb.storage.from('documente').remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ factura: data })
}

export async function PATCH(req: NextRequest) {
  const { id, fisier_nume, furnizor, suma, data_factura } = await req.json()
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof fisier_nume === 'string' && fisier_nume.trim()) patch.fisier_nume = fisier_nume.trim()
  if (typeof furnizor === 'string') patch.furnizor = furnizor.trim() || null
  if (suma === null || typeof suma === 'number') patch.suma = suma
  if (data_factura === null || (typeof data_factura === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data_factura))) patch.data_factura = data_factura
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Niciun câmp de actualizat' }, { status: 400 })

  const sb = getServiceSupabase()
  const { error } = await sb.from('facturi_asteptate').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id lipsește' }, { status: 400 })

  const sb = getServiceSupabase()
  const { data: doc } = await sb.from('facturi_asteptate').select('fisier_path').eq('id', id).single()
  if (doc?.fisier_path) await sb.storage.from('documente').remove([doc.fisier_path])

  const { error } = await sb.from('facturi_asteptate').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

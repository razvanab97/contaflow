import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { getServiceSupabase } from '@/lib/supabase/server'
import { CAMPURI, citesteActe, dataDinCnp, scrieActe, type ActPersonal } from '@/lib/acte-personale'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Acte personale (Dashboard): lista, descarcare, adaugare cu citire AI, corectare campuri, stergere.
const MODEL = process.env.PROIECT_AI_MODEL || 'claude-sonnet-5'
const TIPURI = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const DATA = /^\d{4}-\d{2}-\d{2}$/

const PROMPT = `Documentul atașat e un act de identitate (carte de identitate, pașaport sau permis de conducere). Citește datele de pe el.
Răspunde DOAR cu JSON: {"tip":"Carte de identitate","nume":"","prenume":"","cnp":"","serie":"","numar":"","data_nasterii":"AAAA-LL-ZZ","sex":"M","cetatenie":"","loc_nastere":"","domiciliu":"","emis_de":"","valabil_de":"AAAA-LL-ZZ","valabil_pana":"AAAA-LL-ZZ"}
- Scrie textul exact ca pe act, cu diacritice (ex. "ANDREI-RĂZVAN", "Jud.IS Orș.Târgu Frumos"); anul scurt "23" = 2023.
- Câmp ilizibil sau inexistent = null. Nu inventa.`

async function citesteCuAi(bytes: Buffer, tip: string): Promise<Partial<ActPersonal>> {
  if (!process.env.ANTHROPIC_API_KEY) return {}
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const sursa = tip === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: bytes.toString('base64') } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: tip as 'image/jpeg' | 'image/png', data: bytes.toString('base64') } }
  const r = await client.messages.create({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content: [sursa, { type: 'text', text: PROMPT }] }] })
  const raw = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
  try { return curata(JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')) } catch { return {} }
}

function curata(o: Record<string, unknown>): Partial<ActPersonal> {
  const out: Record<string, string | null> = {}
  for (const k of CAMPURI) {
    if (!(k in o)) continue
    const v = o[k] == null ? null : String(o[k]).trim().slice(0, 300) || null
    out[k] = ['data_nasterii', 'valabil_de', 'valabil_pana'].includes(k) ? (v && DATA.test(v) ? v : null) : v
  }
  if (out.cnp) out.cnp = out.cnp.replace(/\D/g, '') || null
  return out as Partial<ActPersonal>
}

export async function GET(req: NextRequest) {
  const sb = getServiceSupabase()
  const acte = await citesteActe(sb)
  const id = req.nextUrl.searchParams.get('download')
  if (id) {
    const a = acte.find(x => x.id === id)
    if (!a) return NextResponse.json({ error: 'Act negăsit' }, { status: 404 })
    const { data, error } = await sb.storage.from('documente').download(a.fisier_path)
    if (error || !data) return NextResponse.json({ error: 'Fișierul nu a putut fi descărcat' }, { status: 500 })
    const inline = req.nextUrl.searchParams.get('preview') === '1'
    const ascii = a.fisier_nume.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')
    return new NextResponse(Buffer.from(await data.arrayBuffer()), { headers: { 'Content-Type': a.fisier_tip, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.fisier_nume)}`, 'Cache-Control': 'private, no-store' } })
  }
  return NextResponse.json({ acte }, { headers: { 'Cache-Control': 'private, no-store' } })
}

// Adauga un act: fisierul + datele citite de AI (sau trimise in campul `date`, JSON)
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file')
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'Alege fișierul actului' }, { status: 400 })
  if (!TIPURI.has(file.type)) return NextResponse.json({ error: 'Doar PDF, JPG sau PNG' }, { status: 400 })
  const sb = getServiceSupabase()
  const bytes = Buffer.from(await file.arrayBuffer())
  let date: Partial<ActPersonal> = {}
  try { date = fd.get('date') ? curata(JSON.parse(String(fd.get('date')))) : await citesteCuAi(bytes, file.type) }
  catch (e) { return NextResponse.json({ error: 'AI nu a putut citi actul: ' + (e instanceof Error ? e.message : String(e)) }, { status: 502 }) }

  const id = randomUUID()
  const path = `acte-personale/${id}_${file.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80)}`
  const { error } = await sb.storage.from('documente').upload(path, bytes, { contentType: file.type })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const act: ActPersonal = {
    id, tip: date.tip || 'Carte de identitate', nume: null, prenume: null, cnp: null, serie: null, numar: null, data_nasterii: null, sex: null, cetatenie: null,
    loc_nastere: null, domiciliu: null, emis_de: null, valabil_de: null, valabil_pana: null, ...date,
    fisier_path: path, fisier_nume: file.name, fisier_tip: file.type, created_at: new Date().toISOString(),
  }
  act.data_nasterii ||= dataDinCnp(act.cnp)
  try { await scrieActe(sb, [...await citesteActe(sb), act]) }
  catch (e) { await sb.storage.from('documente').remove([path]); return NextResponse.json({ error: String(e) }, { status: 500 }) }
  return NextResponse.json({ act })
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const sb = getServiceSupabase()
  const acte = await citesteActe(sb)
  const i = acte.findIndex(a => a.id === b.id)
  if (i < 0) return NextResponse.json({ error: 'Act negăsit' }, { status: 404 })
  acte[i] = { ...acte[i], ...curata(b) }
  await scrieActe(sb, acte)
  return NextResponse.json({ act: acte[i] })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const sb = getServiceSupabase()
  const acte = await citesteActe(sb)
  const a = acte.find(x => x.id === id)
  if (!a) return NextResponse.json({ error: 'Act negăsit' }, { status: 404 })
  await scrieActe(sb, acte.filter(x => x.id !== id))
  await sb.storage.from('documente').remove([a.fisier_path])
  return NextResponse.json({ ok: true })
}

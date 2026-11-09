import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { PROMPT_COMANDA, emitentImplicit } from '@/lib/comenzi-marketplace'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Citeste o comanda marketplace (captura / PDF / text lipit) si intoarce sub-comenzile, fara sa salveze nimic -
// utilizatorul le verifica in pagina inainte de salvare.
const MODEL = process.env.PROIECT_AI_MODEL || 'claude-sonnet-5'
const TIPURI = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY lipsește.' }, { status: 500 })
  const fd = await req.formData()
  const file = fd.get('file'), text = String(fd.get('text') || '').trim()
  const continut: Anthropic.ContentBlockParam[] = []
  if (file instanceof File && file.size) {
    if (!TIPURI.has(file.type)) return NextResponse.json({ error: 'Doar PDF, JPG, PNG sau WEBP' }, { status: 400 })
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'Fișier mai mare de 15 MB' }, { status: 400 })
    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    continut.push(file.type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
      : { type: 'image', source: { type: 'base64', media_type: file.type as 'image/png', data: b64 } })
  }
  if (text) continut.push({ type: 'text', text: `Textul comenzii:\n${text.slice(0, 20000)}` })
  if (!continut.length) return NextResponse.json({ error: 'Încarcă o captură / PDF sau lipește textul comenzii' }, { status: 400 })
  continut.push({ type: 'text', text: PROMPT_COMANDA })

  try {
    const r = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content: continut }] })
    const raw = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')
    const linii = (Array.isArray(j.linii) ? j.linii : []).map((l: Record<string, unknown>) => ({
      vanzator: String(l.vanzator || '').trim(), emitent: l.emitent ? String(l.emitent) : emitentImplicit(String(l.vanzator || '')),
      subtotal: Math.round(Number(l.subtotal) * 100) / 100, stare: l.stare === 'anulata' ? 'anulata' : 'asteptata',
      produse: l.produse ? String(l.produse).slice(0, 200) : null, nota: l.nota ? String(l.nota).slice(0, 200) : null,
    })).filter((l: { vanzator: string; subtotal: number }) => l.vanzator && Number.isFinite(l.subtotal) && l.subtotal > 0)
    if (!linii.length) return NextResponse.json({ error: 'Nu am găsit vânzători și subtotaluri în comandă' }, { status: 422 })
    return NextResponse.json({
      platforma: j.platforma ? String(j.platforma) : 'Marketplace', numar_comanda: j.numar_comanda ? String(j.numar_comanda) : null,
      data_comanda: /^\d{4}-\d{2}-\d{2}$/.test(String(j.data_comanda)) ? j.data_comanda : null,
      total: Number.isFinite(Number(j.total)) ? Math.round(Number(j.total) * 100) / 100 : null, valuta: j.valuta ? String(j.valuta).toUpperCase().slice(0, 3) : 'RON', linii,
    })
  } catch (e) {
    return NextResponse.json({ error: 'AI nu a putut citi comanda: ' + (e instanceof Error ? e.message : String(e)) }, { status: 502 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { getServiceSupabase } from '@/lib/supabase/server'
import { BUGET_INTEGRAL } from '@/lib/proiect-buget-date'
import { MODEL_PROIECT } from '@/lib/proiect-intreaba'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TIPURI = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const LINII = BUGET_INTEGRAL.map(l => `${l.cod} | ${l.denumire} | ${l.valoare} lei${l.cofinantare && !l.subventie ? ' | cofinanțare' : l.subventie && !l.cofinantare ? ' | subvenție' : ' | 90% subvenție / 10% cofinanțare'}`).join('\n')

const PROMPT = `Documentul atașat e un ordin de plată (OP), o confirmare de plată sau un extras de cont al firmei AB TEXTILE S.R.L., pentru proiectul european PROSOCIAL. Extrage fiecare plată EFECTUATĂ (debit) din document.

Pentru fiecare plată alege linia din bugetul proiectului de mai jos căreia îi aparține (după beneficiar și explicație: salariul unei persoane -> linia de salariu net; contribuții/impozite pe salarii către bugetul de stat -> liniile de contribuții; chirie -> 5.1; contabilitate -> 3.1; furnizorul unui echipament -> linia echipamentului). Dacă nu e clar, pune linie_cod null - nu ghici.
Pentru salarii și contribuții (4 persoane cu sume egale în buget): manager = Abunei Elena (1.1.1 / 1.3.1), asistent manager = Abunei Andrei Răzvan (1.1.2 / 1.3.2), lucrători = Vasilache Florentina (1.1.3 / 1.3.3), Nicorici Mihaela (1.1.4 / 1.3.4).

BUGETUL (cod | denumire | valoare | sursă):
${LINII}

Răspunde DOAR cu JSON: {"plati":[{"data":"AAAA-LL-ZZ","suma":1234.56,"beneficiar":"...","descriere":"explicația din OP","linie_cod":"1.1.1"|null,"sursa":"subventie"|"cofinantare"|null,"incredere":"sigur"|"posibil","motiv":"de ce această linie, scurt"}]}
- suma = suma plătită, în lei, număr (1.234,56 -> 1234.56). Ignoră încasările (credit) și comisioanele bancare.
- sursa: "subventie" dacă plata e din contul de subvenție/grant, "cofinantare" dacă e din contul curent/propriu și documentul arată asta; altfel null.
- Nu inventa: un câmp ilizibil = null.`

async function extrage(client: Anthropic, bytes: Buffer, tip: string) {
  const source = tip === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: bytes.toString('base64') } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: tip as 'image/jpeg' | 'image/png', data: bytes.toString('base64') } }
  const r = await client.messages.create({ model: MODEL_PROIECT, max_tokens: 4000, messages: [{ role: 'user', content: [source, { type: 'text', text: PROMPT }] }] })
  const raw = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
  try { const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}'); return Array.isArray(j.plati) ? j.plati : [] } catch { return [] }
}

// Incarca OP-urile si intoarce propunerile de plati (nu salveaza plati - utilizatorul le confirma in pagina).
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY lipsește.' }, { status: 500 })
  const fd = await req.formData()
  const firmaId = String(fd.get('firmaId') || '')
  const files = fd.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)
  if (!firmaId || !files.length) return NextResponse.json({ error: 'Alege cel puțin un OP.' }, { status: 400 })
  const sb = getServiceSupabase(), client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const rezultate = await Promise.all(files.slice(0, 20).map(async file => {
    if (!TIPURI.has(file.type)) return { fisier_nume: file.name, eroare: 'Doar PDF, JPG sau PNG.' }
    if (file.size > 10 * 1024 * 1024) return { fisier_nume: file.name, eroare: 'Fișier mai mare de 10 MB.' }
    const bytes = Buffer.from(await file.arrayBuffer())
    const path = `${firmaId}/proiect-plati/${randomUUID()}_${file.name.replace(/[^\w.-]+/g, '_').slice(-80)}`
    const { error } = await sb.storage.from('documente').upload(path, bytes, { contentType: file.type })
    if (error) return { fisier_nume: file.name, eroare: 'Încărcarea a eșuat: ' + error.message }
    try {
      const plati = (await extrage(client, bytes, file.type)).map((p: Record<string, unknown>) => ({
        data: /^\d{4}-\d{2}-\d{2}$/.test(String(p.data)) ? p.data : null,
        suma: Number.isFinite(Number(p.suma)) ? Math.round(Number(p.suma) * 100) / 100 : null,
        beneficiar: p.beneficiar || null, descriere: p.descriere || null,
        linie_cod: BUGET_INTEGRAL.some(l => l.cod === p.linie_cod) ? p.linie_cod : null,
        sursa: p.sursa === 'subventie' || p.sursa === 'cofinantare' ? p.sursa : null,
        incredere: p.incredere === 'sigur' ? 'sigur' : 'posibil', motiv: p.motiv || null,
      }))
      return { fisier_nume: file.name, fisier_path: path, plati }
    } catch (e) {
      return { fisier_nume: file.name, fisier_path: path, plati: [], eroare: 'AI nu a putut citi OP-ul: ' + (e instanceof Error ? e.message : String(e)) }
    }
  }))
  return NextResponse.json({ rezultate })
}

// Deschide OP-ul salvat al unei plati.
export async function GET(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId') || '', path = req.nextUrl.searchParams.get('path') || ''
  if (!firmaId || !path.startsWith(`${firmaId}/proiect-plati/`)) return NextResponse.json({ error: 'Fișier invalid' }, { status: 400 })
  const { data, error } = await getServiceSupabase().storage.from('documente').download(path)
  if (error || !data) return NextResponse.json({ error: 'OP-ul nu a fost găsit' }, { status: 404 })
  const nume = path.split('/').pop()!.replace(/^[0-9a-f-]{36}_/, '')
  return new NextResponse(Buffer.from(await data.arrayBuffer()), { headers: { 'Content-Type': data.type || 'application/pdf', 'Content-Disposition': `inline; filename="${nume}"` } })
}

// Sterge un OP incarcat dar renuntat (doar daca nicio plata nu il foloseste).
export async function DELETE(req: NextRequest) {
  const firmaId = req.nextUrl.searchParams.get('firmaId') || '', path = req.nextUrl.searchParams.get('path') || ''
  if (!firmaId || !path.startsWith(`${firmaId}/proiect-plati/`)) return NextResponse.json({ error: 'Fișier invalid' }, { status: 400 })
  const sb = getServiceSupabase()
  const { count } = await sb.from('proiect_plati').select('id', { count: 'exact', head: true }).eq('fisier_path', path)
  if (!count) await sb.storage.from('documente').remove([path])
  return NextResponse.json({ ok: true })
}

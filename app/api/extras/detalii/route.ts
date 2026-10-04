import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '@/lib/supabase/server'
import { pdfPageCount, extractPageRange } from '@/lib/pdfBatch'

export const maxDuration = 60
const PAGINI_PE_APEL = 1

const PROMPT = `Extrage TOATE tranzactiile din aceste pagini de extras de cont, cu textul lor complet.
Returneaza DOAR JSON: {"tranzactii":[{"data_tranzactie":"2026-09-07","suma":400.06,"tip":"debit","descriere":"Plata la POS non-BT cu card VISA POS 05/09/2026 2642OM1130 TID:ORO2454B OMV 1130 Iasi RO ..."}]}
"descriere" = TOT textul tranzactiei, exact cum apare, toate randurile lipite cu spatiu (tipul operatiei, data POS, comerciant, oras, TID, nr. comanda, cod plata, IBAN, detalii) - fara randul "REF:".
"data_tranzactie" = data randului din extras (coloana de data a zilei), format AAAA-LL-ZZ; daca pagina incepe cu tranzactii fara data scrisa, foloseste data ultimei zile vizibile.
"suma" = valoarea pozitiva; "tip" = debit pentru plati/iesiri, credit pentru incasari.
Exclude randurile RULAJ ZI, SOLD FINAL, SOLD ANTERIOR, SOLD INITIAL.`

type Rand = { data_tranzactie: string; suma: number; tip: 'debit' | 'credit'; descriere: string }

function extractRows(raw: string): Rand[] {
  const m = raw.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      const parsed = JSON.parse(m[0])
      if (Array.isArray(parsed?.tranzactii)) return parsed.tranzactii
    } catch { /* JSON trunchiat - recuperam obiectele complete mai jos */ }
  }
  const out: Rand[] = []
  for (const o of raw.matchAll(/\{[^{}]*"data_tranzactie"[^{}]*\}/g)) {
    try { out.push(JSON.parse(o[0])) } catch {}
  }
  return out
}

// Completeaza textul complet din extras (comerciant, oras, nr. comanda, cod plata, IBAN) pe
// tranzactiile unui extras PDF importat inainte ca importul sa-l pastreze - recitind PDF-ul salvat.
// NU sterge si NU reimporta nimic: doar actualizeaza `descriere` pe tranzactiile existente, potrivite
// dupa data + suma + tip (in ordine, pentru tranzactiile identice), deci asocierile raman intacte.
// Sunt atinse doar tranzactiile fara detalii (descriere == descriere_curatata).
export async function POST(req: NextRequest) {
  const { extrasId } = await req.json().catch(() => ({}))
  if (!extrasId) return NextResponse.json({ error: 'extrasId lipsește' }, { status: 400 })
  const sb = getServiceSupabase()

  const { data: extras } = await sb.from('extrase').select('id,pdf_path').eq('id', String(extrasId)).single()
  if (!extras?.pdf_path) return NextResponse.json({ error: 'Extrasul nu are PDF salvat' }, { status: 404 })
  const { data: txs } = await sb.from('tranzactii')
    .select('id,data_tranzactie,suma,tip,descriere,descriere_curatata')
    .eq('extras_id', extras.id)
    .order('data_tranzactie').order('id')
  const fara = (txs || []).filter(t => !t.descriere || t.descriere === t.descriere_curatata)
  if (!fara.length) return NextResponse.json({ ok: true, actualizate: 0, total: txs?.length || 0 })

  const { data: blob, error: dlErr } = await sb.storage.from('extrase-pdf').download(extras.pdf_path)
  if (dlErr || !blob) return NextResponse.json({ error: dlErr?.message || 'PDF-ul nu a putut fi citit' }, { status: 500 })
  const buf = Buffer.from(await blob.arrayBuffer())

  // Textul complet al ~90 de tranzactii intr-un singur apel AI dureaza ~80s - peste limita de 60s a
  // functiei. Il citim pe bucati de cate PAGINI_PE_APEL pagini, in paralel; ordinea se pastreaza.
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const pagini = await pdfPageCount(buf).catch(() => 1)
  const bucati: Buffer[] = []
  for (let p = 1; p <= pagini; p += PAGINI_PE_APEL) bucati.push(pagini <= PAGINI_PE_APEL ? buf : await extractPageRange(buf, p, p + PAGINI_PE_APEL - 1))
  const rezultate = await Promise.all(bucati.map(async bucata => {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bucata.toString('base64') } },
        { type: 'text', text: PROMPT },
      ] }],
    })
    return extractRows(response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join(''))
  }))
  const randuri = rezultate.flat().filter(r => r?.data_tranzactie && r.suma != null && r.descriere)

  // Potrivire in ordine pe cheia data|suma|tip - doua plati identice in aceeasi zi primesc pe rand
  // cele doua texte din extras.
  const cheie = (d: string, s: number, t: string) => `${String(d).slice(0, 10)}|${Math.abs(Number(s)).toFixed(2)}|${t}`
  const coada = new Map<string, string[]>()
  for (const r of randuri) {
    const k = cheie(r.data_tranzactie, r.suma, r.tip)
    coada.set(k, [...(coada.get(k) || []), String(r.descriere).replace(/\s+/g, ' ').trim()])
  }
  let actualizate = 0
  for (const t of txs || []) {
    const k = cheie(t.data_tranzactie, t.suma, t.tip)
    const text = coada.get(k)?.shift()
    if (!text || !fara.some(f => f.id === t.id) || text === t.descriere) continue
    const { error } = await sb.from('tranzactii').update({ descriere: text }).eq('id', t.id)
    if (!error) actualizate++
  }
  return NextResponse.json({ ok: true, actualizate, total: txs?.length || 0, citite: randuri.length })
}

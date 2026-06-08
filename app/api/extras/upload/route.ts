import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'
const SBH = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function sbPost(path: string, body: object) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method: 'POST', headers: { ...SBH, 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  })
  const t = await r.text()
  try { const d = JSON.parse(t); return { ok: r.ok, data: Array.isArray(d) ? d[0] : d } }
  catch { return { ok: false, data: t } }
}

async function sbDelete(path: string) {
  await fetch(`${SB}/rest/v1/${path}`, { method: 'DELETE', headers: SBH })
}

async function sbGet(path: string) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: SBH })
  return r.ok ? r.json() : []
}

// Extrage obiecte JSON complete dintr-un text partial
function extractObjects(text: string): any[] {
  const results: any[] = []
  let i = 0
  while (i < text.length) {
    if (text[i] !== '{') { i++; continue }
    let depth = 0, j = i
    while (j < text.length) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') { depth--; if (depth === 0) break }
      j++
    }
    if (depth === 0) {
      try {
        const obj = JSON.parse(text.slice(i, j + 1))
        if (obj.data_tranzactie && obj.suma !== undefined && obj.tip) results.push(obj)
      } catch {}
      i = j + 1
    } else break
  }
  return results
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('pdf') as File
    const firmaId = fd.get('firmaId') as string
    const lunaId = fd.get('lunaId') as string
    const selectedValuta = String(fd.get('valuta') || '').toUpperCase()

    if (!file || !firmaId || !lunaId)
      return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    // AI - folosim Haiku (de 10x mai ieftin decat Opus)
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } },
          { type: 'text', text: `Extrage TOATE tranzactiile din acest extras de cont bancar roman.
Returneaza DOAR JSON, fara text extra, fara markdown:
{"iban":"RO...","valuta":"RON","sold_final":275.54,"tranzactii":[{"data_tranzactie":"2026-05-04","descriere_curatata":"Trendyol plata","tip":"credit","suma":300.15,"valuta":"RON","categorie":"client"}]}
Categorii: client|furnizor|taxa|angajat|transfer|comision|banca|altele
Exclude randurile: RULAJ ZI, SOLD FINAL, SOLD ANTERIOR, SOLD INITIAL.` }
        ]
      }]
    })

    const raw = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')

    // Parse robust - functioneaza si daca JSON e trunchiat
    let tranzactii: any[] = []
    let iban = '', soldFinal = null, detectedValuta = ''

    // Incearca parse complet
    const fullMatch = raw.match(/\{[\s\S]*\}/)
    if (fullMatch) {
      try {
        const parsed = JSON.parse(fullMatch[0])
        tranzactii = parsed.tranzactii || []
        iban = parsed.iban || ''
        soldFinal = parsed.sold_final || null
        detectedValuta = String(parsed.valuta || '').toUpperCase()
      } catch {
        // JSON trunchiat - extrage obiectele complete manual
        tranzactii = extractObjects(raw)
        const ibanM = raw.match(/"iban"\s*:\s*"([^"]+)"/)
        if (ibanM) iban = ibanM[1]
        const soldM = raw.match(/"sold_final"\s*:\s*([\d.]+)/)
        if (soldM) soldFinal = parseFloat(soldM[1])
        const valutaM = raw.match(/"valuta"\s*:\s*"([^"]+)"/)
        if (valutaM) detectedValuta = valutaM[1].toUpperCase()
      }
    }

    if (tranzactii.length === 0)
      return NextResponse.json({ error: `Nicio tranzactie extrasa. Preview AI: ${raw.slice(0, 200)}` }, { status: 500 })

    const valuta = selectedValuta && selectedValuta !== 'AUTO'
      ? selectedValuta
      : detectedValuta || String(tranzactii[0]?.valuta || 'RON').toUpperCase()
    const storagePath = `${firmaId}/${lunaId}/${valuta}_${Date.now()}.pdf`
    const upRes = await fetch(`${SB}/storage/v1/object/extrase-pdf/${storagePath}`, {
      method: 'POST',
      headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
      body: buf
    })
    if (!upRes.ok) return NextResponse.json({ error: 'Storage: ' + await upRes.text() }, { status: 500 })

    // Sterge vechi
    const old = await sbGet(`extrase?luna_id=eq.${lunaId}&valuta=eq.${valuta}&select=id`)
    for (const e of old) await sbDelete(`tranzactii?extras_id=eq.${e.id}`)
    if (old.length > 0) await sbDelete(`extrase?id=in.(${old.map((e: any) => e.id).join(',')})`)

    // Insereaza extras
    const { ok: eOk, data: extras } = await sbPost('extrase', {
      firma_id: firmaId, luna_id: lunaId,
      valuta: valuta, iban: iban || null, sold_final: soldFinal,
      pdf_path: storagePath, pdf_nume: file.name,
      procesat_ai: true, nr_tranzactii: tranzactii.length, nr_documentate: 0,
    })

    if (!eOk || !extras?.id)
      return NextResponse.json({ error: 'DB extras: ' + JSON.stringify(extras) }, { status: 500 })

    // Insereaza tranzactii in batches de 25
    for (let i = 0; i < tranzactii.length; i += 25) {
      const batch = tranzactii.slice(i, i + 25).map((t: any) => ({
        extras_id: extras.id, firma_id: firmaId,
        data_tranzactie: t.data_tranzactie,
        descriere: t.descriere || t.descriere_curatata || '',
        descriere_curatata: t.descriere_curatata || t.descriere || '',
        tip: t.tip, suma: Number(t.suma),
        valuta: t.valuta || valuta,
        referinta: t.referinta || null,
        categorie: t.categorie || 'altele',
      }))
      const r = await fetch(`${SB}/rest/v1/tranzactii`, {
        method: 'POST', headers: { ...SBH, 'Prefer': 'return=minimal' },
        body: JSON.stringify(batch)
      })
      if (!r.ok) return NextResponse.json({ error: `Batch ${i}: ${await r.text()}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true, extrasId: extras.id, count: tranzactii.length, valuta })

  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

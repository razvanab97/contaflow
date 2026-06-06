import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SB_H = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }

async function sbGet(path: string) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: SB_H })
  return r.ok ? r.json() : []
}

async function sbPost(path: string, body: object) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...SB_H, 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  })
  const text = await r.text()
  try { return { ok: r.ok, data: JSON.parse(text) } }
  catch { return { ok: r.ok, data: text } }
}

async function sbDelete(path: string) {
  await fetch(`${SB}/rest/v1/${path}`, { method: 'DELETE', headers: SB_H })
}

async function sbPatch(path: string, body: object) {
  await fetch(`${SB}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...SB_H, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body)
  })
}

async function storageUpload(bucket: string, path: string, buf: Buffer, contentType: string) {
  const r = await fetch(`${SB}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true'
    },
    body: buf
  })
  const text = await r.text()
  return { ok: r.ok, error: r.ok ? null : text }
}

export async function POST(req: NextRequest) {
  const logs: string[] = []

  try {
    logs.push('1. Parsing form data')
    const fd = await req.formData()
    const file = fd.get('pdf') as File
    const firmaId = fd.get('firmaId') as string
    const lunaId = fd.get('lunaId') as string
    const valuta = fd.get('valuta') as string

    if (!file || !firmaId || !lunaId || !valuta) {
      return NextResponse.json({ error: 'Date lipsă', logs }, { status: 400 })
    }

    logs.push(`2. File: ${file.name} (${file.size} bytes), valuta: ${valuta}`)

    const buf = Buffer.from(await file.arrayBuffer())
    logs.push(`3. Buffer size: ${buf.length}`)

    // Upload PDF to storage
    const storagePath = `${firmaId}/${lunaId}/${valuta}_${Date.now()}.pdf`
    logs.push(`4. Uploading to storage: ${storagePath}`)
    const { ok: upOk, error: upErr } = await storageUpload('extrase-pdf', storagePath, buf, 'application/pdf')
    if (!upOk) {
      return NextResponse.json({ error: `Storage upload failed: ${upErr}`, logs }, { status: 500 })
    }
    logs.push('5. Storage upload OK')

    // AI Extract
    logs.push('6. Starting AI extraction...')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const pdfBase64 = buf.toString('base64')

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
          },
          {
            type: 'text',
            text: `Extrage toate tranzacțiile din acest extras de cont bancar românesc.
Returnează DOAR JSON valid, fără text extra, fără markdown, fără explicații.
Structura exactă:
{
  "iban": "RO...",
  "valuta": "RON",
  "numar_extras": "5",
  "perioada_start": "2026-05-01",
  "perioada_end": "2026-05-31",
  "sold_initial": 24.80,
  "sold_final": 275.54,
  "total_debit": 21489.36,
  "total_credit": 21740.10,
  "tranzactii": [
    {
      "data_tranzactie": "2026-05-04",
      "descriere": "descriere originala din extras",
      "descriere_curatata": "Trendyol plata marketplace",
      "tip": "credit",
      "suma": 300.15,
      "valuta": "RON",
      "referinta": "REF123",
      "categorie": "client"
    }
  ]
}
Categorii posibile: client | furnizor | taxa | angajat | transfer | comision | banca | altele
NU include randurile RULAJ ZI, SOLD FINAL, SOLD ANTERIOR - doar tranzactiile efective.`
          }
        ]
      }]
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    logs.push(`7. AI response length: ${text.length} chars`)

    // Extract JSON
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      return NextResponse.json({ error: 'AI nu a returnat JSON valid. Răspuns: ' + text.slice(0, 200), logs }, { status: 500 })
    }

    let info: any
    try {
      info = JSON.parse(match[0])
    } catch (e) {
      return NextResponse.json({ error: 'JSON parse error: ' + String(e), logs }, { status: 500 })
    }

    logs.push(`8. Parsed ${info.tranzactii?.length || 0} tranzactii`)

    // Delete old
    logs.push('9. Deleting old extras...')
    const oldExtrase = await sbGet(`extrase?luna_id=eq.${lunaId}&valuta=eq.${valuta}&select=id`)
    for (const e of oldExtrase) {
      await sbDelete(`tranzactii?extras_id=eq.${e.id}`)
    }
    if (oldExtrase.length > 0) {
      const ids = oldExtrase.map((e: {id:string}) => e.id).join(',')
      await sbDelete(`extrase?id=in.(${ids})`)
    }
    logs.push(`10. Deleted ${oldExtrase.length} old extras`)

    // Insert new extras
    logs.push('11. Inserting new extras...')
    const { ok: eOk, data: eData } = await sbPost('extrase', {
      firma_id: firmaId,
      luna_id: lunaId,
      valuta: info.valuta || valuta,
      iban: info.iban || null,
      numar_extras: info.numar_extras || null,
      perioada_start: info.perioada_start || null,
      perioada_end: info.perioada_end || null,
      sold_initial: info.sold_initial || null,
      sold_final: info.sold_final || null,
      total_debit: info.total_debit || null,
      total_credit: info.total_credit || null,
      pdf_path: storagePath,
      pdf_nume: file.name,
      procesat_ai: true,
      nr_tranzactii: info.tranzactii?.length || 0,
      nr_documentate: 0,
    })

    if (!eOk) {
      return NextResponse.json({ error: 'DB extras insert failed: ' + JSON.stringify(eData), logs }, { status: 500 })
    }

    const extras = Array.isArray(eData) ? eData[0] : eData
    if (!extras?.id) {
      return NextResponse.json({ error: 'Extras ID missing after insert: ' + JSON.stringify(eData), logs }, { status: 500 })
    }

    logs.push(`12. Extras inserted: ${extras.id}`)

    // Insert tranzactii
    const txs = (info.tranzactii || []).map((t: any) => ({
      extras_id: extras.id,
      firma_id: firmaId,
      data_tranzactie: t.data_tranzactie,
      descriere: t.descriere,
      descriere_curatata: t.descriere_curatata,
      tip: t.tip,
      suma: t.suma,
      valuta: t.valuta || info.valuta || valuta,
      referinta: t.referinta || null,
      categorie: t.categorie || 'altele',
    }))

    logs.push(`13. Inserting ${txs.length} tranzactii in batches...`)

    for (let i = 0; i < txs.length; i += 20) {
      const batch = txs.slice(i, i + 20)
      const r = await fetch(`${SB}/rest/v1/tranzactii`, {
        method: 'POST',
        headers: { ...SB_H, 'Prefer': 'return=minimal' },
        body: JSON.stringify(batch)
      })
      if (!r.ok) {
        const errText = await r.text()
        return NextResponse.json({ error: `Batch ${i}-${i+20} failed: ${errText}`, logs }, { status: 500 })
      }
      logs.push(`  Batch ${i}-${Math.min(i+20, txs.length)} OK`)
    }

    logs.push('14. ALL DONE')

    return NextResponse.json({
      ok: true,
      extrasId: extras.id,
      count: txs.length,
      logs
    })

  } catch (e: any) {
    return NextResponse.json({
      error: 'Unexpected error: ' + String(e),
      stack: e?.stack?.slice(0, 500),
      logs
    }, { status: 500 })
  }
}

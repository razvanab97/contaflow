import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SBH = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function sbPost(path: string, body: object) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method: 'POST', headers: { ...SBH, 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  })
  const text = await r.text()
  try { const d = JSON.parse(text); return { ok: r.ok, data: Array.isArray(d) ? d[0] : d } }
  catch { return { ok: false, data: text } }
}

async function sbDelete(path: string) {
  await fetch(`${SB}/rest/v1/${path}`, { method: 'DELETE', headers: SBH })
}

async function sbGet(path: string) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: SBH })
  return r.ok ? r.json() : []
}

async function storageUpload(bucket: string, path: string, buf: Buffer, ct: string) {
  const r = await fetch(`${SB}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': ct, 'x-upsert': 'true' },
    body: buf
  })
  return r.ok ? null : await r.text()
}

async function extractChunk(client: Anthropic, pdfBase64: string, pageHint: string): Promise<any[]> {
  const resp = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        {
          type: 'text',
          text: `Din acest extras de cont bancar românesc, extrage DOAR tranzacțiile de pe ${pageHint}.
Returnează DOAR un array JSON valid, fără text extra, fără markdown.
Format exact:
[{"data_tranzactie":"2026-05-04","descriere":"descriere originala","descriere_curatata":"Trendyol plata","tip":"credit","suma":300.15,"valuta":"RON","referinta":"REF123","categorie":"client"}]
Categorii: client|furnizor|taxa|angajat|transfer|comision|banca|altele
NU include RULAJ ZI, SOLD FINAL, SOLD ANTERIOR.
Dacă nu există tranzacții pe aceste pagini, returnează [].`
        }
      ]
    }]
  })

  const text = resp.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  try { return JSON.parse(match[0]) } catch { return [] }
}

async function extractHeader(client: Anthropic, pdfBase64: string): Promise<any> {
  const resp = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        {
          type: 'text',
          text: `Din acest extras de cont, extrage DOAR informațiile de header (nu tranzacțiile).
Returnează DOAR JSON valid:
{"iban":"RO...","valuta":"RON","numar_extras":"5","perioada_start":"2026-05-01","perioada_end":"2026-05-31","sold_initial":24.80,"sold_final":275.54,"total_debit":21489.36,"total_credit":21740.10}`
        }
      ]
    }]
  })
  const text = resp.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
  const match = text.match(/\{[\s\S]*?\}/)
  try { return match ? JSON.parse(match[0]) : {} } catch { return {} }
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('pdf') as File
    const firmaId = fd.get('firmaId') as string
    const lunaId = fd.get('lunaId') as string
    const valuta = fd.get('valuta') as string

    if (!file || !firmaId || !lunaId || !valuta) {
      return NextResponse.json({ error: 'Date lipsă' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const storagePath = `${firmaId}/${lunaId}/${valuta}_${Date.now()}.pdf`

    // 1. Upload PDF
    const upErr = await storageUpload('extrase-pdf', storagePath, buf, 'application/pdf')
    if (upErr) return NextResponse.json({ error: `Storage: ${upErr}` }, { status: 500 })

    const pdfBase64 = buf.toString('base64')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // 2. Extract header
    const header = await extractHeader(client, pdfBase64)

    // 3. Extract tranzactii in chunks by page groups
    // Extrag pagina cu pagina pentru a evita depasirea max_tokens
    const allTx: any[] = []
    const pageGroups = [
      'pagina 1',
      'pagina 2',
      'pagina 3',
      'pagina 4',
      'pagina 5',
      'paginile 6-10',
    ]

    for (const pageHint of pageGroups) {
      const chunk = await extractChunk(client, pdfBase64, pageHint)
      allTx.push(...chunk)
      // Dacă un chunk returneaza 0 rezultate si am deja tranzactii, ne oprim
      if (chunk.length === 0 && allTx.length > 0) break
    }

    // Deduplica dupa referinta sau combinatie data+suma+tip
    const seen = new Set<string>()
    const uniqueTx = allTx.filter(t => {
      const key = t.referinta || `${t.data_tranzactie}_${t.suma}_${t.tip}_${t.descriere?.slice(0,20)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // 4. Delete old
    const oldExtrase = await sbGet(`extrase?luna_id=eq.${lunaId}&valuta=eq.${valuta}&select=id`)
    for (const e of oldExtrase) await sbDelete(`tranzactii?extras_id=eq.${e.id}`)
    if (oldExtrase.length > 0) {
      await sbDelete(`extrase?id=in.(${oldExtrase.map((e: any) => e.id).join(',')})`)
    }

    // 5. Insert extras
    const { ok: eOk, data: extras } = await sbPost('extrase', {
      firma_id: firmaId, luna_id: lunaId,
      valuta: header.valuta || valuta,
      iban: header.iban || null,
      numar_extras: header.numar_extras || null,
      perioada_start: header.perioada_start || null,
      perioada_end: header.perioada_end || null,
      sold_initial: header.sold_initial || null,
      sold_final: header.sold_final || null,
      total_debit: header.total_debit || null,
      total_credit: header.total_credit || null,
      pdf_path: storagePath, pdf_nume: file.name,
      procesat_ai: true,
      nr_tranzactii: uniqueTx.length,
      nr_documentate: 0,
    })

    if (!eOk || !extras?.id) {
      return NextResponse.json({ error: 'DB extras: ' + JSON.stringify(extras) }, { status: 500 })
    }

    // 6. Insert tranzactii in batches of 20
    for (let i = 0; i < uniqueTx.length; i += 20) {
      const batch = uniqueTx.slice(i, i + 20).map((t: any) => ({
        extras_id: extras.id, firma_id: firmaId,
        data_tranzactie: t.data_tranzactie,
        descriere: t.descriere,
        descriere_curatata: t.descriere_curatata,
        tip: t.tip, suma: t.suma,
        valuta: t.valuta || header.valuta || valuta,
        referinta: t.referinta || null,
        categorie: t.categorie || 'altele',
      }))
      const r = await fetch(`${SB}/rest/v1/tranzactii`, {
        method: 'POST',
        headers: { ...SBH, 'Prefer': 'return=minimal' },
        body: JSON.stringify(batch)
      })
      if (!r.ok) return NextResponse.json({ error: `Batch ${i}: ${await r.text()}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true, extrasId: extras.id, count: uniqueTx.length })

  } catch (e: any) {
    return NextResponse.json({ error: 'Eroare: ' + String(e) }, { status: 500 })
  }
}

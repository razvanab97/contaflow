import { NextRequest, NextResponse } from 'next/server'
import { extractExtras } from '@/lib/ai/extract'

const SB = 'https://aqlmuoaaipbanjdptleg.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbG11b2FhaXBiYW5qZHB0bGVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY2NzE2OCwiZXhwIjoyMDk2MjQzMTY4fQ.VCnFDYSfxcbS9Hb9g12di7npy5plSvHpMrb6E2FEdfU'
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function dbGet(path: string) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H })
  return r.ok ? r.json() : []
}
async function dbPost(path: string, body: object) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method: 'POST', headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  })
  const d = await r.json()
  return r.ok ? { data: Array.isArray(d) ? d[0] : d, error: null } : { data: null, error: d }
}
async function dbDelete(path: string) {
  await fetch(`${SB}/rest/v1/${path}`, { method: 'DELETE', headers: H })
}
async function storageUpload(bucket: string, path: string, buf: Buffer, contentType: string) {
  const r = await fetch(`${SB}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buf
  })
  return r.ok ? { error: null } : { error: await r.text() }
}

export async function POST(req: NextRequest) {
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

  // 1. Upload PDF to storage
  const { error: upErr } = await storageUpload('extrase-pdf', storagePath, buf, 'application/pdf')
  if (upErr) return NextResponse.json({ error: `Storage: ${upErr}` }, { status: 500 })

  // 2. AI extract
  let info: Awaited<ReturnType<typeof extractExtras>>
  try {
    info = await extractExtras(buf.toString('base64'))
  } catch (e) {
    return NextResponse.json({ error: 'AI extract failed: ' + String(e) }, { status: 500 })
  }

  // 3. Delete old extras + tranzactii for same luna+valuta
  const oldExtrase = await dbGet(`extrase?luna_id=eq.${lunaId}&valuta=eq.${valuta}&select=id`)
  for (const e of oldExtrase) {
    await dbDelete(`tranzactii?extras_id=eq.${e.id}`)
  }
  if (oldExtrase.length > 0) {
    const ids = oldExtrase.map((e: {id:string}) => e.id).join(',')
    await dbDelete(`extrase?id=in.(${ids})`)
  }

  // 4. Insert new extras
  const { data: extras, error: eErr } = await dbPost('extrase', {
    firma_id: firmaId,
    luna_id: lunaId,
    valuta: info.valuta || valuta,
    iban: info.iban,
    numar_extras: info.numar_extras,
    perioada_start: info.perioada_start,
    perioada_end: info.perioada_end,
    sold_initial: info.sold_initial,
    sold_final: info.sold_final,
    total_debit: info.total_debit,
    total_credit: info.total_credit,
    pdf_path: storagePath,
    pdf_nume: file.name,
    procesat_ai: true,
    nr_tranzactii: info.tranzactii.length,
    nr_documentate: 0,
  })

  if (eErr || !extras) {
    return NextResponse.json({ error: 'DB extras: ' + JSON.stringify(eErr) }, { status: 500 })
  }

  // 5. Insert tranzactii in batches of 20
  const txs = info.tranzactii.map(t => ({
    extras_id: extras.id,
    firma_id: firmaId,
    data_tranzactie: t.data_tranzactie,
    descriere: t.descriere,
    descriere_curatata: t.descriere_curatata,
    tip: t.tip,
    suma: t.suma,
    valuta: t.valuta || info.valuta || valuta,
    referinta: t.referinta,
    categorie: t.categorie,
  }))

  // Insert in batches
  for (let i = 0; i < txs.length; i += 20) {
    const batch = txs.slice(i, i + 20)
    const r = await fetch(`${SB}/rest/v1/tranzactii`, {
      method: 'POST',
      headers: { ...H, 'Prefer': 'return=minimal' },
      body: JSON.stringify(batch)
    })
    if (!r.ok) {
      const err = await r.text()
      return NextResponse.json({ error: `Tranzactii batch ${i}: ${err}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, extrasId: extras.id, count: txs.length })
}
